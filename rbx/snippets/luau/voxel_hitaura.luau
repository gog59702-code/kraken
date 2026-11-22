--!nocheck
-- voxel_hitaura.luau — hit aura (kill aura) pour le shooter voxel
-- place 78884249003161
--
-- Principe : l'aura choisit l'ennemi le plus proche dans un rayon en studs
-- (360°, la caméra ne compte pas), puis :
--   1. réécrit la direction du remote de tir vers cet ennemi — même mécanique
--      que voxel_silent.luau, mais la sélection ignore le FOV écran ;
--   2. presse la gâchette toute seule (Tool:Activate) en pulses réglés.
--
-- Le serveur re-raycast depuis l'origine du canon : si un mur est entre les
-- deux, le tir est bloqué côté serveur. D'où requireLineOfSight, désactivé
-- par défaut (le serveur tranche), activable pour ne pas gaspiller de balles.
--
-- API : getgenv().VoxelAura.{ Config, SetEnabled, status, Unload }

local Players    = game:GetService("Players")
local RunService = game:GetService("RunService")
local UIS        = game:GetService("UserInputService")
local Workspace  = game:GetService("Workspace")

local LocalPlayer = Players.LocalPlayer

-- recharger le fichier ne doit pas empiler les hooks : on démonte l'ancien
if getgenv().VoxelAura and getgenv().VoxelAura.Unload then
    pcall(getgenv().VoxelAura.Unload)
end

local Config = {
    enabled     = true,
    keybind     = Enum.KeyCode.G,
    radius      = 60,          -- studs, l'aura elle-même
    teamCheck   = true,
    part        = "Head",
    requireLineOfSight = false,
    autoEquip   = true,        -- prend une arme du backpack si les mains sont vides
    preferred   = {
        "AssaultRifle", "SMG", "LMG", "DMR", "Sniper",
        "Pistol", "HandCannon", "Shotgun", "Knife", "Hammer",
    },
    interval    = 0.12,        -- secondes entre deux pulses de gâchette
    pulse       = 0.025,       -- durée d'appui
    maxShots    = 0,           -- 0 = illimité, sinon coupe après N tirs
    drawRing    = true,
    drawTarget  = true,
    ringColor   = Color3.fromRGB(255, 60, 80),
    ringSegments = 24,
}

local State = {
    enabled   = Config.enabled,
    aim       = nil,     -- Vector3 visée courante
    target    = nil,     -- BasePart
    player    = nil,
    inRange   = 0,
    shots     = 0,
    lastPulse = 0,
    hooked    = false,
    oldAimEnabled = nil,
    conns     = {},
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

local function isAlly(p)
    if not Config.teamCheck then return false end
    if p.Team == nil or LocalPlayer.Team == nil then return false end
    return p.Team == LocalPlayer.Team
end

local function partOf(player)
    local char = player.Character
    if not char then return nil end
    local hum = char:FindFirstChildOfClass("Humanoid")
    if not hum or hum.Health <= 0 then return nil end
    return char:FindFirstChild(Config.part) or char:FindFirstChild("HumanoidRootPart")
end

local function myRoot()
    local char = LocalPlayer.Character
    return char and (char:FindFirstChild("HumanoidRootPart")
        or char:FindFirstChild("UpperTorso")
        or char:FindFirstChild("Torso"))
end

local function hasLineOfSight(part)
    local root = myRoot()
    if not root then return false end
    local params = RaycastParams.new()
    params.FilterType = Enum.RaycastFilterType.Exclude
    local ignore = { LocalPlayer.Character, part.Parent }
    params.FilterDescendantsInstances = ignore
    local hit = Workspace:Raycast(root.Position, part.Position - root.Position, params)
    return hit == nil
end

local function unitTo(from, to)
    local d = to - from
    if d.Magnitude < 1e-4 then return nil end
    return d.Unit
end

local function equippedTool()
    local char = LocalPlayer.Character
    if not char then return nil end
    return char:FindFirstChildOfClass("Tool")
end

local function pickTool()
    local char = LocalPlayer.Character
    local hum = char and char:FindFirstChildOfClass("Humanoid")
    local bp = LocalPlayer:FindFirstChildOfClass("Backpack")
    if not hum or not bp then return nil end

    for _, name in ipairs(Config.preferred) do
        local tool = bp:FindFirstChild(name)
        if tool and tool:IsA("Tool") then return tool, hum end
    end
    for _, tool in ipairs(bp:GetChildren()) do
        if tool:IsA("Tool") then return tool, hum end
    end
    return nil
end

---------------------------------------------------------------------
-- sélection
---------------------------------------------------------------------

local function selectTarget()
    local root = myRoot()
    if not root then
        State.target, State.player, State.aim, State.inRange = nil, nil, nil, 0
        return
    end

    local origin = root.Position
    local best, bestDist, bestPlayer, count

    for _, player in ipairs(Players:GetPlayers()) do
        if player ~= LocalPlayer and not isAlly(player) then
            local part = partOf(player)
            if part then
                local dist = (part.Position - origin).Magnitude
                if dist <= Config.radius then
                    count = (count or 0) + 1
                    local ok = true
                    if Config.requireLineOfSight then
                        ok = hasLineOfSight(part)
                    end
                    if ok and (not bestDist or dist < bestDist) then
                        best, bestDist, bestPlayer = part, dist, player
                    end
                end
            end
        end
    end

    State.target = best
    State.player = bestPlayer
    State.aim = best and best.Position or nil
    State.inRange = count or 0
end

---------------------------------------------------------------------
-- hook remote : direction vers la cible de l'aura
---------------------------------------------------------------------

local function rewrite(name, args)
    local aim = State.aim
    if not aim then return args end

    if RIFLE_REMOTES[name] then
        local origin = args[1]
        if typeof(origin) == "Vector3" then
            local dir = unitTo(origin, aim)
            if dir then
                args[2] = dir
                if typeof(args[4]) == "Vector3" then args[4] = dir end
            end
        end

    elseif name == "FireShotgun" then
        for i = 3, args.n do
            if typeof(args[i]) == "Vector3" then
                args[i] = aim
            end
        end

    elseif MELEE_REMOTES[name] then
        if typeof(args[1]) == "Vector3" then
            local cam = Workspace.CurrentCamera
            local origin = cam and cam.CFrame.Position
            if origin then
                local dir = unitTo(origin, aim)
                if dir then args[1] = dir end
            end
        end
    end

    return args
end

local function install()
    if State.hooked then return end

    -- le silent aim caméra et l'aura se disputeraient la direction :
    -- l'aura prend la main, et rend son état précédent à l'Unload.
    local aimMod = getgenv().VoxelAim
    if aimMod and aimMod.Config then
        State.oldAimEnabled = aimMod.Config.enabled
        aimMod.SetEnabled(false)
    end

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
        if State.enabled and State.aim then
            args = rewrite(name, args)
        end
        return old(self, table.unpack(args, 1, args.n))
    end)

    State.hooked = true
end

---------------------------------------------------------------------
-- gâchette
---------------------------------------------------------------------

local function trigger()
    local tool = equippedTool()

    if not tool and Config.autoEquip then
        local candidate, hum = pickTool()
        if candidate and hum then
            hum:EquipTool(candidate)
            tool = candidate
        end
    end

    if not tool or tool.Parent ~= LocalPlayer.Character then return false end
    if not tool.Enabled then return false end

    local now = os.clock()
    if now - State.lastPulse < Config.interval then return false end
    State.lastPulse = now
    State.shots = State.shots + 1

    pcall(function() tool:Activate() end)
    task.delay(Config.pulse, function()
        pcall(function() tool:Deactivate() end)
    end)

    return true
end

local function tick()
    if not State.enabled then return end
    selectTarget()

    if State.target and State.aim then
        if Config.maxShots > 0 and State.shots >= Config.maxShots then
            State.enabled = false
            print("[VoxelAura] quota atteint, off")
        else
            trigger()
        end
    end
end

---------------------------------------------------------------------
-- visuel : anneau au sol + ligne vers la cible
---------------------------------------------------------------------

local function newDrawing(class, props)
    local ok, obj = pcall(Drawing.new, class)
    if not ok or not obj then return nil end
    for k, v in pairs(props or {}) do pcall(function() obj[k] = v end) end
    return obj
end

local ring = {}
if Config.drawRing then
    for i = 1, Config.ringSegments do
        ring[i] = newDrawing("Line", {
            Thickness = 1, Color = Config.ringColor, Visible = false,
        })
    end
end

local targetLine = Config.drawTarget and newDrawing("Line", {
    Thickness = 1, Color = Config.ringColor, Visible = false,
})

local function updateRing()
    local root = myRoot()
    local cam = Workspace.CurrentCamera
    if not root or not cam or not State.enabled then
        for i = 1, #ring do if ring[i] then ring[i].Visible = false end end
        if targetLine then targetLine.Visible = false end
        return
    end

    local center = root.Position - Vector3.new(0, 2.6, 0)
    for i = 1, Config.ringSegments do
        local a1 = (i - 1) / Config.ringSegments * math.pi * 2
        local a2 = i / Config.ringSegments * math.pi * 2
        local p1 = center + Vector3.new(math.cos(a1), 0, math.sin(a1)) * Config.radius
        local p2 = center + Vector3.new(math.cos(a2), 0, math.sin(a2)) * Config.radius
        local s1 = cam:WorldToViewportPoint(p1)
        local s2 = cam:WorldToViewportPoint(p2)
        local line = ring[i]
        if line then
            if s1.Z > 0 and s2.Z > 0 then
                line.From = Vector2.new(s1.X, s1.Y)
                line.To = Vector2.new(s2.X, s2.Y)
                line.Visible = true
            else
                line.Visible = false
            end
        end
    end

    if targetLine then
        if State.target then
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
-- cycle de vie
---------------------------------------------------------------------

install()

State.conns.render = RunService.RenderStepped:Connect(function()
    tick()
    updateRing()
end)

State.conns.input = UIS.InputBegan:Connect(function(input, processed)
    if processed then return end
    if input.KeyCode == Config.keybind then
        State.enabled = not State.enabled
        State.shots = 0
        print("[VoxelAura] " .. (State.enabled and "on" or "off"))
    end
end)

---------------------------------------------------------------------
-- API
---------------------------------------------------------------------

getgenv().VoxelAura = {
    Config = Config,
    SetEnabled = function(on)
        State.enabled = on and true or false
        if State.enabled then State.shots = 0 end
    end,
    status = function()
        return {
            enabled = State.enabled,
            target = State.player and State.player.Name or nil,
            part = State.target and State.target:GetFullName() or nil,
            inRange = State.inRange,
            shots = State.shots,
            radius = Config.radius,
            tool = (equippedTool() and equippedTool().Name) or "none",
        }
    end,
    Unload = function()
        State.enabled = false
        for _, conn in pairs(State.conns) do
            pcall(function() conn:Disconnect() end)
        end
        State.conns = {}
        for i = 1, #ring do
            if ring[i] then pcall(function() ring[i]:Remove() end) end
        end
        if targetLine then pcall(function() targetLine:Remove() end) end
        local aimMod = getgenv().VoxelAim
        if aimMod and State.oldAimEnabled ~= nil then
            aimMod.SetEnabled(State.oldAimEnabled)
        end
        getgenv().VoxelAura = nil
    end,
}

return getgenv().VoxelAura
