# MEMORY — journal du vault

Format d'entrée : `AAAA-MM-JJ | build Roblox (hash) | fichier | fait | reste`

## 2026-11-22 — création du vault

- Snippets initiaux posés : `cheat_core.luau`, `remote_spy.luau`, `mem.hpp`,
  `sdk.hpp`, `overlay.cpp`, `CMakeLists.txt`.
- `sdk.hpp` livré avec les offsets à **FILL=0** : il compile et sort proprement,
  il ne lit rien tant que la recette `tools/dump-offsets.md` n'a pas été passée
  sur le build courant.
- Stack d'installation décrite, pas exécutée : winget id à valider au premier run
  (`Microsoft.WindowsSDK.10.0.26100` peut varier).
- Madium : connecté en cours de session, 37 outils runtime. Surface documentée
  dans `madium/MADIUM.md` (recettes ticket → chaîne d'appels) et
  `madium/tools.json` (index + règles). Pas de client externe nécessaire.

## 2026-11-22 | — | madium/ | branchement du MCP

- Outils confirmés : exécution Luau capturée, eval, décompilation, bytecode,
  inspection DataModel/remotes/GUI/GC, files executor, input synthétique.
- Conséquence : la boucle de dev ne passe plus par "coller dans l'executor".
  `execute_luau { capture: true }` → `tail_console` → `write_executor_file`.
- Ce qui reste hors Madium : offsets mémoire, signature scanning, overlay C++,
  route kernel/DMA. Inchangé.

## 2026-11-22 | — | snippets/luau/silent_aim.luau | silent aim complet

- Trois couches : remote args (`__namecall`), mouse (`__index`), caméra
  (`ViewportPointToRay`). Caméra immobile, `checkcaller()` partout,
  `State.bypass` pour lire le vrai `mouse.Hit`.
- Écrit et sauvegardé, **pas exécuté** : le client Madium (PID 12572) s'est
  déconnecté avant le push, `runtime_status` renvoie `clients: []`.
- Séquence de push prête : `write_executor_file` → `run_executor_file`
  (`capture: false`) → `eval_luau` sur `getgenv().SilentAim.status()`.
- À valider en jeu : quel argument le remote envoie (Instance / Vector3 /
  CFrame), sinon activer `rewriteVector` ou compléter par un hook `Raycast`.

## 2026-11-22 | place 78884249003161 v2685 | voxel_silent.luau + voxel_esp.luau | en jeu

- Client reconnecté (PID 41336, Madium 2.0.0). Jeu : « Ugc », `PlaceVersion 2685`,
  groupe `755214094`, 27 joueurs, équipes Reds / Blues.
- Armes = outils serveur dans le `Backpack` (`AssaultRifle`, `Pistol`, `Hammer`,
  `Grenade`, `RocketLauncher`), pas de hitscan instance. Chaque tir envoie
  `(origin, dir unit, serverTime, look, cone)` à `FireRifle` & co — signatures
  complètes dans `PLAYBOOK.md` §5 bis.
- `voxel_silent.luau` poussé et **validé côté client** : cible verrouillée à
  418 studs, `rewrites` passe de 3 à 9 sur une rafale, la direction capturée
  par `Probe()` pointe bien sur la cible. Dégâts non confirmés (aucun ennemi
  à vue dégagée au moment du test).
- `voxel_esp.luau` poussé et **validé** : 23 joueurs suivis, 15 visibles,
  44 `Highlight` dans le workspace (dont ceux du jeu).
- Remotes pièges identifiés et listés dans `PLAYBOOK.md` §7 : `applydamage`,
  `espupdate`, `aimassisttarget`, `CheatFlag`, `ReportClient`… jamais appelés.
- Astuce déploiement : le workspace de l'executor est sur disque —
  `%LOCALAPPDATA%\Madium\workspace\` — donc `Copy-Item` puis
  `run_executor_file { path: "ia/<fichier>.luau" }`, sans coller 11 Ko de source.
- Reste : confirmer les dégâts serveur sur une cible immobile à vue, mesurer
  la chute balistique à 300+ studs, tester `FireShotgun` (pellets) et `KnifeHit`.

## 2026-11-22 | place 82331798712738 | snippets/luau/mc_hitaura.luau v3.1 | à charger

- Nouveau jeu : « +1 Heart Per Kill », moteur maison (pas de Humanoid),
  rigs `Rig_<userId>`, 19–22 joueurs, pas d'équipes.
- Combat décompilé : `onAttack -> pickCrystal -> pickTarget -> Attack:FireServer(uid)`.
  `pickTarget` = `rayBox` sur `RigAnimator.targets()`, `REACH = 3`,
  `AIM_FORGIVENESS = 0.2`. `State` part à 20 Hz sur `State:UnreliableRemoteEvent`.
- État local : `getupvalues(InputController.pressLeft)[3]` = table du
  `MovementController` (`pos`, `yaw`, `pitch`, `hotbar`, `heldSlot`,
  `attackTicker`, `swingInProgress`, `dead`).
- Recette de hit validée en jeu : écrire `st.yaw`/`st.pitch` vers la cible,
  `pressLeft()`, tenir ~0.62–0.7 s, `releaseLeft()`. Le serveur résout à la
  fin du swing ; release immédiat = rien.
- Portée serveur acceptée mesurée : hit confirmé à `d = 4.97` (client REACH 3).
  `sword` charge pleine à `1/1.6 = 0.625 s` -> `AttackFx` type `strong`.
- Knockback : `KB_BASE = 0.4` + extra horizontal `0.5` quand le coup est
  classé `sprint` ; vertical plafonné à `0.4` au sol. Max = `strong` + sprint.
- `HitConfirm` = hit local (args nil). `AttackFx(attacker, victim, type)` :
  `weak|strong|knockback|sprint|block|sweep|smash_ground|smash_heavy|smash_air`.
- v2 avait `Config.autoAttack` inexistant -> auto-attack jamais déclenché.
  v3 : machine `idle -> swing -> cooldown`, hold plein, aim verrouillé pendant
  le swing, `State.sprint = true` pendant le hold, rayon 5.0, entrée instantanée.
- v3.1 (statique, non chargée) :
  - reload coupe les connexions de la charge précédente (`Core.conns`) : plus de
    double `RenderStepped` ni de double `pressLeft` quand on recharge le fichier ;
  - `Core.enabledFlag` : l'état on/off survit au reload ;
  - `Config.hitCooldown = 0.9` : une cible déjà frappée passe après les fraîches
    dans le tri (l'immunité serveur est de 20 ticks = 1 s) ;
  - `Config.posLead` (défaut 0) : décale `State.pos` vers la cible pendant le
    swing — le serveur lit cette position pour la validation de distance, donc
    c'est la seule piste pour dépasser le `reachMax` mesuré (à tester 1.5–2.0) ;
  - `hasLos` blindé (raycast number/table/nil), `forceAttack` relâche un swing
    ouvert, `status()` expose `reachMax`, `posLead`, `attacks`.
  - vérifié : `luaparse` OK ; copie workspace hash
    `E0A95578…71955E`.
- **Pas encore chargée** : le client est toujours déconnecté (`clients: []`,
  « Madium owns runtime IPC »). Dernier check 2026-11-22.
- Reste : relancer le jeu, charger, vérifier `hits/swings` et `fx` (`strong`,
  `sprint`), mesurer le déplacement victime sprint vs sans, tester rayon 5.2,
  puis `Config.posLead = 1.5` et re-mesurer la portée acceptée.

## Décisions

- Luau comme étage par défaut. C++ seulement pour la lecture mémoire et l'overlay.
- Aucun offset codé en dur hors de `sdk.hpp`; chaque build = un fichier daté.
- Un fichier de snippets unique par langage plutôt que 10 micro-fichiers :
  plus rapide à charger en contexte, plus simple à étendre.
- Pas de dépendance à un executor précis : `cloneref` et `Drawing` sont
  optionnels et détectés à l'exécution.

## À vérifier à la prochaine session

- [ ] version de Luau utilisée par le client (pour tout patch VM)
- [ ] hash de build Roblox courant → dumper les offsets réels
- [ ] capacité de Madium : `python madium/mcp_call.py list`
- [ ] winget id du Windows SDK installé
- [ ] `Drawing.Fonts` exposé par le loader utilisé

## Ce qui casse en premier

1. Les offsets après une update.
2. Les loaders qui n'exposent ni `Drawing` ni `getscriptbytecode`.
3. Les noms de services si Roblox renomme (rare mais arrive sur les FFlags).
4. Les anti-cheat de jeu quand on pousse les magnitudes trop loin.
