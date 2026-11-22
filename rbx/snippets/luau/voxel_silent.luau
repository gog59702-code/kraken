--!nocheck
-- voxel_silent.luau — silent aim pour le shooter voxel (place 78884249003161)
--
-- Ce jeu ne fait pas de hitscan "instance" : chaque arme envoie au serveur
-- une origine et une direction unitaire, et le serveur re-raycast de son côté.
-- Donc silent aim = réécrire la direction dans l'argument du remote.
-- La caméra ne bouge jamais, le viewmodel ne bouge jamais, le tir part droit
-- sur la cible côté serveur.
--
-- Signatures relevées sur le build courant (décompilation des ToolTemplates) :
--   FireRifle / FireSMG / FireLMG / FireDMR / FirePistol / FireHandCannon
--   FireSniper / FireMinigun
--       FireServer(origin: Vector3, dir: Vector3 unit, t: number,
--                  look: Vector3, cone: number)
--   FireShotgun
--       FireServer(muzzleOrigin: Vector3, camOrigin: Vector3, ...pelletEnd: Vector3)
--   KnifeHit / MeleeSwing / HammerHit / Punch
--       FireServer(dir: Vector3 unit)   (direction du rayon caméra)
--
-- API : getgenv().VoxelAim.{ Config, SetEnabled, status, Probe, Unload }

local Players    = game:GetService("Players")
local RunService = game:GetService("RunService")
local UIS        = game:GetService("UserInputService")
local Workspace  = game:GetService("Workspace")
local RS         = game:GetService("ReplicatedStorage")

local LocalPlayer = Players.LocalPlayer

local Config = {
    enabled      = true,
    keybind      = Enum.KeyCode.Q,
    fov          = 90,        -- px depuis le centre ; petit = discret
    maxDistance  = 700,
    teamCheck    = true,
    part         = "Head",
    lead         = true,      -- avance la cible selon la vitesse du projectile
    bulletSpeed  = 1700,      -- Ballistics.SPEED du jeu
    leadScale    = 1.0,
    rewriteRifle = true,
    rewriteShotgun = true,
    rewriteMelee = true,
    drawFov      = true,
    drawLine     = true,
    color        = Color3.fromRGB(255, 90, 110),
}

local State = {
    enabled  = Config.enabled,
    target   = nil,
    targetPlayer = nil,
    aimPos   = nil,
    calls    = 0,
    rewrites = 0,
    last     = {},      -- 10 derniers appels bruts, pour Probe()
    hooked   = false,
}

local RIFLE_REMOTES = {
    FireRifle = true, FireSMG = true, FireLMG = true, FireDMR = true,
    FireSniper = true, FirePistol = true, FireHandCannon = true,
    FireMinigun = true,
}
local MELEE_REMOTES = {
    KnifeHit = true, MeleeSwing = true, HammerHit = true, Punch = true,
}

---------------------------------------------------------------------
-- utilitaires
---------------------------------------------------------------------

local function hasTeam(p)
    return p.Team ~= nil
end

local function isAlly(p)
    if not Config.teamCheck then return false end
    if not hasTeam(p) or not hasTeam(LocalPlayer) then return false end
    return p.Team == LocalPlayer.Team
end

local function partOf(player)
    local char = player.Character
    if not char then return nil end
    local hum = char:FindFirstChildOfClass("Humanoid")
    if not hum or hum.Health <= 0 then return nil end
    return char:FindFirstChild(Config.part) or char:FindFirstChild("HumanoidRootPart")
end

local function velocityOf(part)
    local ok, v = pcall(function() return part.AssemblyLinearVelocity end)
    if ok and typeof(v) == "Vector3" then return v end
    return Vector3.zero
end

-- temps de vol approximatif : distance / vitesse du projectile
local function flightTime(origin, pos)
    local d = (pos - origin).Magnitude
    return d / math.max(Config.bulletSpeed, 1)
end

local function aimPoint(part, origin)
    local pos = part.Position
    if Config.lead then
        local t = flightTime(origin, pos) * Config.leadScale
        pos = pos + velocityOf(part) * t
    end
    return pos
end

local function cameraOrigin()
    return Workspace.CurrentCamera.CFrame.Position
end

local function active()
    return State.enabled and State.aimPos ~= nil
end

-- direction unitaire origine -> cible, jamais nulle
local function unitTo(from, to)
    local d = to - from
    if d.Magnitude < 1e-4 then return nil end
    return d.Unit
end

---------------------------------------------------------------------
-- sélection de cible
---------------------------------------------------------------------

local function selectTarget()
    local cam = Workspace.CurrentCamera
    if not cam then State.target, State.targetPlayer, State.aimPos = nil, nil, nil return end

    local vp = cam.ViewportSize
    local center = Vector2.new(vp.X * 0.5, vp.Y * 0.5)
    local origin = cam.CFrame.Position

    local best, bestDist, bestPlayer, bestPos

    for _, player in ipairs(Players:GetPlayers()) do
        if player ~= LocalPlayer and not isAlly(player) then
            local part = partOf(player)
            if part then
                local pos = part.Position
                if (pos - origin).Magnitude <= Config.maxDistance then
                    local sp = cam:WorldToViewportPoint(pos)
                    if sp.Z > 0 then
                        local d = (Vector2.new(sp.X, sp.Y) - center).Magnitude
                        if d <= Config.fov and (not bestDist or d < bestDist) then
                            best, bestDist, bestPlayer, bestPos = part, d, player, pos
                        end
                    end
                end
            end
        end
    end

    State.target = best
    State.targetPlayer = bestPlayer
    if best then
        State.aimPos = aimPoint(best, origin)
    else
        State.aimPos = nil
    end
end

---------------------------------------------------------------------
-- hook remote
---------------------------------------------------------------------

local function describe(v)
    local t = typeof(v)
    if t == "Vector3" then
        return string.format("Vector3(%.1f,%.1f,%.1f)", v.X, v.Y, v.Z)
    elseif t == "number" then
        return string.format("number(%.3f)", v)
    elseif t == "Instance" then
        return "Instance:" .. v:GetFullName()
    elseif t == "table" then
        local n = 0
        for _ in pairs(v) do n = n + 1 end
        return "table[" .. n .. "]"
    end
    return t .. ":" .. tostring(v)
end

local function logCall(name, args)
    local row = { remote = name, n = args.n, args = {} }
    for i = 1, math.min(args.n, 8) do
        row.args[i] = describe(args[i])
    end
    table.insert(State.last, row)
    if #State.last > 10 then table.remove(State.last, 1) end
end

local function rewrite(name, args)
    local aim = State.aimPos
    if not aim then return args end
    local changed = false

    if RIFLE_REMOTES[name] and Config.rewriteRifle then
        -- (origin, dir, time, look, cone)
        local origin = args[1]
        if typeof(origin) == "Vector3" then
            local dir = unitTo(origin, aim)
            if dir then
                args[2] = dir
                if typeof(args[4]) == "Vector3" then args[4] = dir end
                changed = true
            end
        end

    elseif name == "FireShotgun" and Config.rewriteShotgun then
        -- (muzzleOrigin, camOrigin, ...pelletEnd)
        for i = 3, args.n do
            if typeof(args[i]) == "Vector3" then
                args[i] = aim
                changed = true
            end
        end

    elseif MELEE_REMOTES[name] and Config.rewriteMelee then
        -- (dir) depuis la caméra
        if typeof(args[1]) == "Vector3" then
            local dir = unitTo(cameraOrigin(), aim)
            if dir then
                args[1] = dir
                changed = true
            end
        end
    end

    if changed then State.rewrites = State.rewrites + 1 end
    return args
end

local function install()
    if State.hooked then return end
    local old
    old = hookmetamethod(game, "__namecall", function(self, ...)
        local method = getnamecallmethod()
        if method ~= "FireServer" or checkcaller() then
            return old(self, ...)
        end

        local ok, name = pcall(function() return self.Name end)
        if not ok or type(name) ~= "string" then
            return old(self, ...)
        end
        if not RIFLE_REMOTES[name]
           and not MELEE_REMOTES[name]
           and name ~= "FireShotgun" then
            return old(self, ...)
        end

        local args = table.pack(...)
        State.calls = State.calls + 1
        logCall(name, args)

        if active() then
            args = rewrite(name, args)
        end

        return old(self, table.unpack(args, 1, args.n))
    end)
    State.hooked = true
    State.oldNamecall = old
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
    local cam = Workspace.CurrentCamera
    if not cam then return end

    if fovCircle then
        local vp = cam.ViewportSize
        fovCircle.Position = Vector2.new(vp.X * 0.5, vp.Y * 0.5)
        fovCircle.Radius = Config.fov
        fovCircle.Visible = Config.enabled and State.enabled
    end

    if targetLine then
        if active() and State.target then
            local sp = cam:WorldToViewportPoint(State.target.Position)
            if sp.Z > 0 then
                local vp = cam.ViewportSize
                targetLine.From = Vector2.new(vp.X * 0.5, vp.Y * 0.5)
                targetLine.To = Vector2.new(sp.X, sp.Y)
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

install()

RunService.RenderStepped:Connect(function()
    selectTarget()
    updateOverlay()
end)

UIS.InputBegan:Connect(function(input, processed)
    if processed then return end
    if input.KeyCode == Config.keybind then
        State.enabled = not State.enabled
        print("[VoxelAim] " .. (State.enabled and "on" or "off"))
    end
end)

---------------------------------------------------------------------
-- API
---------------------------------------------------------------------

getgenv().VoxelAim = {
    Config = Config,
    SetEnabled = function(on)
        State.enabled = on and true or false
    end,
    GetTarget = function()
        return State.target, State.targetPlayer, State.aimPos
    end,
    status = function()
        return {
            enabled = State.enabled,
            hooked = State.hooked,
            target = State.targetPlayer and State.targetPlayer.Name or nil,
            part = State.target and State.target:GetFullName() or nil,
            aim = State.aimPos and string.format("%.1f,%.1f,%.1f",
                State.aimPos.X, State.aimPos.Y, State.aimPos.Z) or nil,
            calls = State.calls,
            rewrites = State.rewrites,
            fov = Config.fov,
        }
    end,
    -- derniers tirs vus, avant réécriture : sert à valider la signature
    Probe = function()
        return State.last
    end,
    Unload = function()
        State.enabled = false
        if fovCircle then pcall(function() fovCircle:Remove() end) end
        if targetLine then pcall(function() targetLine:Remove() end) end
        getgenv().VoxelAim = nil
    end,
}

return getgenv().VoxelAim
