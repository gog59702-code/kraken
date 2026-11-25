# MADIUM — surface réelle + recettes

MCP natif : `tools.madium.*`. Pas de client externe, pas de config à écrire.
Toujours `runtime_status` / `list_runtime_clients` avant le reste.
Tous les outils runtime acceptent `pid` (défaut : client configuré ou le plus récent).

> **Disponibilité.** Le namespace peut être absent du catalogue selon la
> session (`Unknown tool 'madium.runtime_status'`). Dans ce cas : aucun
> pilotage live, mais le déploiement reste identique sur disque —
> `%LOCALAPPDATA%\Madium\workspace\ia\<fichier>.luau` — et l'executor
> charge le fichier à la main. Le vault, les snippets et les mesures
> déjà consignées ne dépendent pas du pont.

## 1. Cartographie des 37 outils

**Runtime / état**
- `runtime_status` — pipe host, clients, settings, console, dernière erreur.
- `list_runtime_clients` — chaque module connecté au pipe nommé.
- `get_client_info` — jeu, joueur, perf, display, input, locale, streaming, executor, counts.
- `scan_runtime_capabilities` — quels globals bundled existent dans l'environnement.

**Luau**
- `execute_luau` — queue du code, capture valeurs/erreurs/types/paths/tables.
- `eval_luau` — une expression, retour sérialisé.
- `run_executor_file` — charge et exécute un fichier du workspace executor.
- `list_actors` — coroutines/threads actifs, identité.
- `list_executor_files`, `read_executor_file`, `write_executor_file` — filesystem executor.
- `tail_console` — messages du module, tables expand.

**Inspection DataModel**
- `inspect_instance` — class, parent, enfants, attributs, propriétés communes.
- `get_descendants_tree` — sous-arbre borné, filtre classe, props optionnelles.
- `search_instances` — par nom + classe, chemins complets.
- `inspect_connections` — callbacks d'un RBXScriptSignal.
- `list_remotes` — RemoteEvent/RemoteFunction (+ Bindables).

**Scripts**
- `decompile_script` — résout un chemin, décompile, source bornée.
- `inspect_script_bytecode` — taille, hash, préfixe base64.
- `search_runtime_scripts` — par nom/chemin via `getscripts`.
- `search_gc` — `getgc` filtré par nom de fonction ou clés de table.

**Environnement / API**
- `list_environment_libraries`, `get_environment_library`.
- `search_environment_api`, `get_environment_function`.
- `inspect_environment_function` — type, debug.info, getfenv, identity, closures.
- `probe_callback_context` — identité de coroutine, traceback, erreurs imbriquées.
- `search_globals` — globals et namespaces par nom.

**UI**
- `inspect_visible_ui` — objets GUI visibles, texte, géométrie, z-index, flags.
- `click_gui_button` — firesignal puis clic centré en fallback.
- `type_into_textbox` — VirtualInputManager, submit optionnel.
- `send_input` — une action clavier/souris.
- `list_ui_libraries`, `search_ui_libraries`, `get_ui_library`, `install_ui_library`.

**Réglages**
- `set_runtime_setting` — un setting du module.

## 1 bis. Pièges vérifiés en session

- **Résultat imbriqué.** Tous les outils runtime renvoient
  `{ captured, pid, queued, result }` et la charge utile est dans
  `result.values[0]`, encodée en `{type, value, entries}`. Lire `r.source`
  donne une chaîne vide alors que la décompilation a réussi. Déballer avant
  de juger.
- **`eval_luau` = une expression.** Plusieurs statements échouent
  (`Expected identifier ... got 'local'`). Envelopper :
  `(function() ... end)()`.
- **Workspace executor sur disque.** `list_executor_files` liste
  `%LOCALAPPDATA%\Madium\workspace\`. On peut donc `Copy-Item` un module du
  vault puis `run_executor_file { path: "ia/module.luau" }` — pas besoin de
  coller 11 Ko de source dans un appel.
- **`decompile_script` lit aussi les scripts non lancés** (LocalScript d'un
  `ToolTemplate` dans `ReplicatedStorage`). C'est la façon de connaître la
  signature d'un remote d'arme sans équiper l'outil.
- **`get_client_info` peut timeout** juste après la connexion ou pendant un
  chargement de map. Un retry quand le personnage est spawn.

## 2. Recettes (ticket → chaîne d'appels)

### Recon d'un jeu inconnu
```
runtime_status
get_client_info { include_counts: true, include_character: true }
get_descendants_tree { path: "game.Workspace", max_depth: 2, max_nodes: 300 }
list_remotes {}
search_runtime_scripts { }        # ce qui est chargé côté client
```
Sortie attendue : place id, nom du jeu, nombre de joueurs, remotes triés,
modules client intéressants.

### Trouver un remote et ses arguments
```
list_remotes
inspect_connections { path: "<Remote>", signal: "OnClientEvent" }
tail_console
# puis hook live :
execute_luau { source: <remote_spy.luau> }
```
`remote_spy.luau` logge FireServer/InvokeServer avec arguments sérialisés.

### Lire un script client
```
search_runtime_scripts { query: "..." }
decompile_script { path: "<script path>", max_chars: 120000 }
inspect_script_bytecode { path: "<script path>" }
```
Si le décompilateur rend du pseudo-code dégradé : `inspect_script_bytecode`
base64 → `konstant` hors ligne.

### Boucle de dev Luau
```
execute_luau { source: <module>, capture: true }
tail_console {}
# itérer, puis persister :
write_executor_file { path: "hub/cheat_core.luau", content: <source> }
run_executor_file { path: "hub/cheat_core.luau" }
```
`capture: true` est le mode par défaut et le seul qui rend les valeurs.
Pour un script qui tourne en boucle, `capture: false` (sinon timeout).

### Tester une fonction d'env avant de l'utiliser
```
search_environment_api { query: "hookmetamethod" }
inspect_environment_function { name: "hookmetamethod" }
get_environment_function { name: "hookmetamethod" }
probe_callback_context {}
```

### Silent aim (push + validation)
```
runtime_status
write_executor_file { path: "hub/silent_aim.luau", content: <source> }
run_executor_file { path: "hub/silent_aim.luau", capture: false }
eval_luau { expression: "getgenv().SilentAim.status()" }
```
Validation : `status().target` doit changer quand tu balayes la caméra ;
`status().player` doit être un ennemi. Si le remote du jeu envoie un
`CFrame` ou une `string`, ajouter un cas dans le hook `__namecall`.

### Attaquer une GUI (farm, menu, prompts)
```
inspect_visible_ui {}
click_gui_button { path: "<GuiObject path>" }
type_into_textbox { path: "<TextBox path>", text: "..." }
send_input { action: "key", key: "E" }
```

### Vérifier une identité / un hook
```
search_gc { query: "<nom de fonction>" }
probe_callback_context {}
inspect_environment_function { name: "__namecall" }
```

## 3. Règles d'usage

1. **Toujours** `runtime_status` avant une rafale d'appels : un client mort
   fait échouer 10 appels d'affilée sans explication.
2. `pid` n'est utile qu'avec plusieurs clients. Sinon laisse vide.
3. `timeout` par défaut 10 s ; monter à 30–60 s pour un `execute_luau` lourd,
   jamais au-delà.
4. `capture: true` bloque jusqu'à la fin de l'exécution → pas de boucle infinie.
   Pour un script résident : `capture: false`, vérifier ensuite avec
   `tail_console` / `inspect_visible_ui`.
5. `execute_luau` sérialise les valeurs : les tables profondes sont bornées,
   les instances deviennent des chemins, `nil` est explicite. Une valeur
   absente du retour = `nil`, pas une erreur.
6. Les chemins d'instances sont dot/slash : `game.Players.LocalPlayer.Character`.
7. `decompile_script` est borné (`max_chars`) : commencer à 100k, monter si
   tronqué.
8. Les outils UI passent par `firesignal` puis fallback souris : si ça clique
   à côté, vérifier `inspect_visible_ui` (z-index, `Visible`, `Active`).
9. `write_executor_file` : chemin relatif au workspace executor, création des
   dossiers implicite.
10. Un outil qui échoue deux fois de suite = mauvais chemin ou client non
    connecté. Ne pas empiler les retries.

## 4. Ce que Madium remplace dans le vault

| Besoin | Avant | Maintenant |
|---|---|---|
| exécuter du Luau | coller dans l'executor | `execute_luau` |
| lire une valeur en jeu | print + console | `eval_luau` |
| décompiler | dump + konstant | `decompile_script` |
| explorer le DataModel | script de dump | `search_instances` / `get_descendants_tree` |
| trouver les remotes | remote_spy + jeu | `list_remotes` puis spy si besoin |
| tester un hook | relancer le jeu | `probe_callback_context` |
| automatiser une GUI | clics manuels | `click_gui_button` / `type_into_textbox` |

Ce que Madium **ne** remplace pas : le C++ externe, les offsets mémoire,
la signature scanning, la route kernel/DMA. Ces fichiers restent la référence.
