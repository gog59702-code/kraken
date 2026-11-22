--!nocheck
-- mc_validate.luau — mesure live de McHitAura (portée + knockback)
-- place 82331798712738
--
-- À charger APRÈS mc_hitaura.luau :
--   run_executor_file { path = "ia/mc_hitaura.luau" }
--   run_executor_file { path = "ia/mc_validate.luau" }
--
-- Ce que le script mesure, hit par hit :
--   * distAtPress : distance cible/attaquant au moment du pressLeft
--   * dx/dy/dz    : déplacement de la cible entre le press et le HitConfirm
--   * kind        : type AttackFx (strong | sprint | weak | ...)
--
-- Sortie : getgenv().McValidate.summary (table) + print console.
-- Arrêt anticipé : getgenv().McValidate.stop()

local Players    = game:GetService("Players")
local RunService = game:GetService("RunService")
local RS         = game:GetService("ReplicatedStorage")

local LocalPlayer = Players.LocalPlayer
local MyUid       = LocalPlayer.UserId

local Aura = getgenv().McHitAura
if not Aura then
    return warn("[mc_validate] charge mc_hitaura.luau d'abord")
end

local RigAnimator = require(
    LocalPlayer:WaitForChild("PlayerScripts"):WaitForChild("RigAnimator"))

local Remotes = RS:WaitForChild("Remotes")
local HitConfirm = Remotes:WaitForChild("HitConfirm")
local AttackFx   = Remotes:WaitForChild("AttackFx")

local Report = getgenv().McValidate
if not Report or not Report.version then
    Report = {
        version = 1,
        running = false,
        hits    = {},
        summary = nil,
        stop    = function() Report.running = false end,
    }
    getgenv().McValidate = Report
end
Report.hits = {}
Report.summary = nil
Report.running = true

local Core = Aura.Core
local DURATION = 30          -- secondes de mesure
local KIND_WINDOW = 0.30     -- AttackFx rattaché au hit dans cette fenêtre

local press = nil            -- { uid, name, at, dist, pos }
local pending = {}           -- [uid] = index dans Report.hits
local lastFx = {}            -- [victimUid] = { kind, at }

local function nameOf(uid)
    local p = Players:GetPlayerByUserId(uid)
    return p and p.Name or ("npc_" .. tostring(uid))
end

local function snapOf(uid)
    local e = RigAnimator.remotes[uid]
    return e and e.s or nil
end

local conns = {}

-- position de la cible au moment où le swing démarre
conns[#conns + 1] = RunService.RenderStepped:Connect(function()
    if not Report.running then return end
    if Core.phase ~= "swing" or not Core.swingUid then return end
    if press and press.uid == Core.swingUid then return end

    local s = snapOf(Core.swingUid)
    if not s or not s.pos then return end

    local st = Core.state
    press = {
        uid  = Core.swingUid,
        name = nameOf(Core.swingUid),
        at   = os.clock(),
        dist = st and st.pos and (s.pos - st.pos).Magnitude or nil,
        pos  = s.pos,
    }
end)

conns[#conns + 1] = HitConfirm.OnClientEvent:Connect(function()
    if not Report.running then return end

    local uid = (press and press.uid) or Core.lastSwingUid
    if not uid then return end

    local s = snapOf(uid)
    local now = os.clock()
    local entry = {
        uid        = uid,
        name       = nameOf(uid),
        at         = now,
        distAtPress = press and press.dist or nil,
        dx = 0, dy = 0, dz = 0,
        kind       = nil,
        holdTime   = press and (now - press.at) or nil,
    }

    if press and press.pos and s and s.pos then
        local d = s.pos - press.pos
        entry.dx, entry.dy, entry.dz = d.X, d.Y, d.Z
        entry.horizontal = Vector3.new(d.X, 0, d.Z).Magnitude
        entry.total      = d.Magnitude
    end

    local fx = lastFx[uid]
    if fx and now - fx.at <= KIND_WINDOW then entry.kind = fx.kind end

    Report.hits[#Report.hits + 1] = entry
    pending[uid] = #Report.hits
    press = nil
end)

conns[#conns + 1] = AttackFx.OnClientEvent:Connect(function(attacker, victim, kind)
    if attacker ~= MyUid then return end
    kind = tostring(kind)
    lastFx[victim] = { kind = kind, at = os.clock() }

    local idx = pending[victim]
    if idx and Report.hits[idx] and not Report.hits[idx].kind then
        Report.hits[idx].kind = kind
    end
end)

local function summarize()
    local n = #Report.hits
    local sum = {
        hits       = n,
        duration   = DURATION,
        maxDist    = nil,
        avgHoriz   = nil,
        byKind     = {},
        sprintHoriz = nil,
        normalHoriz = nil,
    }

    local hSum, hCount = 0, 0
    local sSum, sCount = 0, 0
    local nSum, nCount = 0, 0

    for _, h in ipairs(Report.hits) do
        if h.distAtPress and (not sum.maxDist or h.distAtPress > sum.maxDist) then
            sum.maxDist = h.distAtPress
        end

        local kind = h.kind or "unknown"
        sum.byKind[kind] = (sum.byKind[kind] or 0) + 1

        if h.horizontal then
            hSum = hSum + h.horizontal
            hCount = hCount + 1
            if kind == "sprint" then
                sSum = sSum + h.horizontal
                sCount = sCount + 1
            elseif kind == "strong" or kind == "knockback" then
                nSum = nSum + h.horizontal
                nCount = nCount + 1
            end
        end
    end

    if hCount > 0 then sum.avgHoriz = hSum / hCount end
    if sCount > 0 then sum.sprintHoriz = sSum / sCount end
    if nCount > 0 then sum.normalHoriz = nSum / nCount end

    Report.summary = sum
    return sum
end

task.delay(DURATION, function()
    if not Report.running then return end
    Report.running = false
    for _, c in ipairs(conns) do pcall(function() c:Disconnect() end) end
    local s = summarize()

    print(string.format(
        "[mc_validate] %d hits | portée max %.2f | horiz moyen %.2f | sprint %.2f vs normal %.2f",
        s.hits, s.maxDist or 0, s.avgHoriz or 0,
        s.sprintHoriz or 0, s.normalHoriz or 0))

    for _, h in ipairs(Report.hits) do
        print(string.format(
            "  %-16s d=%.2f hold=%.2f %s dx=%.2f dy=%.2f dz=%.2f",
            h.name, h.distAtPress or 0, h.holdTime or 0, h.kind or "?",
            h.dx or 0, h.dy or 0, h.dz or 0))
    end
end)

print("[mc_validate] mesure lancée — 30 s, arrêt : getgenv().McValidate.stop()")
return Report
