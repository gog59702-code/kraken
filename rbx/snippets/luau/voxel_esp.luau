--!nocheck
-- voxel_esp.luau — ESP joueur pour le shooter voxel (place 78884249003161)
--
-- 100 % client : Drawing + Highlight, aucun remote touché. Les remotes du jeu
-- nommés espupdate / aimassisttarget / applydamage / togglegod sont des appâts
-- serveur (CheatFlag) — on ne les appelle jamais, on ne les hook pas.
--
-- Rendu : boîte projetée sur les 8 coins du modèle, barre de vie, nom,
-- distance, arme en main, highlight traversant les murs.
--
-- API : getgenv().VoxelESP.{ Config, SetEnabled, status, Unload }

local Players    = game:GetService("Players")
local RunService = game:GetService("RunService")
local UIS        = game:GetService("UserInputService")
local Workspace  = game:GetService("Workspace")

local LocalPlayer = Players.LocalPlayer

local Config = {
    enabled     = true,
    keybind     = Enum.KeyCode.X,
    maxDistance = 900,
    teamCheck   = true,
    box         = true,
    health      = true,
    name        = true,
    distance    = true,
    weapon      = true,
    highlight   = true,
    tracer      = false,
    textSize    = 14,
    enemyColor  = Color3.fromRGB(255, 60, 80),
    allyColor   = Color3.fromRGB(80, 200, 255),
    nameColor   = Color3.fromRGB(255, 255, 255),
    healthGood  = Color3.fromRGB(90, 230, 120),
    healthBad   = Color3.fromRGB(235, 70, 70),
}

local State = {
    enabled = Config.enabled,
    cache   = {},     -- [player] = objet de rendu
    seen    = 0,
    conns   = {},
}

-- recharger le fichier ne doit pas empiler les boucles
if getgenv().VoxelESP and getgenv().VoxelESP.Unload then
    pcall(getgenv().VoxelESP.Unload)
end

---------------------------------------------------------------------
-- utilitaires
---------------------------------------------------------------------

local function alive(player)
    local char = player.Character
    if not char then return nil, nil end
    local hum = char:FindFirstChildOfClass("Humanoid")
    if not hum or hum.Health <= 0 then return char, nil end
    return char, hum
end

local function isAlly(player)
    if not Config.teamCheck then return false end
    if player.Team == nil or LocalPlayer.Team == nil then return false end
    return player.Team == LocalPlayer.Team
end

local function colorFor(player)
    return isAlly(player) and Config.allyColor or Config.enemyColor
end

local function newDrawing(class, props)
    local ok, obj = pcall(Drawing.new, class)
    if not ok or not obj then return nil end
    for k, v in pairs(props or {}) do pcall(function() obj[k] = v end) end
    return obj
end

local function tint(percent)
    local a = math.clamp(percent, 0, 1)
    if a >= 0.5 then
        local t = (a - 0.5) * 2
        return Config.healthBad:Lerp(Config.healthGood, t)
    end
    return Config.healthBad:Lerp(Config.healthBad, 0)
end

-- projette les 8 coins du modèle, renvoie minX,minY,maxX,maxY ou nil
local function projectBox(model, cam)
    local cf, size = model:GetBoundingBox()
    local minX, minY, maxX, maxY = math.huge, math.huge, -math.huge, -math.huge
    local valid = 0

    for _, sx in ipairs({ -0.5, 0.5 }) do
        for _, sy in ipairs({ -0.5, 0.5 }) do
            for _, sz in ipairs({ -0.5, 0.5 }) do
                local world = cf * Vector3.new(sx * size.X, sy * size.Y, sz * size.Z)
                local sp = cam:WorldToViewportPoint(world)
                if sp.Z > 0 then
                    valid = valid + 1
                    if sp.X < minX then minX = sp.X end
                    if sp.Y < minY then minY = sp.Y end
                    if sp.X > maxX then maxX = sp.X end
                    if sp.Y > maxY then maxY = sp.Y end
                end
            end
        end
    end

    if valid < 4 or maxX <= minX or maxY <= minY then return nil end
    return minX, minY, maxX, maxY
end

---------------------------------------------------------------------
-- objets de rendu
---------------------------------------------------------------------

local function build(player)
    local enemyColor = colorFor(player)
    local entry = {
        player = player,
        box    = Config.box and newDrawing("Square", {
            Thickness = 1, Filled = false, Color = enemyColor,
        }),
        hpBack = Config.health and newDrawing("Square", {
            Thickness = 1, Filled = true, Color = Color3.fromRGB(15, 15, 18),
        }),
        hpFill = Config.health and newDrawing("Square", {
            Thickness = 0, Filled = true, Color = Config.healthGood,
        }),
        name   = Config.name and newDrawing("Text", {
            Size = Config.textSize, Center = true, Outline = true,
            Color = Config.nameColor, Font = 2,
        }),
        dist   = Config.distance and newDrawing("Text", {
            Size = Config.textSize - 1, Center = true, Outline = true,
            Color = Color3.fromRGB(210, 210, 210), Font = 2,
        }),
        weapon = Config.weapon and newDrawing("Text", {
            Size = Config.textSize - 2, Center = true, Outline = true,
            Color = Color3.fromRGB(255, 210, 130), Font = 2,
        }),
        tracer = Config.tracer and newDrawing("Line", {
            Thickness = 1, Color = enemyColor,
        }),
        highlight = nil,
    }

    if Config.highlight then
        local hl = Instance.new("Highlight")
        hl.FillColor = enemyColor
        hl.FillTransparency = 0.65
        hl.OutlineColor = Color3.fromRGB(255, 255, 255)
        hl.OutlineTransparency = 0.15
        hl.DepthMode = Enum.HighlightDepthMode.AlwaysOnTop
        hl.Adornee = player.Character
        hl.Parent = player.Character
        entry.highlight = hl
    end

    return entry
end

local function destroy(entry)
    for _, key in ipairs({ "box", "hpBack", "hpFill", "name", "dist", "weapon", "tracer" }) do
        local obj = entry[key]
        if obj then pcall(function() obj:Remove() end) end
    end
    if entry.highlight then pcall(function() entry.highlight:Destroy() end) end
end

local function hide(entry)
    for _, key in ipairs({ "box", "hpBack", "hpFill", "name", "dist", "weapon", "tracer" }) do
        local obj = entry[key]
        if obj then obj.Visible = false end
    end
end

---------------------------------------------------------------------
-- mise à jour
---------------------------------------------------------------------

local function update(player, entry, cam)
    local char, hum = alive(player)
    if not char or not hum then hide(entry) return false end

    local root = char:FindFirstChild("HumanoidRootPart") or char:FindFirstChild("UpperTorso")
    if not root then hide(entry) return false end

    local dist = (root.Position - cam.CFrame.Position).Magnitude
    if dist > Config.maxDistance then hide(entry) return false end

    local minX, minY, maxX, maxY = projectBox(char, cam)
    if not minX then hide(entry) return false end

    local color = colorFor(player)
    local width  = maxX - minX
    local height = maxY - minY

    if entry.box then
        entry.box.Color    = color
        entry.box.Size     = Vector2.new(width, height)
        entry.box.Position = Vector2.new(minX, minY)
        entry.box.Visible  = true
    end

    if entry.hpBack and entry.hpFill then
        local pct  = math.clamp(hum.Health / math.max(hum.MaxHealth, 1), 0, 1)
        local barW = 3
        local barX = minX - barW - 2
        entry.hpBack.Color    = Color3.fromRGB(15, 15, 18)
        entry.hpBack.Size     = Vector2.new(barW, height)
        entry.hpBack.Position = Vector2.new(barX, minY)
        entry.hpBack.Visible  = true

        local fillH = height * pct
        entry.hpFill.Color    = tint(pct)
        entry.hpFill.Size     = Vector2.new(barW, fillH)
        entry.hpFill.Position = Vector2.new(barX, minY + (height - fillH))
        entry.hpFill.Visible  = true
    end

    if entry.name then
        entry.name.Text     = player.Name
        entry.name.Color    = color
        entry.name.Position = Vector2.new(minX + width * 0.5, minY - 16)
        entry.name.Visible  = true
    end

    if entry.dist then
        entry.dist.Text     = string.format("%d m", math.floor(dist))
        entry.dist.Position = Vector2.new(minX + width * 0.5, maxY + 2)
        entry.dist.Visible  = true
    end

    if entry.weapon then
        local tool = char:FindFirstChildOfClass("Tool")
        entry.weapon.Text     = tool and tool.Name or ""
        entry.weapon.Position = Vector2.new(minX + width * 0.5, maxY + 17)
        entry.weapon.Visible  = tool ~= nil
    end

    if entry.tracer then
        local vp = cam.ViewportSize
        entry.tracer.From    = Vector2.new(vp.X * 0.5, vp.Y)
        entry.tracer.To      = Vector2.new(minX + width * 0.5, maxY)
        entry.tracer.Color   = color
        entry.tracer.Visible = true
    end

    if entry.highlight then
        entry.highlight.FillColor = color
        if entry.highlight.Adornee ~= char then
            entry.highlight.Adornee = char
            entry.highlight.Parent = char
        end
    end

    return true
end

local function tick()
    local cam = Workspace.CurrentCamera
    if not cam then return end

    local visible = 0

    for _, player in ipairs(Players:GetPlayers()) do
        if player ~= LocalPlayer then
            local entry = State.cache[player]
            if not entry then
                local char = player.Character
                if char and char:FindFirstChildOfClass("Humanoid") then
                    entry = build(player)
                    State.cache[player] = entry
                end
            end
            if entry then
                if State.enabled and update(player, entry, cam) then
                    visible = visible + 1
                else
                    hide(entry)
                end
            end
        end
    end

    State.seen = visible
end

local function sweep()
    for player, entry in pairs(State.cache) do
        if not player.Parent then
            destroy(entry)
            State.cache[player] = nil
        end
    end
end

---------------------------------------------------------------------
-- cycle de vie
---------------------------------------------------------------------

State.conns.render = RunService.RenderStepped:Connect(tick)

task.spawn(function()
    while task.wait(5) do sweep() end
end)

State.conns.remove = Players.PlayerRemoving:Connect(function(player)    local entry = State.cache[player]
    if entry then
        destroy(entry)
        State.cache[player] = nil
    end
end)

State.conns.input = UIS.InputBegan:Connect(function(input, processed)
    if processed then return end
    if input.KeyCode == Config.keybind then
        State.enabled = not State.enabled
        print("[VoxelESP] " .. (State.enabled and "on" or "off"))
    end
end)
---------------------------------------------------------------------
-- API
---------------------------------------------------------------------

getgenv().VoxelESP = {
    Config = Config,
    SetEnabled = function(on)
        State.enabled = on and true or false
    end,
    status = function()
        local total = 0
        for _ in pairs(State.cache) do total = total + 1 end
        return {
            enabled = State.enabled,
            tracked = total,
            visible = State.seen,
            keybind = tostring(Config.keybind),
            maxDistance = Config.maxDistance,
        }
    end,
    Unload = function()
        State.enabled = false
        for _, conn in pairs(State.conns) do
            pcall(function() conn:Disconnect() end)
        end
        State.conns = {}
        for player, entry in pairs(State.cache) do
            destroy(entry)
            State.cache[player] = nil
        end
        getgenv().VoxelESP = nil
    end,
}

return getgenv().VoxelESP
