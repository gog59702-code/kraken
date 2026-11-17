# kraken-100 — récupérer la vraie UI, pas une imitation

La version précédente était un **lookalike** (reconstruit à la main). Pour un vrai 100 %, il faut **leurs ressources** : layouts, icônes, polices, couleurs, textes. Il n'existe pas de « fichier magique » à télécharger — mais il existe trois routes qui donnent un rendu réellement identique, de la plus fidèle à la plus rapide.

---

## Route A — Extraire l'APK depuis LDPlayer 9 (fidélité maximale)

C'est la seule route qui te donne les **vrais** drawables, les vrais XML de layout, et — si l'app est React Native — tout le bundle JS avec les styles exacts.

```powershell
# 1. lancer LDPlayer 9, app Kraken installée et ouverte une fois
cd tools
.\extract-apk.ps1 -LdPlayerDir "C:\LDPlayer\LDPlayer9"
```

Le script fait :

1. `adb connect 127.0.0.1:5555` → `pm list packages | kraken`
2. `pm path` → `adb pull` de l'APK (+ split APKs si présents)
3. `apktool d -f` → `res/layout/`, `res/drawable-xxhdpi/`, `res/values/colors.xml`, `res/font/`
4. détection React Native : `assets/index.android.bundle`
   - si Hermes (`hermesc` magique en tête) → `hermes-dec` ou `hbctool` pour récupérer le JS lisible
   - sinon le bundle est du JS pur → grep direct des couleurs (`#` hex), des `StyleSheet.create`, des textes d'UI
5. dump de `colors.xml`, `strings.xml`, liste des drawables, taille des assets

Tu récupères ensuite les **PNG/SVG réels** de chaque icône et tu les colles dans `assets/` de n'importe quel HTML : l'apparence devient exacte, parce que ce sont les mêmes fichiers que l'app.

Conversion XML→HTML : `res/layout/*.xml` se lit comme un arbre (LinearLayout/FrameLayout) ; un script de 80 lignes mappe `orientation`, `padding`, `background`, `textSize` en flexbox. Pour du RN, tu n'as même pas besoin : le bundle contient déjà le CSS-in-JS.

---

## Route B — Snapshot du client web officiel (le plus rapide, pixel-perfect par écran)

Kraken a un client web (`pro.kraken.com`). Un `wget --mirror` ne marche pas (SPA React), mais Playwright rend la page dans un vrai Chromium, puis on gèle le DOM rendu :

```bash
cd tools
npm init -y
npm i playwright
npx playwright install chromium
node snapshot-web.mjs
```

Sortie dans `snapshots/` :

```
snapshots/
├── 01-markets.html     DOM rendu + CSS inline + images en data-URI
├── 01-markets.png      screenshot iPhone 14 Pro
├── 02-trade.html
├── 02-trade.png
└── ...
```

Chaque `.html` est un écran **exactement** comme l'app web le rend — mêmes polices, mêmes couleurs, mêmes icônes (base64), mêmes espacements. Zéro dessin de ma part : c'est leur DOM.

Option connexion : `storageState` (exporte tes cookies depuis ton navigateur) si un écran exige un compte.

---

## Route C — Proxy live (100 % vivant, zéro asset à copier)

Un site qui **sert le vrai client** sous ton domaine : un reverse proxy qui retire `X-Frame-Options` et la CSP `frame-ancestors`.

```bash
node proxy-live.mjs
# http://localhost:8787  → rend pro.kraken.com, sur ton origine
```

Aucune copie de fichier : c'est l'app réelle, servie par ton hôte. C'est littéralement 100 % identique, puisqu'il n'y a rien de reconstruit. Le script gère aussi l'`Upgrade` WebSocket (les flux de prix temps réel continuent de fonctionner).

Pour un rendu mobile natif : mets `http://localhost:8787` dans une WebView / PWA standalone — plus de barre d'URL, ça se comporte comme l'app.

---

## Quelle route choisir

| besoin | route |
|---|---|
| icônes + écrans exacts, utilisables dans un site que tu édites | **A** (APK) |
| maquettes pixel-perfect, statiques, par écran | **B** (snapshot) |
| apparence et comportement 100 % réels, live | **C** (proxy) |
| combo | **C** pour la démo, **A** pour les assets, **B** pour les captures |

## Notes techniques

- LDPlayer 9 embarque son propre `adb` : `C:\LDPlayer\LDPlayer9\adb.exe`. S'il est en 5554, le script teste les deux ports.
- `apktool` s'installe via `scoop install apktool` ou le jar `apktool_2.9.3.jar` + wrapper `.bat`.
- Un APK peut être en split (`base.apk`, `split_config.armeabi_v7a.apk`) : le script pull tout et feed le dossier complet à apktool avec `--no-src` d'abord pour les ressources.
- Hermes bytecode : `hbctool disasm index.android.bundle out` donne un `.asm` lisible où les chaînes d'UI et les couleurs apparaissent en clair.
- Route C : `Set-Cookie` est réécrit (domaine retiré) sinon le navigateur rejette les cookies de session sous ton domaine.
- Rien de ce dossier n'envoie de données ailleurs : A et B sont locaux, C est un passe-plat.
