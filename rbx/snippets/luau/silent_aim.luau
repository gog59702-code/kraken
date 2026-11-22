--!nocheck
-- silent_aim.luau — silent aim générique pour jeux Roblox client-side
-- Principe : la caméra ne bouge pas. On réécrit la cible là où le jeu
-- envoie son hit : argument de remote, raycast local, mouse.Hit, UnitRay.
--
-- API : getgenv().SilentAim.{ Config, SetEnabled, status, Target, Unload }

local Players    = game:GetService("Players")
local RunService = game:GetService("RunService")
local UIS        = game:GetService("UserInputService")
local Workspace  = game:GetService("Workspace")

local LocalPlayer = Players.LocalPlayer
local Camera      = Workspace.CurrentCamera
local Mouse       = LocalPlayer:GetMouse()

local Config = {
    enabled       = true,
    keybind       = Enum.KeyCode.Q,          -- toggle
    holdToAim     = nil,                     -- ex: Enum.KeyCode.E, nil = toujours
    fov           = 160,                     -- px depuis le centre de l'écran
    maxDistance   = 600,
    teamCheck     = true,
    visibleOnly   = false,
    part          = "Head",                  -- "Head" | "HumanoidRootPart"
    prediction    = 0.0,                     -- secondes de lead projectile
    spoofMouse    = true,                    -- __index mouse.Hit/Target/UnitRay
    spoofCamera   = true,                    -- Camera:ViewportPointToRay
    rewriteRemote = true,                    -- args de FireServer/InvokeServer
    rewriteVector = true,                    -- Vector3 de position de hit
    rewriteRadius = 18,                      -- studs autour du vrai hit
    drawFov       = true,
    drawLine      = true,
    color         = Color3.fromRGB(255, 90, 110),
}

local State = {
    enabled  = Config.enabled,
    holding  = true,
    bypass   = false,   -- hooks en pass-through quand on lit nos propres valeurs
    target   = nil,     -- BasePart visée
    player   = nil,
    realHit  = nil,     -- CFrame du vrai hit souris, cache par frame
    hooks    = {},
}

---------------------------------------------------------------------
-- utils
---------------------------------------------------------------------

local function partOf(player)
    local char = player.Character
    if not char then return nil end
    local hum = char:FindFirstChildOfClass("Humanoid")
    if not hum or hum.Health <= 0 then return nil end
    local root = char:FindFirstChild("HumanoidRootPart")
    local want = char:FindFirstChild(Config.part) or root
    return want, char
end

local function ally(player)
    return player.Team ~= nil and player.Team == LocalPlayer.Team
end

local function visible(part, char)
    local ignore = { LocalPlayer.Character, char }
    local hits = Camera:GetPartsObscuringTarget(
        { Camera.CFrame.Position, part.Position }, ignore)
    return #hits == 0
end

local function targetPos()
    local p = State.target
    if not p or not p.Parent then return nil end
    local pos = p.Position
    if Config.prediction > 0 then
        local ok, vel = pcall(function() return p.AssemblyLinearVelocity end)
        if ok and vel then pos = pos + vel * Config.prediction end
    end
    return pos
end

local function active()
    if not State.enabled then return false end
    if Config.holdToAim and not State.holding then return false end
    return State.target ~= nil
end

---------------------------------------------------------------------
-- sélection de cible
---------------------------------------------------------------------

local function selectTarget()
    local vp     = Camera.ViewportSize
    local center = Vector2.new(vp.X * 0.5, vp.Y * 0.5)
    local best, bestScore, bestPlayer

    for _, player in ipairs(Players:GetPlayers()) do
        if player ~= LocalPlayer
           and not (Config.teamCheck and ally(player)) then
            local part, char = partOf(player)
            if part then
                local dist = (part.Position - Camera.CFrame.Position).Magnitude
                if dist <= Config.maxDistance then
                    local sp = Camera:WorldToViewportPoint(part.Position)
                    if sp.Z > 0 then
                        local screen = Vector2.new(sp.X, sp.Y)
                        local d = (screen - center).Magnitude
                        if d <= Config.fov
                           and (not Config.visibleOnly or visible(part, char)) then
                            if not best or d < bestScore then
                                best, bestScore, bestPlayer = part, d, player
                            end
                        end
                    end
                end
            end
        end
    end

    State.target = best
    State.player = bestPlayer
end

-- lit la vraie position souris sans passer par nos hooks
local function refreshRealHit()
    State.bypass = true
    local ok, cf = pcall(function() return Mouse.Hit end)
    State.bypass = false
    State.realHit = ok and cf or nil
end

---------------------------------------------------------------------
-- hooks
---------------------------------------------------------------------

local function installHooks()
    -- 1. remotes : remplace l'instance ciblée et les Vector3 de hit
    local oldNamecall
    oldNamecall = hookmetamethod(game, "__namecall", function(self, ...)
        local method = getnamecallmethod()
        if checkcaller() or State.bypass or not Config.rewriteRemote
           or not active()
           or (method ~= "FireServer" and method ~= "InvokeServer") then
            return oldNamecall(self, ...)
        end

        local args = table.pack(...)
        local tp   = targetPos()
        local real = State.realHit and State.realHit.Position

        for i = 1, args.n do
            local v = args[i]
            local t = typeof(v)

            if t == "Instance" and v:IsA("BasePart") then
                local owner = Players:GetPlayerFromCharacter(v.Parent)
                if owner and owner ~= LocalPlayer
                   and not (Config.teamCheck and ally(owner)) then
                    args[i] = State.target
                end

            elseif t == "Vector3" and Config.rewriteVector and tp and real then
                if (v - real).Magnitude <= Config.rewriteRadius then
                    args[i] = tp
                end
            end
        end

        return oldNamecall(self, table.unpack(args, 1, args.n))
    end)
    State.hooks.namecall = { old = oldNamecall, target = game }

    -- 2. mouse : Hit / Target / UnitRay pointent vers la cible
    if Config.spoofMouse then
        local oldIndex
        oldIndex = hookmetamethod(Mouse, "__index", function(self, key)
            if State.bypass or checkcaller() or self ~= Mouse or not active() then
                return oldIndex(self, key)
            end
            local pos = targetPos()
            if not pos then return oldIndex(self, key) end

            if key == "Hit" then
                return CFrame.new(pos)
            elseif key == "Target" then
                return State.target
            elseif key == "UnitRay" then
                local origin = Camera.CFrame.Position
                return Ray.new(origin, (pos - origin).Unit)
            end
            return oldIndex(self, key)
        end)
        State.hooks.mouseIndex = { old = oldIndex, target = Mouse }
    end

    -- 3. caméra : les jeux qui construisent leur rayon depuis le curseur
    if Config.spoofCamera then
        local oldCamNamecall
        oldCamNamecall = hookmetamethod(Camera, "__namecall", function(self, ...)
            local method = getnamecallmethod()
            if State.bypass or checkcaller() or not active() then
                return oldCamNamecall(self, ...)
            end
            if method == "ViewportPointToRay" or method == "ScreenPointToRay" then
                local pos = targetPos()
                if pos then
                    local origin = Camera.CFrame.Position
                    return Ray.new(origin, (pos - origin).Unit)
                end
            end
            return oldCamNamecall(self, ...)
        end)
        State.hooks.camNamecall = { old = oldCamNamecall, target = Camera }
    end
end

local function restoreHooks()
    -- Les hooks restent installés mais passent en pass-through (active() false).
    -- Défaire un __namecall d'Instance avec hookfunction n'est pas fiable ;
    -- on coupe le comportement, on ne joue pas au chirurgien.
    State.bypass = true
    State.hooks = {}
end

---------------------------------------------------------------------
-- overlay
---------------------------------------------------------------------

local function newDrawing(class, props)
    local ok, obj = pcall(Drawing.new, class)
    if not ok or not obj then return nil end
    for k, v in pairs(props or {}) do pcall(function() obj[k] = v end) end
    return obj
end

local fovCircle = Config.drawFov and newDrawing("Circle", {
    Thickness = 1, Filled = false, NumSides = 64,
    Color = Config.color, Visible = false,
})
local targetLine = Config.drawLine and newDrawing("Line", {
    Thickness = 1, Color = Config.color, Visible = false,
})

local function updateOverlay()
    if fovCircle then
        local vp = Camera.ViewportSize
        fovCircle.Position = Vector2.new(vp.X * 0.5, vp.Y * 0.5)
        fovCircle.Radius   = Config.fov
        fovCircle.Visible  = Config.enabled and State.enabled
    end

    if targetLine then
        if active() and State.target then
            local sp = Camera:WorldToViewportPoint(State.target.Position)
            if sp.Z > 0 then
                targetLine.From    = Vector2.new(Camera.ViewportSize.X * 0.5,
                                                 Camera.ViewportSize.Y * 0.5)
                targetLine.To      = Vector2.new(sp.X, sp.Y)
                targetLine.Visible = true
            else
                targetLine.Visible = false
            end
        else
            targetLine.Visible = false
        end
    end
end

---------------------------------------------------------------------
-- boucles
---------------------------------------------------------------------

installHooks()

RunService.RenderStepped:Connect(function()
    refreshRealHit()
    selectTarget()
    updateOverlay()
end)

UIS.InputBegan:Connect(function(input, processed)
    if processed then return end
    if input.KeyCode == Config.keybind then
        State.enabled = not State.enabled
    end
    if Config.holdToAim and input.KeyCode == Config.holdToAim then
        State.holding = true
    end
end)

UIS.InputEnded:Connect(function(input)
    if Config.holdToAim and input.KeyCode == Config.holdToAim then
        State.holding = false
    end
end)

---------------------------------------------------------------------
-- API
---------------------------------------------------------------------

getgenv().SilentAim = {
    Config = Config,
    GetTarget = function()
        return State.target, State.player
    end,
    SetEnabled = function(on)
        State.enabled = on and true or false
    end,
    status = function()
        return {
            enabled  = State.enabled,
            target   = State.target and State.target:GetFullName() or nil,
            player   = State.player and State.player.Name or nil,
            fov      = Config.fov,
            part     = Config.part,
        }
    end,
    Unload = function()
        State.enabled = false
        restoreHooks()
        if fovCircle then pcall(function() fovCircle:Remove() end) end
        if targetLine then pcall(function() targetLine:Remove() end) end
        getgenv().SilentAim = nil
    end,
}

return getgenv().SilentAim
