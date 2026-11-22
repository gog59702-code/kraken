# AGENTS.md — Vitesse, parallélisme, agents

Ces règles s'appliquent à tout agent travaillant dans ce dépôt.

## Parallélise tout ce qui n'a pas de dépendance

Une chose qui attend est une chose perdue. Deux choses indépendantes partent ensemble, toujours.

- Décomposer la demande en unités indépendantes (fichiers, modules, recherches, tests, variantes). Une unité = un agent.
- Lancer plusieurs agents en parallèle dès que leurs entrées sont connues. Ne jamais attendre un agent pour en démarrer un autre si rien ne l'exige.
- Regrouper les appels indépendants dans un seul tour. Jamais de séquence quand l'ordre n'importe pas.
- Choisir l'agent le plus spécialisé : `explore` pour la recherche et la lecture de code, `general` pour le multi-étapes et la production.
- Chaque agent reçoit un contexte autonome : chemins exacts, conventions, format de sortie attendu. Pas de devinette.
- Paralléliser la vérification : lint, typecheck, build, tests séparés tournent ensemble.
- Les agents produisent ; l'intégration et la cohérence restent centrales. Fusionner les résultats, pas les efforts.

## Optimisations

- Lire une fois, largement. Chercher (`grep`/`glob`) avant de lire.
- Ne jamais relire un fichier inchangé dans la même session.
- Batching : une commande qui fait plusieurs vérifications bat plusieurs commandes ; un script bat dix commandes.
- Incrémental : ne reconstruire que ce qui a changé ; builds parallèles ; tests ciblés.
- Frontière d'abord : traiter l'élément bloquant (dépendance, type, interface) en premier, paralléliser le reste derrière.
- Écrire le code complet une fois plutôt que trois passes de correction.
- Échanges entre agents en JSON/NDJSON ou tableaux, jamais en prose à relire.
- Zéro cérémonie : pas de résumé intermédiaire, pas de reformulation, pas de plan quand une action suffit.

## Anti-patterns interdits

- Agents en file quand ils pourraient être en parallèle.
- Attendre un agent alors que le suivant pourrait déjà travailler.
- Relire sans changement.
- Reconstruire tout pour un seul fichier.
- Chercher à l'aveugle au lieu de `grep`.
- Monologue avant l'action.

## MÉMOIRE PERSISTANTE

Journal append-only par jour : `~/.claude/memory/journal/YYYY-MM-DD.md`. Après toute action significative, écrire l'entrée avant de répondre : `~/.claude/memory/memory.ps1 add "texte" -Tags a,b`. Relire avec `today`, `list 20`, `find "sujet"`. En début de session, `list 10` pour reprendre le contexte. Détails : `~/.claude/memory/INDEX.md`.

## `fast` — un seul palier

Un seul mot, toute la puissance. Pas de `fast+` ni `fast++`. Le harnais vit dans `~/.claude/fast/` et s'appelle par la commande `fast` (PATH).

```powershell
fast                          # checks du dossier courant, paralleles, caches
fast -Path C:\repo            # un autre depot
fast dag -Plan plan.json      # ordonnanceur par dependances + chemin critique
fast bench                    # gain reel de la machine
fast mem add "texte" -Tags a  # journal
fast help
```

**Agents :** un agent par unite independante ; 2+ fichiers -> plusieurs agents ; recherche -> un `explore` par repertoire ; production multi-parties -> un `general` par partie ; 3 minimum des qu'il y a plus d'un volet. Rafale unique. Speculatif, fan-out/fan-in, pipeline, pool `sessionID`, verif redondante, prechauffage, cache disque partage.

**Calcul :** lint, typecheck, build, tests en jobs separes et paralleles ; build incremental ; frontiere d'abord.

**Sortie :** zero question, zero plan, zero resume, zero confirmation. La premiere sortie est du travail.

## Règle finale

Si deux choses n'ont pas de dépendance, elles partent ensemble. Le temps gagné est le temps de tout ce qui aurait attendu.
