# PLAYBOOK — Roblox cheat dev

Index maître. Tout ce qui se réapprend à chaque session est ici, une fois.

## 1. Les trois étages

| Étage | Véhicule | Ce que ça donne | Fragilité |
|---|---|---|---|
| Luau executor | `Drawing`, API exploit | ESP, aimbot, remote abuse, farm, fly | dépend du loader / Hyperion |
| C++ externe | `ReadProcessMemory` | ESP infalsifiable, radar, alertes | offsets par build |
| Kernel / DMA | driver signé / PCILeech | la seule route stable vs Byfron | barrière d'entrée matérielle |

Règle : un ticket "cheat" commence toujours par l'étage 1. Les étages 2/3
ne se justifient que si le cheat doit survivre à un executor patché.

## 2. Surface API executor (la vraie boîte à outils)

```
getgenv / getrenv / getreg        environnements
getrawmetatable / setreadonly     metatables
hookfunction / hookmetamethod     hooks Lua
checkcaller / islclosure          détection côté hook
getnamecallmethod                 dans __namecall
getconnections / firesignal       signaux
firetouchinterest                 touches
fireproximityprompt               prompts
gethiddenproperty / sethiddenproperty
getnilinstances / getinstances    instances non parentées
saveinstance                     dump map
decompile / getscriptbytecode    sources
getloadedmodules                 modules
request / http_request           HTTP
setclipboard / queue_on_teleport
getcustomasset                   assets locaux
cloneref                         anti-détection de référence
identifyexecutor                 nom du loader
```

Patterns qui reviennent :

```lua
-- namecall hook (remote spy / auto-validate bypass)
local old; old = hookmetamethod(game, "__namecall", function(self, ...)
    if not checkcaller() and getnamecallmethod() == "FireServer" then
        -- inspect self, ...
    end
    return old(self, ...)
end)

-- __index hook (lecture/falsification de propriété locale)
local oldIndex = hookmetamethod(game, "__index", function(self, key)
    if not checkcaller() and key == "WalkSpeed" then return 100 end
    return oldIndex(self, key)
end)
```

Identity : un thread d'executor tourne à un niveau élevé (7/8). Toute
tentative de patch de la VM Luau (spoof identity, `luaD_precall`) doit
être compilée contre la même version de Luau que le client.

## 3. Hyperion (Byfron) — ce qu'il fait, les trois sorties

Il vit dans `RobloxPlayerBeta.exe` : scan des modules chargés, des threads,
des handles ouverts sur le process, intégrité du `.text`, timing.

| Route | Mécanique | Coût |
|---|---|---|
| Injection pré-init | mapper manuel via driver signé, avant l'init d'Hyperion | cert, driver, VM |
| Hijack de handle | dupliquer un handle légitime d'un process tiers | fragile, dépend du build |
| DMA | `pcileech` + `MemProcFS`, aucun handle dans le process | carte + 2ᵉ machine |

`OpenProcess(VM_READ)` en boucle + `ReadProcessMemory` = repérage rapide.
Un externe "propre" lit peu, lentement, avec des handles dupliqués.

## 4. Structure des données Roblox (Ce qui se dump)

```
FakeDataModel (global .data)
  └─ DataModel              ("Game")
       ├─ Workspace
       ├─ Players ── Player ── Model ── HumanoidRootPart ── Primitive ── Position
       └─ ...
```

- `Instance.children` : `std::vector<Instance*>` MSVC = 3 pointeurs
  (`begin`, `end`, `capacity`). `count = (end-begin)/8`, borner à 8192.
- `Instance.Name` / `Instance.ClassName` : `std::string` MSVC 32 octets,
  SSO ≤ 15 (buffer inline), sinon `char*` + taille.
- `BasePart.Primitive` → struct dont la tête est la position monde (3 floats).
- `VisualEngine` → matrice 4×4 view/proj : `w = m[0][3]x + m[1][3]y + m[2][3]z + m[3][3]`.
- Écran : `x = W/2 * (ndc.x + 1)`, `y = H/2 * (1 - ndc.y)`.

Recette complète dans `tools/dump-offsets.md`. Offsets courants dans
`snippets/cpp/sdk.hpp`.

## 5. Silent aim — les trois couches

Un jeu peut résoudre un hit de trois façons ; on couvre les trois, dans cet
ordre, et on laisse les toggles les désactiver.

1. **Remote** — le client envoie l'instance touchée (`FireServer(hitPart)`).
   Hook `__namecall` : tout `BasePart` appartenant à un personnage ennemi est
   remplacé par `State.target`. Les `Vector3` proches du vrai hit souris
   (< `rewriteRadius`) sont remplacés par la position de la cible.
2. **Souris** — le jeu lit `mouse.Hit` / `mouse.Target` / `mouse.UnitRay`.
   Hook `__index` sur l'objet Mouse, garde `self == Mouse`.
3. **Caméra** — le jeu construit son rayon via `Camera:ViewportPointToRay`.
   Hook `__namecall` sur Camera, retourne un `Ray` vers la cible.

`checkcaller()` sur chaque hook : nos propres appels passent intacts.
`State.bypass` pour lire le vrai `mouse.Hit` sans récursion.
La caméra ne bouge jamais — c'est ce qui rend le tir silencieux.

### 5 bis. Le cas réel : shooter voxel, place `78884249003161`

Ce jeu ne fonctionne pas à l'instance touchée. Chaque arme envoie au serveur
une **origine + une direction unitaire**, et le serveur re-raycast de son côté.
Conséquence : le silent aim réécrit l'argument direction, pas un `BasePart`.

Signatures relevées par décompilation des `ToolTemplates` (PlaceVersion 2685) :

| Remote | Arguments |
|---|---|
| `FireRifle` `FireSMG` `FireLMG` `FireDMR` `FireSniper` `FirePistol` `FireHandCannon` `FireMinigun` | `(origin: Vector3, dir: Vector3 unit, serverTime: number, look: Vector3, cone: number)` |
| `FireShotgun` | `(muzzleOrigin: Vector3, camOrigin: Vector3, ...pelletEnd: Vector3)` |
| `KnifeHit` `MeleeSwing` `HammerHit` `Punch` | `(dir: Vector3 unit)` — rayon caméra |

Réécriture : `dir = (aim - origin).Unit`, et `look` reçoit la même valeur pour
rester cohérent. Shotgun : chaque `pelletEnd` = position cible. Mêlée :
`args[1] = (aim - camera.Position).Unit`.

Le serveur applique sa balistique (`Ballistics.SPEED = 1700`, `GRAVITY = 24.525`,
`DRAG = 0.0014`) : sur une cible en mouvement, avancer la position de
`distance / bulletSpeed`. Module : `snippets/luau/voxel_silent.luau`.

### 5 ter. Le cas réel : « +1 Heart Per Kill », place `82331798712738`

Moteur maison, pas de `Humanoid`, pas d'équipes. Les joueurs sont des modèles
`Rig_<userId>` ; la position vient de `RigAnimator.remotes[uid].s`
(`pos`, `prevPos`, `dead`, `yaw`, `pitch`, `health`), interpolée.

**État local vivant.** `getupvalues(InputController.pressLeft)[3]` donne la
table du `MovementController` : `pos`, `vel`, `yaw`, `pitch`, `eyeHeight`,
`hotbar`, `heldSlot`, `attackTicker`, `swingInProgress`, `dead`. C'est la
source sans latence ; le payload `State` ne sert qu'à confirmer.

**Payload `State` (20 Hz, `State:UnreliableRemoteEvent`) :**

```
{ pos, vel, yaw, pitch, sprint, sneak, onGround, blocking,
  swinging = swingInProgress, slot = heldSlot, gliding, slowFalling, crash }
```

Le hook `__namecall` peut muter la table avant l'envoi (silent aim + flags).

**Chaîne d'attaque :**

```
InputController.pressLeft()
  -> startSwing()  (swingInProgress = true, attackTicker = 0)
  -> onAttack()
       -> pickCrystal()
       -> pickTarget()   -- rayBox sur RigAnimator.targets(), REACH = 3
       -> Remotes.Attack:FireServer(uid or 0)
```

Le serveur résout le coup à la **fin du swing**, pas au paquet `Attack`.
Durée du swing = `1 / attackSpeed` s (`sword = 1.6` -> 0.625 s). Tenir
`pressLeft` jusqu'à la fin donne la charge 1.0 -> `AttackFx` type `strong`.
Relâcher trop tôt = coup `weak` ou annulé.

**Portée.** Le client utilise `REACH = 3` (+ `REACH_LAG_SLACK = 0.5`), mais le
serveur accepte des hits confirmés jusqu'à **4.97 studs** (cible qui avance
entre l'aim et la résolution). L'aura utilise un rayon de **5.0**.

**Visée.** `BlockWorld.lookVector(yaw, pitch) =`
`(-sin(yaw)*cos(pitch), -sin(pitch), cos(yaw)*cos(pitch))`.
Pour viser un point : `pitch = asin(-n.Y)`, `yaw = atan2(-n.X, n.Z)`.
Hitbox : `HITBOX_WIDTH = 0.6`, `HITBOX_HEIGHT = 1.8`, `EYE_HEIGHT = 1.62`.

**Knockback (`Knockback` module).** `victim` = `push(vel, dir, KB_BASE = 0.4)`
puis `extra(...)` = `push(vel, sin(yaw), -cos(yaw), level * 0.5)` quand le
coup est classé `sprint`. Vertical plafonné à `KB_VERTICAL_CAP = 0.4` au sol.
Donc knockback max = **charge pleine (`strong`) + `State.sprint = true`**.
`KB_ATTACKER_SLOW = 0.6` est appliqué à l'attaquant sur `HitConfirm`.

**Dégâts (`Damage` module).**
`attackStrength = clamp((ticker + 0.5) / (20 / attackSpeed), 0, 1)`,
`raw = damage * (0.2 + 0.8 * charge²) + sharpness`, `× 1.5` si crit,
`+ knockbackLevel * charge`. Un coup ne fait des dégâts pleins que si
`hurtResistantTime <= 10` ticks (demi-fenêtre de `IMMUNITY_TICKS = 20`).

**Signaux.** `HitConfirm` = hit local confirmé (args nil). `AttackFx`
`(attackerUid, victimUid, type)` avec
`type ∈ weak | strong | knockback | sprint | block | sweep | smash_*` ;
filtrer `attackerUid == LocalPlayer.UserId` pour nos hits. `Hurt` est bruité.

**Aura.** `snippets/luau/mc_hitaura.luau` (v3.1) : machine
`idle -> pressLeft -> hold plein -> releaseLeft -> cooldown`, aim verrouillé
sur la cible pendant tout le hold (le serveur résout à la fin), `sprint`
spoofé pendant le swing, rayon 5.0, entrée instantanée. Le hook réécrit
`Attack` vers l'uid verrouillé et `State.yaw/pitch` vers la cible.

**Reload.** Le core (`getgenv()._mcHitAuraCore`) est partagé : un seul hook
`__namecall`, jamais réinstallé. En revanche les connexions `RenderStepped` /
remotes vivent dans `Core.conns` et sont coupées au début de chaque chargement —
sinon deux boucles tournent et `pressLeft` part deux fois. `Core.enabledFlag`
conserve l'état on/off entre les reloads.

**Extension de portée (`Config.posLead`).** Le serveur valide la distance avec
le `State.pos` que le client lui envoie. Décaler `State.pos` vers la cible
pendant le swing (0.5–2 studs) rapproche la position *vue par le serveur* sans
toucher au personnage local. Défaut 0 (non mesuré) ; tester 1.5 puis 2.0 et
lire `hits/swings`. Risque : correction de mouvement / rubber-band si le serveur
revalide la position.

**Sélection de cible.** Tri : cibles fraîches d'abord (`dist`), cibles déjà
frappées dans les `Config.hitCooldown = 0.9 s` ensuite — l'immunité de dégâts
est de `IMMUNITY_TICKS = 20` (1 s), inutile de gaspiller un swing plein sur une
cible encore immunisée quand une autre est à portée.

**Mesure.** `snippets/luau/mc_validate.luau` se charge après l'aura, tourne
30 s, et rend `getgenv().McValidate.summary` :
`maxDist` (portée réelle acceptée), `sprintHoriz` vs `normalHoriz`
(knockback sprint vs charge pleine), `byKind` (répartition `strong|sprint|weak`).
Chaque hit garde `dx/dy/dz` (déplacement de la cible entre press et confirm).

## 6. ESP — rendu client

Deux couches, aucune ne touche un remote :

1. **Drawing** — boîte projetée sur les 8 coins de `Model:GetBoundingBox()`,
   barre de vie, nom, distance, arme en main. Un cache `[player] = entry`,
   jamais recréé par frame.
2. **Highlight** — `Instance.new("Highlight")` parenté au personnage :
   traverse les murs (`AlwaysOnTop`), gratuit, local seulement.

Règles : rejeter si moins de 4 coins ont `Z > 0` ; cacher au lieu de détruire ;
`PlayerRemoving` + sweep 5 s pour les personnages respawn ; couleur d'équipe
via `player.Team`. Module : `snippets/luau/voxel_esp.luau`.

## 7. Remotes pièges

Le jeu expose des remotes nommés pour attirer :

```
applydamage  hitplayer  setwalkspeed  teleportplayer  togglegod
refillammo   spawncar   espupdate     aimassisttarget  playerpositions
getenemydata  CheatFlag  ReportClient  ReportTouch  ReportFirst
```

Ils ne sont appelés par aucun script client légitime : ce sont des capteurs.
On ne les appelle pas, on ne les hook pas, on ne les mentionne pas en jeu.
`CheatFlag` est le point de report — s'il apparaît dans `remote_spy`, la
session est déjà marquée.

## 8. Détection côté jeu (pas Hyperion — l'anti-cheat du jeu)

- Téléport violent → snap de position, `Humanoid:MoveTo` incohérent.
- WalkSpeed au-delà de ~1.6× la normale → flag.
- Fly → état `Physics` avec vélocité constante, facile à heuristiquer.
- Aimbot → angle delta par frame trop régulier ; lisser, ajouter du bruit.
- Remote abuse → taux d'appels et valeurs hors bornes.

Contournement : magnitudes petites, deltas étalés, valeurs dans les bornes
observées sur les joueurs légitimes. `remote_spy.luau` donne les bornes
réelles en quelques minutes de jeu.

## 9. Règles de design des modules Luau

- Un seul `RenderStepped` par module. Tout le reste est un helper appelé.
- Cache des `Drawing` par joueur, jamais recréer par frame.
- `pcall` autour de chaque appel Drawing — certains loaders n'exposent pas tout.
- `Config` unique en haut, mutable à chaud via `getgenv().Hub.Config`.
- `Unload()` explicite : drawings, ScreenGui, BodyVelocity, CanCollide.
- Les keybinds passent par `UserInputService`, jamais `IsKeyDown` polled.

## 10. Règles overlay C++

- Fenêtre `WS_EX_LAYERED | WS_EX_TRANSPARENT | WS_EX_TOPMOST | WS_EX_TOOLWINDOW`,
  color-key noir, D3D11 + ImGui.
- Thread de lecture séparé (250 ms), thread de rendu 60 fps. Aucun `RPM`
  dans la boucle de rendu.
- Offsets en `namespace off`, FILL=0 par défaut → le walker sort proprement.
- Tout pointeur lu est validé : non nul, count < borne, taille de string < 256.
- Un target mort/cassé → on saute, jamais on ne fige.

## 11. Outils et usage

| Outil | Usage |
|---|---|
| x64dbg | signatures, breakpoints sur `DataModel`, `.text` |
| Ghidra / IDA | vtables, sérialisation, TaskScheduler |
| Cheat Engine | pointer scan avant code |
| ReClass.NET | layout `Instance`, `Primitive`, `Humanoid` |
| System Informer | handles, modules, threads |
| Frida | hook rapide avant portage C++ |
| konstant / Unluau | décompilation bytecode |
| Roblox-Client-Tracker | API dump, FFlags, hash de build |
| pcileech / MemProcFS | route DMA |

## 12. Fichiers du vault

- `snippets/luau/cheat_core.luau` — ESP, aimbot, teleport, fly, speed, noclip.
- `snippets/luau/silent_aim.luau` — silent aim générique : remotes, mouse, caméra.
- `snippets/luau/voxel_silent.luau` — silent aim du shooter voxel (direction de remote).
- `snippets/luau/voxel_esp.luau` — ESP Drawing + Highlight du shooter voxel.
- `snippets/luau/mc_hitaura.luau` — hit aura « perfect hit » du jeu +1 Heart Per Kill.
- `snippets/luau/remote_spy.luau` — FireServer/InvokeServer live.
- `snippets/cpp/mem.hpp` — process, RPM, pattern scan.
- `snippets/cpp/sdk.hpp` — offsets + walker d'instances.
- `snippets/cpp/overlay.cpp` — overlay D3D11 + ImGui.
- `tools/install-stack.ps1` — installation complète.
- `tools/build.ps1` — build C++ + vérif Luau.
- `tools/dump-offsets.md` — recette de dump.
- `madium/MADIUM.md` — surface réelle des 37 outils + recettes.
- `madium/tools.json` — index machine-readable + règles d'usage.
