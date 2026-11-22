--!nocheck
-- cheat_core.luau — module unique : ESP, aimbot, teleport, fly, speed, noclip
-- Dépendances : Drawing, UserInputService, RunService. cloneref optionnel.
-- Usage : coller dans un executor, ou loadstring(game:HttpGet(<url>))()

local Players    = game:GetService("Players")
local RunService = game:GetService("RunService")
local UIS        = game:GetService("UserInputService")
local Workspace  = game:GetService("Workspace")

if cloneref then
    Players    = cloneref(Players)
    RunService = cloneref(RunService)
    UIS        = cloneref(UIS)
    Workspace  = cloneref(Workspace)
end

local LocalPlayer = Players.LocalPlayer
local Camera      = Workspace.CurrentCamera

local Config = {
    esp = {
        enabled     = true,
        box         = true,
        health      = true,
        name        = true,
        distance    = true,
        tracer      = true,
        headDot     = true,
        teamCheck   = true,
        maxDistance = 500,
        colors      = {
            enemy  = Color3.fromRGB(255, 70, 90),
            ally   = Color3.fromRGB(90, 200, 255),
            box    = Color3.fromRGB(240, 240, 240),
            text   = Color3.fromRGB(245, 245, 245),
            tracer = Color3.fromRGB(255, 255, 255),
        },
    },
    aimbot = {
        enabled     = false,
        key         = Enum.UserInputType.MouseButton2,
        fov         = 110,
        smooth      = 0.28,
        visibleOnly = true,
        teamCheck   = true,
        part        = "Head",
    },
    tp = { enabled = true, key = Enum.KeyCode.T, maxDistance = 140 },
    fly = { enabled = true, key = Enum.KeyCode.F, speed = 60 },
    speed = { enabled = true, key = Enum.KeyCode.G, value = 40, restore = 16 },
    noclip = { enabled = true, key = Enum.KeyCode.N },
}

---------------------------------------------------------------------
-- utils
---------------------------------------------------------------------

local function newDrawing(class, props)
    local ok, obj = pcall(Drawing.new, class)
    if not ok or not obj then return nil end
    for k, v in pairs(props or {}) do pcall(function() obj[k] = v end) end
    return obj
end

local function destroySet(set)
    for _, d in pairs(set) do
        if d and d.Remove then pcall(function() d:Remove() end) end
    end
end

local function getChar(player)
    local char = player.Character
    if not char then return nil end
    local hum = char:FindFirstChildOfClass("Humanoid")
    if not hum or hum.Health <= 0 then return nil end
    local hrp = char:FindFirstChild("HumanoidRootPart")
    if not hrp then return nil end
    return char, hum, hrp
end

local function isAlly(player)
    if player == LocalPlayer then return true end
    return player.Team ~= nil and player.Team == LocalPlayer.Team
end

local function visible(targetPart)
    local ignore = { LocalPlayer.Character }
    local hits = Camera:GetPartsObscuringTarget(
        { Camera.CFrame.Position, targetPart.Position }, ignore)
    return #hits == 0
end

local function project(pos)
    local sp, onScreen = Camera:WorldToViewportPoint(pos)
    if sp.Z <= 0 then return nil end
    return Vector2.new(sp.X, sp.Y), onScreen
end


---------------------------------------------------------------------
-- ESP
---------------------------------------------------------------------

local Drawings = {}

local function buildSet()
    return {
        box      = newDrawing("Square", { Thickness = 1, Filled = false, Visible = false }),
        hpBg     = newDrawing("Square", { Thickness = 1, Filled = true, Visible = false }),
        hpFg     = newDrawing("Square", { Thickness = 0, Filled = true, Visible = false }),
        name     = newDrawing("Text",   { Size = 14, Center = true, Outline = true, Visible = false }),
        dist     = newDrawing("Text",   { Size = 13, Center = true, Outline = true, Visible = false }),
        tracer   = newDrawing("Line",   { Thickness = 1, Visible = false }),
        head     = newDrawing("Circle", { Thickness = 1, Filled = true, NumSides = 12, Visible = false }),
    }
end

local function hideSet(set)
    for _, d in pairs(set) do
        if d then d.Visible = false end
    end
end

local function updatePlayer(player, set)
    if player == LocalPlayer then return end

    local char, hum, hrp = getChar(player)
    if not char then destroySet(set) return end

    local rootPos = hrp.Position
    local dist = (rootPos - Camera.CFrame.Position).Magnitude
    if dist > Config.esp.maxDistance then hideSet(set) return end

    local headPos = rootPos + Vector3.new(0, 1.6, 0)
    local feetPos = rootPos - Vector3.new(0, 2.6, 0)

    local top, tOn = project(headPos)
    local bottom, bOn = project(feetPos)
    if not top or not bottom or (not tOn and not bOn) then hideSet(set) return end

    local height = math.abs(bottom.Y - top.Y)
    if height < 4 then hideSet(set) return end
    local width = height * 0.55
    local x, y = top.X - width * 0.5, top.Y
    local color = isAlly(player) and Config.esp.colors.ally or Config.esp.colors.enemy

    if Config.esp.box and set.box then
        set.box.Visible, set.box.Color = true, Config.esp.colors.box
        set.box.Position = Vector2.new(x, y)
        set.box.Size = Vector2.new(width, height)
    elseif set.box then set.box.Visible = false end

    if Config.esp.health and set.hpBg and set.hpFg then
        local frac = math.clamp(hum.Health / math.max(hum.MaxHealth, 1), 0, 1)
        local barW, bx = 3, x - 6
        set.hpBg.Visible, set.hpBg.Color = true, Color3.fromRGB(15, 15, 15)
        set.hpBg.Position, set.hpBg.Size = Vector2.new(bx, y), Vector2.new(barW, height)
        set.hpFg.Visible, set.hpFg.Color = true, color
        set.hpFg.Position = Vector2.new(bx, y + height * (1 - frac))
        set.hpFg.Size = Vector2.new(barW, height * frac)
    end

    if Config.esp.name and set.name then
        set.name.Visible = true
        set.name.Text = player.DisplayName or player.Name
        set.name.Color = Config.esp.colors.text
        set.name.Position = Vector2.new(top.X, y - 16)
    end

    if Config.esp.distance and set.dist then
        set.dist.Visible = true
        set.dist.Text = string.format("%dm", math.floor(dist))
        set.dist.Color = Config.esp.colors.text
        set.dist.Position = Vector2.new(top.X, y + height + 2)
    end

    if Config.esp.tracer and set.tracer then
        local vp = Camera.ViewportSize
        set.tracer.Visible = true
        set.tracer.Color = Config.esp.colors.tracer
        set.tracer.From = Vector2.new(vp.X * 0.5, vp.Y)
        set.tracer.To = Vector2.new(top.X, y + height)
    end

    if Config.esp.headDot and set.head and top then
        set.head.Visible = true
        set.head.Color = color
        set.head.Position = top
        set.head.Radius = 2
    end
end

task.spawn(function()
    while Config.esp.enabled do
        for player, set in pairs(Drawings) do
            if not player.Parent then
                destroySet(set)
                Drawings[player] = nil
            else
                updatePlayer(player, set)
            end
        end
        RunService.RenderStepped:Wait()
    end
    for _, set in pairs(Drawings) do destroySet(set) end
    Drawings = {}
end)

local function onPlayerAdded(p)
    if p ~= LocalPlayer then Drawings[p] = buildSet() end
end

for _, p in ipairs(Players:GetPlayers()) do onPlayerAdded(p) end
Players.PlayerAdded:Connect(onPlayerAdded)
Players.PlayerRemoving:Connect(function(p)
    if Drawings[p] then destroySet(Drawings[p]) Drawings[p] = nil end
end)


---------------------------------------------------------------------
-- AIMBOT
---------------------------------------------------------------------

local aiming = false

local function pickTarget()
    local mouse = UIS:GetMouseLocation()
    local best, bestDist = nil, math.huge

    for _, player in ipairs(Players:GetPlayers()) do
        if player ~= LocalPlayer
           and not (Config.aimbot.teamCheck and isAlly(player)) then
            local char, _, hrp = getChar(player)
            if char then
                local part = char:FindFirstChild(Config.aimbot.part) or hrp
                local screen = project(part.Position)
                if screen then
                    local d = (screen - mouse).Magnitude
                    local ok = d <= Config.aimbot.fov
                        and ((not Config.aimbot.visibleOnly) or visible(part))
                    if ok and d < bestDist then
                        best, bestDist = part, d
                    end
                end
            end
        end
    end
    return best
end

RunService.RenderStepped:Connect(function(dt)
    if not Config.aimbot.enabled or not aiming then return end
    local target = pickTarget()
    if not target then return end
    local goal = CFrame.lookAt(Camera.CFrame.Position, target.Position)
    local alpha = 1 - math.exp(-dt / math.max(Config.aimbot.smooth, 0.02))
    Camera.CFrame = Camera.CFrame:Lerp(goal, math.clamp(alpha, 0, 1))
end)


---------------------------------------------------------------------
-- MOVEMENT
---------------------------------------------------------------------

local flyBv, flyConn = nil, nil
local savedCollide = {}

local function stopFly()
    if flyConn then flyConn:Disconnect() flyConn = nil end
    if flyBv then pcall(function() flyBv:Destroy() end) flyBv = nil end
    local _, hum = getChar(LocalPlayer)
    if hum then hum.PlatformStand = false end
end

local function startFly()
    stopFly()
    local char, hum, hrp = getChar(LocalPlayer)
    if not char then return end

    hum.PlatformStand = true
    flyBv = Instance.new("BodyVelocity")
    flyBv.Name = "HubFly"
    flyBv.MaxForce = Vector3.new(1e6, 1e6, 1e6)
    flyBv.Velocity = Vector3.zero
    flyBv.Parent = hrp

    flyConn = RunService.RenderStepped:Connect(function()
        local _, _, root = getChar(LocalPlayer)
        if not root or not flyBv then return end
        local dir = Vector3.zero
        if UIS:IsKeyDown(Enum.KeyCode.W) then dir += Camera.CFrame.LookVector end
        if UIS:IsKeyDown(Enum.KeyCode.S) then dir -= Camera.CFrame.LookVector end
        if UIS:IsKeyDown(Enum.KeyCode.A) then dir -= Camera.CFrame.RightVector end
        if UIS:IsKeyDown(Enum.KeyCode.D) then dir += Camera.CFrame.RightVector end
        if UIS:IsKeyDown(Enum.KeyCode.Space) then dir += Vector3.yAxis end
        if UIS:IsKeyDown(Enum.KeyCode.LeftControl) then dir -= Vector3.yAxis end
        flyBv.Velocity = dir.Magnitude > 0 and dir.Unit * Config.fly.speed or Vector3.zero
    end)
end

local function toggleNoclip()
    local char = LocalPlayer.Character
    if not char then return end
    for _, d in ipairs(char:GetDescendants()) do
        if d:IsA("BasePart") then
            if d.CanCollide then
                savedCollide[d] = true
                d.CanCollide = false
            end
        end
    end
end

local function restoreNoclip()
    for part in pairs(savedCollide) do
        if part and part.Parent then
            pcall(function() part.CanCollide = true end)
        end
    end
    savedCollide = {}
end

local function doTeleport()
    local char, _, hrp = getChar(LocalPlayer)
    if not char then return end
    local mouse = UIS:GetMouseLocation()
    local ray = Camera:ViewportPointToRay(mouse.X, mouse.Y)
    local params = RaycastParams.new()
    params.FilterType = Enum.RaycastFilterType.Exclude
    params.FilterDescendantsInstances = { char }
    params.IgnoreWater = true
    local hit = Workspace:Raycast(ray.Origin, ray.Direction * Config.tp.maxDistance, params)
    if hit then
        hrp.CFrame = CFrame.new(hit.Position + Vector3.new(0, 3.5, 0))
    end
end

local function setSpeed(on)
    local _, hum = getChar(LocalPlayer)
    if not hum then return end
    hum.WalkSpeed = on and Config.speed.value or Config.speed.restore
end

UIS.InputBegan:Connect(function(input, processed)
    if processed then return end
    if input.UserInputType == Config.aimbot.key then aiming = true end
    if input.KeyCode == Config.tp.key and Config.tp.enabled then
        task.spawn(doTeleport)
    end
    if input.KeyCode == Config.fly.key and Config.fly.enabled then
        if flyBv then stopFly() else startFly() end
    end
    if input.KeyCode == Config.speed.key and Config.speed.enabled then
        local _, hum = getChar(LocalPlayer)
        if hum then setSpeed(hum.WalkSpeed <= Config.speed.restore + 1) end
    end
    if input.KeyCode == Config.noclip.key and Config.noclip.enabled then
        toggleNoclip()
    end
end)

UIS.InputEnded:Connect(function(input)
    if input.UserInputType == Config.aimbot.key then aiming = false end
end)


---------------------------------------------------------------------
-- TEARDOWN
---------------------------------------------------------------------

getgenv().Hub = {
    Config = Config,
    Build = "core-1.0",
    Unload = function()
        Config.esp.enabled = false
        for _, set in pairs(Drawings) do destroySet(set) end
        Drawings = {}
        stopFly()
        restoreNoclip()
        setSpeed(false)
    end,
}

return getgenv().Hub
