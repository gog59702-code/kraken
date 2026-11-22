--!nocheck
-- mc_hitaura.luau — hit aura « perfect hit » pour « +1 Heart Per Kill »
-- place 82331798712738
--
-- v3.1 — un swing complet par hit, knockback max, portée serveur max,
--        entrée instantanée dans la zone.
--
--   v3.1 : reload ne double plus la boucle (les connexions de la charge
--          précédente sont coupées), l'état on/off survit au reload,
--          une cible déjà frappée passe après les fraîches (immunité 1 s),
--          `posLead` peut décaler State.pos vers la cible pendant le swing
--          pour pousser la portée au-delà du reachMax mesuré.
--
-- Ce qui est mesuré / confirmé en jeu :
--   * un hit ne part que si le client a un swing réel :
--       pressLeft() -> hold -> releaseLeft()
--   * hold plein = 1 / attackSpeed secondes (épée 1.6 -> 0.625 s).
--     En dessous, le serveur classe le coup « weak ».
--   * le serveur accepte des hits jusqu'à ~4.97 studs (REACH client = 3).
--   * State.sprint = true pendant le swing classe le hit « sprint »
--     -> extra knockback (KB_EXTRA_HORIZONTAL = 0.5).
--   * charge plein -> FX « strong » -> dégâts et knockback max.
--   * le serveur résout le hit à la FIN du swing : l'aim doit rester
--     verrouillé sur la cible pendant tout le hold, pas seulement au press.
--   * HitConfirm = notre hit (args nil). AttackFx(attacker == nous) donne
--     le type exact : weak | strong | knockback | sprint | block | ...
--
-- Architecture :
--   idle -> pressLeft -> swing (aim lock + State spoof) -> releaseLeft
--        -> cooldown (immunité) -> idle
--
--   Le hook __namecall fait deux choses :
--     1. State : réécrit yaw/pitch vers la cible (silent aim réseau),
--        force sprint=true et swinging=true pendant le swing.
--     2. Attack : réécrit l'uid vers la cible verrouillée.
--
-- API : getgenv().McHitAura.{ Config, SetEnabled, status, probe, log,
--                             forceAttack, Unload }

local Players           = game:GetService("Players")
local RunService        = game:GetService("RunService")
local UIS               = game:GetService("UserInputService")
local Workspace         = game:GetService("Workspace")
local ReplicatedStorage = game:GetService("ReplicatedStorage")

local LocalPlayer = Players.LocalPlayer
local MyUid       = LocalPlayer.UserId

local Shared     = ReplicatedStorage:WaitForChild("Shared")
local Remotes    = ReplicatedStorage:WaitForChild("Remotes")
local Config_m   = require(Shared:WaitForChild("Config"))
local ItemDefs_m = require(Shared:WaitForChild("ItemDefs"))

local PlayerScripts     = LocalPlayer:WaitForChild("PlayerScripts")
local RigAnimator_m     = require(PlayerScripts:WaitForChild("RigAnimator"))
local InputController_m = require(PlayerScripts:WaitForChild("InputController"))

-- ---------------------------------------------------------------------
-- config
-- ---------------------------------------------------------------------

local Config = {
    enabled       = true,
    keybind       = Enum.KeyCode.G,

    -- zone : 5.0 = plafond serveur mesuré (hit confirmé à 4.97)
    radius        = 5.0,
    requireLos    = true,
    ignoreLobby   = true,
    playersOnly   = false,    -- false = les bots/NPC comptent aussi

    -- extension de portée : décale State.pos vers la cible pendant le swing.
    -- 0 = off. Au-delà du reachMax de l'arme, non mesuré côté serveur.
    posLead       = 0.0,

    -- réseau
    aimLead       = 1.0,      -- extrapolation d'un snapshot (pos - prevPos)
    lockYaw       = true,     -- écrit st.yaw/st.pitch pendant le swing
    sprintSpoof   = true,     -- State.sprint = true pendant le swing -> extra KB
    critSpoof     = false,    -- onGround=false + vel.Y<0 (crit, pas de KB en plus)
    blockingFalse = true,

    -- cadence
    holdScale     = 1.06,     -- hold = (1 / attackSpeed) * holdScale
    holdPad       = 0.02,
    releaseGap    = 0.05,
    minGlobal     = 0.52,     -- demi-fenêtre d'immunité (10 ticks)
    hitCooldown   = 0.9,      -- cible déjà frappée : passe après les fraîches

    -- arme (spoof réseau uniquement, le client garde l'item en main)
    forceSlot     = nil,      -- nil = slot réel ; number ; "best"

    -- visuel
    drawRing      = true,
    drawTarget    = true,
    ringSegments  = 32,
    ringColor     = Color3.fromRGB(255, 70, 90),
    ringSwingColor = Color3.fromRGB(80, 255, 140),
}

-- ---------------------------------------------------------------------
-- core partagé entre reloads : un seul hook __namecall
-- ---------------------------------------------------------------------

local Core = getgenv()._mcHitAuraCore
if not Core then
    Core = {
        hookVersion = 0,
        config      = Config,
        enabledFlag = true,
        conns       = {},
        state       = nil,
        target      = nil,
        localState  = { pos = nil, yaw = 0, pitch = 0, at = 0, fresh = false },

        -- machine à états
        phase       = "idle",
        swingUid    = nil,
        swingAim    = nil,
        swingHold   = 0.6,
        swingEndsAt = 0,
        lastPressAt = 0,
        nextPressAt = 0,
        lastSwingUid = nil,
        lastSwingAt  = 0,

        forcedSlot  = nil,
        lastHitAt   = {},

        stats = {
            calls = 0, rewrites = 0, swings = 0, attacks = 0,
            hits = 0, rejected = 0, fx = {}, lastFx = nil,
        },
        log = {},
    }
    getgenv()._mcHitAuraCore = Core
end

-- reload propre : on relâche un swing resté ouvert
if Core.phase == "swing" then
    pcall(function() InputController_m.releaseLeft() end)
end

Core.config      = Config
Core.phase       = "idle"
Core.swingUid    = nil
Core.swingAim    = nil
Core.nextPressAt = 0
Core.forcedSlot  = nil
Core.target      = nil

-- un reload ne doit pas empiler deux boucles : on coupe les connexions
-- de la charge précédente avant d'installer les nôtres
if Core.conns then
    for _, conn in pairs(Core.conns) do
        pcall(function() conn:Disconnect() end)
    end
end
Core.conns = {}

local State = {
    enabled = Core.enabledFlag ~= false,   -- l'état on/off survit au reload
    conns   = Core.conns,
}

local function logLine(s)
    local line = string.format("%s %s", os.date("%H:%M:%S"), s)
    table.insert(Core.log, line)
    if #Core.log > 80 then table.remove(Core.log, 1) end
end

-- ---------------------------------------------------------------------
-- état local vivant (MovementController, upvalue 3 de pressLeft)
-- ---------------------------------------------------------------------

local function findLiveState()
    if type(getupvalues) ~= "function" then return nil end
    local ok, ups = pcall(getupvalues, InputController_m.pressLeft)
    if not ok or type(ups) ~= "table" then return nil end
    for i = 1, #ups do
        local v = ups[i]
        if type(v) == "table"
            and type(v.hotbar) == "table"
            and v.heldSlot ~= nil
            and v.pos ~= nil then
            return v
        end
    end
    return nil
end

local LiveState = findLiveState()
local lastStateScan = os.clock()

local function ensureState()
    if LiveState then return LiveState end
    local now = os.clock()
    if now - lastStateScan > 2 then
        lastStateScan = now
        LiveState = findLiveState()
    end
    return LiveState
end

-- BlockWorld : instance client pour le test de ligne de vue
local BlockWorld = nil
do
    local okHud, hud = pcall(function()
        return require(PlayerScripts:WaitForChild("HUDController"))
    end)
    if okHud and hud and type(hud.targetInReach) == "function" and type(getupvalues) == "function" then
        local okUps, ups = pcall(getupvalues, hud.targetInReach)
        if okUps and type(ups) == "table" then
            local pick
            for _, v in ipairs(ups) do
                if type(v) == "function" then pick = v break end
            end
            if pick then
                local okUps2, ups2 = pcall(getupvalues, pick)
                if okUps2 and type(ups2) == "table" then
                    for _, v in ipairs(ups2) do
                        if type(v) == "table" and type(v.raycast) == "function" then
                            local okTest = pcall(function()
                                return v:raycast(Vector3.new(0, 100, 0), Vector3.new(0, -1, 0), 5)
                            end)
                            if okTest then BlockWorld = v break end
                        end
                    end
                end
            end
        end
    end
end

local function getState()
    ensureState()
    if LiveState then return LiveState end
    local s = Core.localState
    if not s.pos then return nil end
    return {
        pos = s.pos, yaw = s.yaw, pitch = s.pitch,
        eyeHeight = Config_m.EYE_HEIGHT,
        hotbar = {}, heldSlot = 0, dead = false,
    }
end

-- ---------------------------------------------------------------------
-- hook réseau : State (silent aim + flags) et Attack (uid)
-- ---------------------------------------------------------------------

local function installHook()
    if Core.hookVersion == 3 then return end

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

        if name == "State" then
            local a = ...
            if type(a) == "table" then
                local ls = Core.localState
                ls.pos   = a.pos
                ls.yaw   = a.yaw or 0
                ls.pitch = a.pitch or 0
                ls.at    = os.clock()
                ls.fresh = true

                local cfg = Core.config
                if Core.enabled and cfg then
                    local st = Core.state
                    local eyeH = (st and st.eyeHeight) or Config_m.EYE_HEIGHT

                    -- silent aim : la cible verrouillée d'abord, sinon la cible courante
                    local aim = nil
                    if Core.phase == "swing" then
                        aim = Core.swingAim
                    elseif Core.target then
                        aim = Core.target.aimPoint
                    end

                    if aim and a.pos then
                        local eye = a.pos + Vector3.new(0, eyeH, 0)
                        local d = aim - eye
                        local m = d.Magnitude
                        if m > 0.0001 then
                            local n = d / m
                            a.pitch = math.asin(math.clamp(-n.Y, -1, 1))
                            a.yaw   = math.atan2(-n.X, n.Z)
                        end
                    end

                    -- extension de portée : le serveur lit State.pos pour la
                    -- validation de distance, pas la position du personnage
                    if cfg.posLead and cfg.posLead > 0
                        and Core.phase == "swing" and Core.swingAim and a.pos then
                        local flat = Core.swingAim - a.pos
                        flat = Vector3.new(flat.X, 0, flat.Z)
                        if flat.Magnitude > 0.001 then
                            a.pos = a.pos + flat.Unit * cfg.posLead
                        end
                    end

                    if cfg.blockingFalse then
                        a.blocking = false
                    end

                    -- sprint uniquement pendant le swing : c'est là que le
                    -- serveur classe le knockback
                    if Core.phase == "swing" then
                        a.swinging = true
                        if cfg.sprintSpoof then a.sprint = true end
                    end

                    if cfg.critSpoof then
                        a.sprint = false
                        a.onGround = false
                        if typeof(a.vel) == "Vector3" then
                            a.vel = Vector3.new(a.vel.X, math.min(a.vel.Y, -0.08), a.vel.Z)
                        end
                    end

                    if Core.forcedSlot then
                        a.slot = Core.forcedSlot
                    end
                end
            end
            return old(self, ...)
        end

        if name == "Attack" then
            Core.stats.calls = Core.stats.calls + 1
            Core.stats.attacks = Core.stats.attacks + 1
            if Core.enabled then
                local uid = Core.swingUid
                if not uid and Core.target then uid = Core.target.uid end
                if uid then
                    local p = table.pack(...)
                    p[1] = uid
                    if p.n < 1 then p.n = 1 end
                    Core.stats.rewrites = Core.stats.rewrites + 1
                    return old(self, table.unpack(p, 1, p.n))
                end
            end
            return old(self, ...)
        end

        return old(self, ...)
    end)

    Core.hookVersion = 3
    logLine("hook v3 installé")
end

-- ---------------------------------------------------------------------
-- arme / portée / cadence
-- ---------------------------------------------------------------------

local function itemAt(slot)
    local st = Core.state
    if not st or not slot or not st.hotbar then return nil end
    local id = st.hotbar[slot]
    return id and ItemDefs_m.items[id] or nil
end

local function attackSpeedOf(item)
    local s = item and item.attackSpeed
    if type(s) == "number" and s > 0 then return s end

    local tbl = Config_m.ATTACK_SPEED
    local tool = item and item.tool
    if tbl and tool and type(tbl[tool]) == "number" then return tbl[tool] end
    if tbl and type(tbl.sword) == "number" then return tbl.sword end
    return 1.6
end

-- hold plein = 1 / attackSpeed secondes (formule du module Damage)
local function holdTimeFor(slot)
    local speed = attackSpeedOf(itemAt(slot))
    return (1 / speed) * Config.holdScale + Config.holdPad
end

local function resolveForcedSlot()
    local f = Config.forceSlot
    if f == nil then return nil end
    if type(f) == "number" then return f end

    if f == "best" then
        local st = Core.state
        if not st or not st.hotbar then return nil end
        local best, bestDmg
        for i = 1, 36 do
            local item = itemAt(i)
            if item and (item.damage or 0) > 0 and item.use ~= "place" then
                if not bestDmg or item.damage > bestDmg then
                    best, bestDmg = i, item.damage
                end
            end
        end
        return best
    end

    return nil
end

local function currentSlot()
    return Core.forcedSlot or (Core.state and Core.state.heldSlot) or 1
end

local function currentRadius()
    local item = itemAt(currentSlot())
    local r = Config.radius
    if item and type(item.reachMax) == "number" then
        r = math.max(r, item.reachMax + (Config_m.REACH_LAG_SLACK or 0.5))
    end
    return r
end

-- ---------------------------------------------------------------------
-- cibles
-- ---------------------------------------------------------------------

local function inLobby(pos)
    local ok, v = pcall(function()
        return Config_m.LOBBY and Config_m.LOBBY.inLobby and Config_m.LOBBY.inLobby(pos)
    end)
    return ok and v == true
end

local function hasLos(eye, aim)
    if not Config.requireLos or not BlockWorld then return true end
    local d = aim - eye
    local dist = d.Magnitude
    if dist < 0.01 then return true end
    local ok, hit = pcall(function()
        return BlockWorld:raycast(eye, d / dist, dist)
    end)
    if not ok or hit == nil then return true end
    local hd
    if type(hit) == "number" then hd = hit
    elseif type(hit) == "table" then hd = hit.distance or hit.Distance end
    if type(hd) ~= "number" then return true end
    return hd >= dist - 0.05
end

local function aimPointOf(snap)
    local lead = Vector3.zero
    if snap.prevPos and Config.aimLead ~= 0 then
        lead = (snap.pos - snap.prevPos) * Config.aimLead
    end
    return snap.pos + lead + Vector3.new(0, Config_m.HITBOX_HEIGHT * 0.5, 0)
end

local function collectTargets(st, radius)
    local eye = st.pos + Vector3.new(0, st.eyeHeight or Config_m.EYE_HEIGHT, 0)
    local list = {}

    for uid, entry in pairs(RigAnimator_m.remotes) do
        local snap = entry and entry.s
        if snap and not snap.dead and snap.pos then
            if not Config.playersOnly or uid > 0 then
                local d = (snap.pos - st.pos).Magnitude
                if d <= radius then
                    local last = Core.lastHitAt[uid]
                    list[#list + 1] = {
                        uid      = uid,
                        snap     = snap,
                        dist     = d,
                        aimPoint = aimPointOf(snap),
                        recent   = last ~= nil
                            and (os.clock() - last) < Config.hitCooldown,
                    }
                end
            end
        end
    end

    -- une cible déjà frappée passe après les fraîches (immunité 1 s)
    table.sort(list, function(a, b)
        if a.recent ~= b.recent then return not a.recent end
        return a.dist < b.dist
    end)
    return list, eye
end

local function pickTarget(st)
    if not st or st.dead or not st.pos then return nil end
    if Config.ignoreLobby and inLobby(st.pos) then return nil end

    local list, eye = collectTargets(st, currentRadius())
    for _, c in ipairs(list) do
        if hasLos(eye, c.aimPoint) then
            local p = Players:GetPlayerByUserId(c.uid)
            c.name = p and p.Name or ("npc_" .. tostring(c.uid))
            return c
        end
    end
    return nil
end

local function aimAt(st, point)
    if not st or not st.pos or not point then return end
    local eye = st.pos + Vector3.new(0, st.eyeHeight or Config_m.EYE_HEIGHT, 0)
    local d = point - eye
    local m = d.Magnitude
    if m < 0.0001 then return end
    local n = d / m
    st.yaw   = math.atan2(-n.X, n.Z)
    st.pitch = math.asin(math.clamp(-n.Y, -1, 1))
end

-- garde l'aim sur la cible verrouillée pendant tout le hold
local function refreshSwingAim(st)
    local uid = Core.swingUid
    if not uid then return end

    local entry = RigAnimator_m.remotes[uid]
    local snap = entry and entry.s
    if not snap or not snap.pos or snap.dead then return end

    local point = aimPointOf(snap)
    Core.swingAim = point
    if Core.target and Core.target.uid == uid then
        Core.target.snap = snap
        Core.target.aimPoint = point
        Core.target.dist = (snap.pos - st.pos).Magnitude
    end
end

-- ---------------------------------------------------------------------
-- gâchette : machine idle -> swing -> cooldown
-- ---------------------------------------------------------------------

local function releaseSwing(now)
    pcall(function() InputController_m.releaseLeft() end)

    local hold = Core.swingHold or 0.6
    Core.lastPressAt = Core.lastPressAt or now
    Core.nextPressAt = math.max(
        now + Config.releaseGap,
        Core.lastPressAt + math.max(hold, Config.minGlobal)
    )

    Core.lastSwingUid = Core.swingUid
    Core.lastSwingAt  = now
    Core.phase    = "cooldown"
    Core.swingUid = nil
    Core.swingAim = nil
end

local function tickAttack(now)
    local st = Core.state

    -- désactivé ou mort : on ne laisse pas un swing ouvert
    if not State.enabled or not st or st.dead then
        if Core.phase == "swing" then
            pcall(function() InputController_m.releaseLeft() end)
            Core.phase    = "idle"
            Core.swingUid = nil
            Core.swingAim = nil
        end
        return
    end

    if Core.phase == "swing" then
        refreshSwingAim(st)
        if Config.lockYaw and Core.swingAim then
            aimAt(st, Core.swingAim)
        end
        if now >= Core.swingEndsAt then
            releaseSwing(now)
        end
        return
    end

    if Core.phase == "cooldown" then
        if now < Core.nextPressAt then return end
        Core.phase = "idle"
    end

    -- idle
    local t = Core.target
    if not t then return end
    if now < Core.nextPressAt then return end
    if t.dist > currentRadius() then return end

    -- tout est prêt : swing complet, visée verrouillée
    local slot = currentSlot()
    local hold = holdTimeFor(slot)

    aimAt(st, t.aimPoint)

    Core.swingUid    = t.uid
    Core.swingAim    = t.aimPoint
    Core.swingHold   = hold
    Core.swingEndsAt = now + hold
    Core.lastPressAt = now
    Core.phase       = "swing"

    local before = Core.stats.calls
    pcall(function() InputController_m.pressLeft() end)

    -- pressLeft refusé (swing déjà en cours, block, etc.) : on annule proprement
    if Core.stats.calls == before then
        pcall(function() InputController_m.releaseLeft() end)
        Core.phase       = "idle"
        Core.nextPressAt = now + 0.08
        Core.swingUid    = nil
        Core.swingAim    = nil
        Core.stats.rejected = Core.stats.rejected + 1
        return
    end

    Core.stats.swings = Core.stats.swings + 1
    Core.lastSwingUid = t.uid
end

-- ---------------------------------------------------------------------
-- visuel
-- ---------------------------------------------------------------------

local function newDrawing(class, props)
    local ok, obj = pcall(Drawing.new, class)
    if not ok or not obj then return nil end
    for k, v in pairs(props or {}) do pcall(function() obj[k] = v end) end
    return obj
end

local ring = {}
if Config.drawRing then
    for i = 1, Config.ringSegments do
        ring[i] = newDrawing("Line", { Thickness = 1, Color = Config.ringColor, Visible = false })
    end
end

local targetLine = Config.drawTarget and newDrawing("Line", {
    Thickness = 1, Color = Config.ringColor, Visible = false,
})

local function updateVisuals()
    local cam = Workspace.CurrentCamera
    local st = Core.state
    local visible = State.enabled and st and st.pos ~= nil

    if not visible then
        for i = 1, #ring do if ring[i] then ring[i].Visible = false end end
        if targetLine then targetLine.Visible = false end
        return
    end

    local radius = currentRadius()
    local center = st.pos + Vector3.new(0, 0.05, 0)
    local color = (Core.phase == "swing") and Config.ringSwingColor or Config.ringColor

    for i = 1, Config.ringSegments do
        local a1 = (i - 1) / Config.ringSegments * math.pi * 2
        local a2 = i / Config.ringSegments * math.pi * 2
        local p1 = center + Vector3.new(math.cos(a1), 0, math.sin(a1)) * radius
        local p2 = center + Vector3.new(math.cos(a2), 0, math.sin(a2)) * radius
        local s1 = cam:WorldToViewportPoint(p1)
        local s2 = cam:WorldToViewportPoint(p2)
        local line = ring[i]
        if line then
            if s1.Z > 0 and s2.Z > 0 then
                line.From    = Vector2.new(s1.X, s1.Y)
                line.To      = Vector2.new(s2.X, s2.Y)
                line.Color   = color
                line.Visible = true
            else
                line.Visible = false
            end
        end
    end

    if targetLine then
        local t = Core.target
        if t then
            local sp = cam:WorldToViewportPoint(t.aimPoint)
            if sp.Z > 0 then
                local vp = cam.ViewportSize
                targetLine.From    = Vector2.new(vp.X * 0.5, vp.Y * 0.5)
                targetLine.To      = Vector2.new(sp.X, sp.Y)
                targetLine.Color   = color
                targetLine.Visible = true
            else
                targetLine.Visible = false
            end
        else
            targetLine.Visible = false
        end
    end
end

-- ---------------------------------------------------------------------
-- boucle
-- ---------------------------------------------------------------------

installHook()
Core.enabled = State.enabled

State.conns.render = RunService.RenderStepped:Connect(function()
    local now = os.clock()

    Core.state = getState()

    if State.enabled and Core.state and not Core.state.dead then
        Core.forcedSlot = resolveForcedSlot()
        if Core.phase ~= "swing" then
            Core.target = pickTarget(Core.state)
        end
    else
        Core.forcedSlot = nil
        if Core.phase ~= "swing" then
            Core.target = nil
        end
    end

    Core.enabled = State.enabled

    tickAttack(now)
    updateVisuals()
end)

State.conns.hit = Remotes:WaitForChild("HitConfirm").OnClientEvent:Connect(function()
    Core.stats.hits = Core.stats.hits + 1
    local uid = Core.swingUid or Core.lastSwingUid
    if uid then Core.lastHitAt[uid] = os.clock() end
    local t = Core.target
    logLine(string.format("HIT %s d=%.2f", t and t.name or "?", t and t.dist or 0))
end)

State.conns.fx = Remotes:WaitForChild("AttackFx").OnClientEvent:Connect(function(attacker, victim, kind)
    if attacker == MyUid then
        kind = tostring(kind)
        Core.stats.fx[kind] = (Core.stats.fx[kind] or 0) + 1
        Core.stats.lastFx = kind .. ":" .. tostring(victim)
        logLine("FX " .. kind)
    end
end)

State.conns.hurt = Remotes:WaitForChild("Hurt").OnClientEvent:Connect(function(uid)
    local t = Core.target
    if t and uid == t.uid then
        logLine("hurt " .. t.name)
    end
end)

State.conns.input = UIS.InputBegan:Connect(function(input, processed)
    if processed then return end
    if input.KeyCode == Config.keybind then
        State.enabled = not State.enabled
        Core.enabled = State.enabled
        Core.enabledFlag = State.enabled
        logLine("aura " .. (State.enabled and "on" or "off"))
    end
end)

-- ---------------------------------------------------------------------
-- API
-- ---------------------------------------------------------------------

local function hotbarRows()
    local st = Core.state
    local rows = {}
    if not st or not st.hotbar then return rows end
    for i = 1, 36 do
        local id = st.hotbar[i]
        if id then
            local item = ItemDefs_m.items[id]
            rows[#rows + 1] = string.format("%d=%s dmg=%s spd=%s%s",
                i, id,
                tostring(item and item.damage),
                tostring(item and attackSpeedOf(item)),
                i == st.heldSlot and " *" or "")
        end
    end
    return rows
end

getgenv().McHitAura = {
    Config = Config,
    Core   = Core,

    SetEnabled = function(on)
        State.enabled = on and true or false
        Core.enabled = State.enabled
        Core.enabledFlag = State.enabled
    end,

    forceAttack = function()
        if Core.phase == "swing" then
            pcall(function() InputController_m.releaseLeft() end)
        end
        Core.phase       = "idle"
        Core.nextPressAt = 0
        Core.swingUid    = nil
        Core.swingAim    = nil
    end,

    probe = function()
        local st = Core.state
        local rows = {}
        if st and st.pos then
            local eye = st.pos + Vector3.new(0, st.eyeHeight or Config_m.EYE_HEIGHT, 0)
            local radius = currentRadius()
            local list = collectTargets(st, math.max(radius + 2, 30))
            for _, c in ipairs(list) do
                local p = Players:GetPlayerByUserId(c.uid)
                rows[#rows + 1] = string.format(
                    "%s uid=%s d=%.2f inZone=%s dead=%s los=%s",
                    p and p.Name or ("npc_" .. tostring(c.uid)),
                    tostring(c.uid), c.dist,
                    tostring(c.dist <= radius),
                    tostring(c.snap.dead),
                    tostring(hasLos(eye, c.aimPoint)))
            end
        end
        return rows
    end,

    status = function()
        local t = Core.target
        local st = Core.state
        local slot = currentSlot()
        local item = itemAt(slot)
        local swings = Core.stats.swings
        local hits = Core.stats.hits

        return {
            enabled    = State.enabled,
            phase      = Core.phase,
            keybind    = tostring(Config.keybind),
            radius     = currentRadius(),
            hold       = holdTimeFor(slot),
            slot       = slot,
            held       = st and st.hotbar and st.hotbar[st.heldSlot] or nil,
            used       = item and item.id or nil,
            reachMax   = item and item.reachMax or nil,
            posLead    = Config.posLead,
            target     = t and t.name or nil,
            targetUid  = t and t.uid or nil,
            dist       = t and t.dist or nil,
            swingUid   = Core.swingUid,
            localPos   = st and st.pos and string.format("%.1f,%.1f,%.1f", st.pos.X, st.pos.Y, st.pos.Z) or nil,
            swings     = swings,
            calls      = Core.stats.calls,
            attacks    = Core.stats.attacks,
            rewrites   = Core.stats.rewrites,
            rejected   = Core.stats.rejected,
            hits       = hits,
            hitRate    = swings > 0 and string.format("%.0f%%", 100 * hits / swings) or "0%",
            fx         = Core.stats.fx,
            lastFx     = Core.stats.lastFx,
            hasLosRay  = BlockWorld ~= nil,
            remotes    = (function()
                local n = 0
                for _ in pairs(RigAnimator_m.remotes) do n = n + 1 end
                return n
            end)(),
            hotbar     = hotbarRows(),
        }
    end,

    log = function() return Core.log end,

    Unload = function()
        State.enabled = false
        Core.enabled = false
        Core.enabledFlag = false

        if Core.phase == "swing" then
            pcall(function() InputController_m.releaseLeft() end)
        end
        Core.phase    = "idle"
        Core.swingUid = nil
        Core.swingAim = nil
        Core.target   = nil
        Core.forcedSlot = nil

        for _, conn in pairs(State.conns) do
            pcall(function() conn:Disconnect() end)
        end
        State.conns = {}

        for i = 1, #ring do
            if ring[i] then pcall(function() ring[i]:Remove() end) end
        end
        if targetLine then pcall(function() targetLine:Remove() end) end

        getgenv().McHitAura = nil
    end,
}

logLine(string.format("v3.1 chargée — rayon %.2f, hold %.3fs, posLead %.1f, %d cibles trackées",
    currentRadius(), holdTimeFor(currentSlot()), Config.posLead, (function()
        local n = 0
        for _ in pairs(RigAnimator_m.remotes) do n = n + 1 end
        return n
    end)()))

return getgenv().McHitAura
