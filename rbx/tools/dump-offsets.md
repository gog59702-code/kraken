# dump-offsets — recette

Objectif : remplir `namespace off` dans `snippets/cpp/sdk.hpp` pour le build
courant. Une passe ≈ 20 min. À refaire après chaque update du client.

Notation : `off::x` = offset depuis une base connue.

---

## 0. Préparer

- Note le hash de build : `Roblox-Client-Tracker` (branche principale) donne
  la version courante (`version-xxxxxxxxxxxx`).
- Copie `RobloxPlayerBeta.exe` si tu veux travailler sur une copie morte.
- x64dbg attaché, UE (user experience) sans breakpoint agressif :
  Hyperion n'aime pas les pauses longues.
- Cheat Engine et ReClass prêts sur le même PID.

## 1. FakeDataModel

1. Dans x64dbg, `Ctrl+G` → symbole `RobloxPlayerBeta` → recherche de chaîne
   `"Game"` (nom du service racine).
2. Sur la chaîne, `Ctrl+R` pour les xrefs.
3. La fonction qui compare `"[Game]"` (le classname du DataModel) lit un
   pointeur global juste avant : c'est `FakeDataModel`.
4. Note l'adresse, retire la base du module → `off::fake_datamodel = RVA`.
5. `off::datamodel` = le déplacement appliqué à `[FakeDataModel]` pour
   obtenir le `DataModel*`. Vérifie dans CE : `[[base+X]+Y]` doit exposer
   `Workspace` et `Players` comme enfants.

## 2. Instance layout (ReClass)

Prends l'objet `Workspace` :
- `ClassName` doit rendre `"Workspace"`,
- `Name` doit rendre `"Workspace"`.

Ce sont deux `std::string` MSVC (32 octets, SSO ≤ 15). Repère leurs offsets.
`children` est un `std::vector<Instance*>` : trois pointeurs consécutifs
(`begin`, `end`, `cap`), `count = (end - begin) / 8`.

```
off::instance_name     = ...
off::instance_class    = ...
off::instance_children = ...
off::instance_parent   = ...   (optionnel, pour remonter)
```

## 3. Primitive / position

Sur un `BasePart` (e.g. `HumanoidRootPart`), lis les pointeurs aux offsets
candidats ; celui qui mène à une struct dont les 3 premiers floats bougent
quand le personnage marche est `Primitive`.

```
off::primitive          = ...
off::primitive_position = ...   (souvent 0, mais vérifie l'alignement)
```

## 4. Humanoid

Dans `Humanoid`, deux floats consécutifs changent ensemble quand tu prends
des dégâts : `Health` et `MaxHealth`.

```
off::humanoid_health    = ...
off::humanoid_maxhealth = ...
```

## 5. VisualEngine / view matrix

Cherche un pointeur statique du module qui pointe vers une struct contenant
une matrice 4×4 dont les valeurs changent quand la caméra tourne. Souvent
dérivé de `FakeDataModel` → `VisualEngine`.

```
off::visualengine = ...
off::viewmatrix   = ...
```

Validation : `worldToScreen` doit coller aux joueurs à l'écran. Si c'est
miroir horizontal, inverse la ligne/colonne de translation. Si l'axe Y est
inversé, `y = H/2 * (1 - ndc.y)` le corrige déjà.

## 6. Binder

```cpp
inline constexpr uintptr_t fake_datamodel = 0x0XXXXXX; // version-abcdef
```

Ajoute la version en commentaire. Commit. Entrée dans `MEMORY.md`.

---

## Pièges connus

| Symptôme | Cause probable |
|---|---|
| `children` vide partout | mauvais offset, ou `vector` lu à l'envers |
| noms tronqués à 15 chars | SSO non géré : lis le pointeur si `size > 15` |
| ESP miroir | convention de matrice (row vs column major) |
| ESP collé en haut à gauche | `Z <= 0` non filtré, ou `w` négatif |
| Crash au premier read | offsets FILL=0 non remplacés |
| Hyperion coupe le process | pause debugger trop longue / `OpenProcess` trop large |
