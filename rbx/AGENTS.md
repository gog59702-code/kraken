# rbx vault — contrat de session

Ce dossier est la mémoire de travail pour tout ce qui touche Roblox :
cheats Luau, overlay C++ externe, RE, offsets, outillage.

Lis ce fichier en premier. Puis `PLAYBOOK.md`. `MEMORY.md` est le journal
(ce qui a été décidé, cassé, corrigé). Les snippets sont la vérité canonique :
on les étend, on ne les réécrit pas à zéro.

## Règles

1. **Snippets = source.** Un nouveau ticket part de `snippets/luau/cheat_core.luau`
   ou de `snippets/cpp/` et ajoute un module, il ne repart pas d'une page blanche.
2. **Offsets jamais en dur dans le code de travail.** Ils vivent dans
   `snippets/cpp/sdk.hpp` derrière `namespace off`, avec la version du client en
   commentaire. Re-dump = nouveau fichier daté + mise à jour de `MEMORY.md`.
3. **Une découverte = une ligne dans `MEMORY.md`** : date, hash de build Roblox,
   fichier touché, ce qui a changé. Sans ça, la prochaine session repart de zéro.
4. **Nommage.** Lua : `snake_case`, modules en camel si l'API l'impose.
   C++ : `PascalCase` types, `snake_case` champs, préfixe `g_` global.
   Fichiers : `kebab-case` hors code.
5. **Ne pas toucher** aux autres dossiers de `C:\Users\User\ia` (kraken, deploy-*).
   Le vault est autonome.
6. **Environnement.** PowerShell 7, VS2022 (Générateur "Visual Studio 17 2022"),
   CMake ≥ 3.25, Python 3.12, Node LTS. vcpkg à `%USERPROFILE%\vcpkg`.
7. **Luau d'abord.** 90 % des cheats se font côté client avec l'API executor.
   Le C++ externe ne sort que quand il faut lire la mémoire ou dessiner hors du jeu.
8. **Madium.** MCP natif (`tools.madium.*`, 37 outils) : `runtime_status`
   avant toute rafale, recettes dans `madium/MADIUM.md`, index dans
   `madium/tools.json`. Si un outil manque, mapper sur l'équivalent local
   (x64dbg, CE, scripts) et l'écrire dans `MEMORY.md`.

## Checklist avant de livrer un cheat

- [ ] Le module s'insère dans `cheat_core.luau` sans casser l'existant
- [ ] Cleanup : `Unload()` retire drawings, gui, BodyVelocity, restore CanCollide
- [ ] Pas de `while true do wait() end` — `RenderStepped` / `Heartbeat` + guard
- [ ] Les remotes touchés sont loggés par `remote_spy.luau` avant d'être abusés
- [ ] C++ : compile `/W4 /permissive-`, offset FILL=0 → sortie propre, pas de crash
- [ ] Une ligne dans `MEMORY.md`

## Arborescence

```
rbx/
├─ AGENTS.md
├─ PLAYBOOK.md
├─ MEMORY.md
├─ snippets/
│  ├─ luau/cheat_core.luau
│  ├─ luau/silent_aim.luau
│  ├─ luau/voxel_silent.luau
│  ├─ luau/voxel_esp.luau
│  ├─ luau/mc_hitaura.luau
│  ├─ luau/mc_validate.luau
│  ├─ luau/remote_spy.luau
│  └─ cpp/{mem.hpp,sdk.hpp,overlay.cpp,CMakeLists.txt}
├─ tools/{install-stack.ps1,build.ps1,dump-offsets.md}
└─ madium/{MADIUM.md,tools.json}
```

## Déploiement vers le client

Le workspace de l'executor est un vrai dossier :
`%LOCALAPPDATA%\Madium\workspace\`. Copier un module dans
`workspace\ia\`, puis `run_executor_file { path: "ia/<module>.luau" }`.
Évite de coller la source dans un appel MCP.
