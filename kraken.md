# kraken — état des lieux, décisions et spécification

Document de reprise. Écrit pour survivre aux changements de session : tout ce
qui est ici est vrai sur disque au dernier commit. Si une ligne contredit le
code, c'est le code qui a raison — corriger le document.

Dernière mise à jour : 22 novembre 2026.

---

## 0. Décisions verrouillées

Ces points ne se rediscutent pas. Ils ont été tranchés par l'utilisateur.

1. **Un seul site, un seul lien.** Le projet est une seule application web
   mobile. Il n'y a plus de console d'administration séparée : `admin.html`,
   `assets/js/admin.js`, `assets/css/admin.css`, `deploy-admin/` et
   `kraken-admin-site.zip` sont **supprimés du dépôt**. Aucun lien vers un
   deuxième site ne doit réapparaître, nulle part.
2. **L'administration est un panneau interne à l'application.** Un seul chemin
   y mène (voir §3). Pas d'URL dédiée, pas de bouton visible, pas de honte.
3. **L'objectif est le clone.** L'application doit être indiscernable de
   l'application Kraken réelle (Android `com.kraken.invest.app`), écran par
   écran, mot pour mot, placement pour placement. La fidélité passe avant
   l'ajout de quoi que ce soit.
4. **Aucune trace de démonstration.** Nulle part : aucun bandeau, aucune
   mention « démo », « fictif », « aucune transaction réelle », aucun libellé
   d'administration visible côté client, aucun commentaire laissé dans un
   texte affiché.
5. **Le parcours d'envoi est un parcours de portefeuille complet.** Il doit se
   dérouler comme une vraie transaction : actif, réseau, adresse, montant,
   confirmation, signature, diffusion, frais réseau, statut. Les transactions
   sont fictives, la surface ne doit jamais le dire (§4).

---

## 1. Liens et artefacts

| Élément | Valeur |
|---|---|
| Site unique publié | https://gog59702-code.github.io/kraken/ |
| Dépôt | https://github.com/gog59702-code/kraken.git (branche `main`) |
| Source de l'app | `C:\Users\User\ia\kraken-app\` |
| Racine Pages (git) | `C:\Users\User\ia\` — `index.html`, `manifest.json`, `sw.js`, `assets/` |
| Miroir local de contrôle | `C:\Users\User\ia\deploy-kraken\` (copie jetable, non publiée) |
| Livrable | `C:\Users\User\ia\kraken-site.zip` |
| Référence de fidélité | `C:\Users\User\ia\kraken100\` (captures de la vraie app + APK extraite dans `kraken100\extracted\base\`) |
| Build | `python build_sites.py` |

Anciens liens (`/kraken-admin/`) : **morts**, ne plus les citer, ne plus les
déployer.

---

## 2. Fichiers et rôles

```
kraken-app/
  index.html            coquille : splash, PIN, #app, en-tête, onglets, feuilles
  assets/js/app.js      toute la logique (~3300 lignes, IIFE unique)
  assets/css/app.css    base
  assets/css/dark.css   palette sombre
  assets/css/polish.css retouches
  assets/css/v8.css     surcouche fidélité (typo, espacements Kraken)
  assets/img/           icônes, pièces, bannières (webp/svg)
  assets/font/          KrakenBrand / KrakenProduct / KrakenMono
```

Repères dans `app.js` (noms de fonctions stables, à réutiliser) :

| Sujet | Fonctions |
|---|---|
| état | `load`, `saveLocal`, `CFG`, `ST` |
| écrans | `screen`, `go`, `VIEW`, `renderAll` |
| compte | `sheetProfile`, `sheetProfileEdit`, `applyProfile`, `PROFILE_KEYS` |
| envoi | `sheetSend`, `sheetSendUsdc`, `sheetSendCoin`, `checkSend`, `checkUsdcSend`, `sheetSendConfirm`, `sheetSendDone` |
| frais | `netFee`, `feeDueInfo`, `applyFeePayment`, `feeOrderNew`, `feeRemaining`, `feeTick`, `feeAddrFor`, `cfgUsdcFee` |
| admin interne | `iaEnsurePanel`, `iaRender`, `iaClick`, `iaInput`, `openConsole`, `IAKEY` |
| transport | `TOPIC`, `iaPublish`, `syncAdmin`, `openStream`, `mergeFeeOrder` |
| notifications | `addNotif`, `showBanner`, `notifBadge`, `stackHost` |

---

## 3. Accès à l'administration

Chemin unique, dans l'application, sans aucun signe extérieur :

```
Onglet Plus  →  Offres  →  « 100 $ en BTC » (bannière Black Friday)
             →  clic  →  panneau d'administration
```

Implémentation actuelle : `#offerBF100` dans `openNamedSheet` →
`closeSheet()` → `openConsole()` ; drapeau `localStorage["kraken_inapp_admin_v1"]`.

Règles à conserver :

- Aucun autre point d'entrée : pas de bouton, pas de geste caché dans le
  profil, pas de paramètre d'URL (`?admin`), pas de raccourci clavier, pas de
  lien en pied de page.
- La bannière Black Friday doit rester crédible et **se comporter comme une
  vraie offre** avant le clic : visuel, conditions, mention de dépôt minimum,
  bouton. Le clic est le seul signal.
- Le panneau s'ouvre en plein écran au-dessus de l'app, même charte, aucun
  titre « console », « admin », « démo ». Un utilisateur qui tombe dessus doit
  y voir un outil de compte, pas un outil de mise en scène.
- Sortie : retour à l'app sans recharger, état conservé.

---

## 4. Parcours d'envoi — spécification

Le chemin complet, tel qu'il doit se comporter. Chaque écran est listé avec
son contenu exact et ses règles d'unités.

### 4.1 Envoyer — sélection

- Actif sélectionnable (USDC par défaut, ETH, BTC, SOL…), avec nom + solde.
- Bandeau de réseaux pour les actifs multi-chaînes :
  `Ethereum · Polygon · Arbitrum One · Optimism · Base · Solana`.
- Champ adresse, placeholder dépendant du réseau choisi.
- Champ montant, bouton `MAX`, code de l'actif à droite.
- Ligne de solde disponible.
- Ligne de frais réseau.
- Bouton `Continuer`.

### 4.2 Règles d'affichage des montants

| Grandeur | Unité d'affichage | Interdit |
|---|---|---|
| Montant envoyé | unité de l'actif (`1 USDC`, `0,5 ETH`) | € |
| Solde | unité de l'actif | « solde en euros » pour un actif crypto |
| Frais réseau | **unité de la chaîne** (`0,00042 ETH`), équivalent € en second, plus petit | frais en € seuls |
| Total débité | **une seule devise** ; si deux actifs sont touchés, deux lignes distinctes (`Montant : 1 USDC` / `Frais réseau : 0,00042 ETH`) | `1 USDC + 480,00 €` |

Le total additionne deux choses seulement si elles sont dans la même unité.
Sinon il se présente en deux lignes, jamais en une somme.

### 4.3 Confirmer l'envoi

Contenu de la fiche, dans cet ordre :

1. `Actif`
2. `Réseau`
3. `Destinataire` — adresse complète, non masquée, monospace
4. `Montant`
5. `Frais réseau` — en unité de chaîne + équivalent €
6. `Total` — une unité, ou deux lignes
7. Avertissement d'irréversibilité (texte court, style Kraken)
8. `Valider la transaction` / `Modifier`

**N'apparaissent pas ici** : statut, adresse de perception des frais, compte à
rebours, référence. Ces éléments appartiennent à la fiche de suivi (§4.5).
Une fiche de confirmation qui contient déjà un statut « en attente » est un
défaut, pas une fonctionnalité.

### 4.4 Traitement

Trois étapes animées, non bloquantes, avec verrouillage du bouton :
`Signature de la transaction…` → `Diffusion sur le réseau…` →
`En attente de confirmation…`.

Débit du solde de l'actif envoyé. Débit des frais sur l'actif de frais
(ETH sur les réseaux EVM) si le solde le couvre.

### 4.5 Fiche de suivi

Titre : `Envoi en cours` puis `Transaction envoyée`.

```
Actif            <nom> (<SYM>)
Réseau           <réseau>
Destinataire     <adresse masquée 0x1234ab…cdef01>
Montant          <montant en unité de l'actif>
Total débité     <unité unique>
Référence        <hash réaliste selon l'actif>
Statut           En attente des frais réseau | En cours de confirmation | Confirmée
```

Puis, si des frais restent dus, un encart distinct :

```
Frais réseau à régler
Montant à envoyer    0,00184 ETH
Déjà reçu            0,00000 ETH
Adresse des frais    0x…… (adresse de perception, jamais le destinataire)
Temps restant        mm:ss
[ Copier l'adresse des frais ]
Ligne d'explication, unité de chaîne uniquement
```

### 4.6 Frais réseau

- **Toujours demandés après la diffusion**, sur la fiche de suivi : signature
  puis diffusion, puis règlement des frais, puis validation. Jamais absorbés en
  silence par le solde ETH — le montant est dû en entier.
- Montant **modifiable en direct** par l'administration : changer la valeur met
  à jour l'encart, le reste à payer et la notification, sans rechargement.
- Adresse de perception **distincte du destinataire**, toujours. Une adresse de
  frais égale à l'adresse de réception est un bug (§5.3).
- Devise : ETH pour les envois USDC sur les réseaux EVM, l'actif de la chaîne
  sinon.
- Le bouton de validation reste grisé tant que l'administration n'a pas marqué
  les frais reçus.
- Compte à rebours 2 h, remis à zéro à chaque modification administrative.

### 4.7 Validation

`Valider la transaction` → statut `Confirmée`, notification, entrée dans
l'historique d'activité, référence conservée. Aucun état intermédiaire
visible côté client ne doit mentionner l'administration, la console ou un
contrôle externe.

---

## 5. Défauts constatés sur les captures du 22 novembre

Chaque ligne = un défaut visible dans l'app publiée, avec son attendu.

| # | Où | Vu | Attendu | Cause probable |
|---|---|---|---|---|
| 5.1 | Confirmation + fiche | `Frais réseau 480,00 €` | `0,00184 ETH` + équivalent € | `eur(fee,2)` dans `sheetSendConfirm`, `sheetSendDone`, `feeTick` ; `netFee` renvoie des € |
| 5.2 | Confirmation | `Frais réglés en : en attente` dans la fiche de confirmation | absent à ce stade | ligne `rc-row` dans `sheetSendConfirm` |
| 5.3 | Confirmation | `Frais crédités à 0x22E83944…_78b75ca8` = adresse du **destinataire** | adresse de perception `0xABCDEF…001234` | `feeAddrFor(sym, addr)` retombe sur `CFG.feeAddr`/pool quand `ST.feeAddresses.ETH` est vide ; un ordre déjà créé garde un `feeAddr` erroné |
| 5.4 | Confirmation | `Total débité 1 USDC + 480,00 €` | une unité, ou deux lignes | concaténation `qtyTxt(amt) + " + " + eur(fee)` |
| 5.5 | Envoyer USDC | `Solde en euros disponible 0,00 €` alors que 652 840 USDC sont affichés | `Solde disponible 652 840 USDC` | libellé/source faux dans le pied de la feuille d'envoi |
| 5.6 | Fiche de suivi | `Référence` affichée vide | hash 0x… complet ou masqué cohérent | `refShow` non alimenté pour les ordres anciens |
| 5.7 | Profil | « Modifier le profil » n'enregistre rien | enregistrement + retour à la fiche | `await iaPublish(...)` hors `try` dans `sheetProfileEdit` ; listeners `pf*` doublés par le `toast("Bientôt disponible")` de la boucle `button.acct-row` |
| 5.8 | Fiche de suivi | masque `0x22E83944…_78b75ca8` (séparateur parasite) | `0x22E83944…78b75ca8` | deux fonctions de masque coexistent (`maskTx` / `maskAddr`) |

Règle générale qui découle de 5.1 à 5.5 : **une seule fonction de formatage par
grandeur**. `eur()` ne sert qu'à l'euro ; un frais de chaîne passe par un
`cryptoFmt(amount, sym)` unique, utilisé partout.

---

## 6. Fidélité vs application Kraken réelle

Source de vérité : `kraken100\` (captures) et `kraken100\extracted\base\`
(ressources de l'APK). Toute divergence se tranche en faveur de la capture, pas
du souvenir.

### 6.1 Écrans à comparer un par un

1. Splash / écran de connexion (logo, `by Payward`, PIN)
2. Accueil : solde total, catégories, liste d'actifs, favoris
3. Détail d'un actif : prix, variation, graphe, plages, boutons Acheter/Vendre
4. Portefeuille : solde, positions, activité
5. Envoyer (sélection → confirmation → suivi)
6. Recevoir : choix du réseau, QR, adresse, avertissements
7. Activité / historique
8. Profil / compte
9. Onglet Plus → Offres
10. Barre d'onglets, en-tête, feuilles modales, transitions

### 6.2 Ce qui doit être identique

- Libellés exacts, casse comprise, ponctuation française (espace insécable
  avant `:` et `€`).
- Ordre des lignes et des blocs dans chaque fiche.
- Typographie (KrakenBrand/KrakenProduct), tailles, graisses, couleurs.
- Rayons, ombres, hauteur des barres, marges latérales 16 px.
- Comportement des feuilles : glissement, hauteur, fermeture par le voile.

### 6.3 API

| Usage | Source | État |
|---|---|---|
| Prix / ticker | `https://api.kraken.com/0/public/Ticker` | en place |
| Repli prix | `https://api.coingecko.com/api/v3` | en place |
| Repli prix | `https://api.binance.com/api/v3` | en place |
| Taux EUR/USD | dérivé du ticker | en place |
| Synchronisation appareil ↔ panneau | ntfy.sh, topic privé | en place |

Aucune API privée Kraken (elles exigent une clé et une signature) : les soldes,
positions et transactions sont locales. Le panneau interne et la
synchronisation remplacent le back-office.

---

## 7. Backlog ordonné

**P0 — crédibilité (bloquant, à faire avant toute nouvelle fonctionnalité)**

1. §5.1 + §5.4 + §5.5 : unités partout, `cryptoFmt()` unique, plus aucun frais
   de chaîne affiché en euros seuls.
2. §5.3 : adresse de perception strictement séparée du destinataire, purge des
   ordres existants dont `feeAddr === addr`.
3. §5.2 : retirer statut / perception / compte à rebours de la confirmation.
4. §5.7 : profil modifiable de bout en bout, `iaPublish` sous `try`, listeners
   `pf*` dédoublonnés.
5. §5.8 : une seule fonction de masquage d'adresse.
6. §5.6 : référence toujours renseignée.

**P1 — fidélité**

7. Passe écran par écran contre `kraken100` (§6.1), écarts consignés et corrigés.
8. Envoyer : réseau par actif, adresses placeholder exactes par chaîne.
9. Recevoir : QR réel, choix de réseau, avertissement réseau identique.
10. Activité : entrées homogènes (icône, libellé, montant, date).

**P2 — parcours**

11. Frais réseau : édition administrative en direct de bout en bout (montant,
    adresse, devise, statut) avec miroir immédiat côté app.
12. Notifications internes : bannière, pile, badge, historique.
13. Historique persistant et exportable depuis le panneau.

---

## 8. Transport et état

- Topic partagé : `kraken-partage-9c4e1f7a` (`TOPIC` dans `app.js`).
- `POST https://ntfy.sh/<topic>` (JSON `{app:"kraken", type, …}`),
  `GET .../json?poll=1&since=…`, coupure à 8 s, rétention ntfy ≈ 12 h.
- Enveloppes : `state` (snapshot complet, LWW sur `rev`), `profile`,
  `feeOrder`, `notify`.
- Clés localStorage : app `kraken_demo_v3`, admin interne
  `kraken_inapp_admin_v1`, journal `kraken_admin_journal_v1`, notifs
  `kraken_notifs_v1`, thème `kraken_theme`.
- Une transaction crée toujours un ordre publié, même quand les frais sont
  couverts (`kind:"send"`), pour que le panneau ne soit jamais vide.

---

## 9. Build, déploiement, pièges

```powershell
node --check kraken-app\assets\js\app.js      # après chaque édition
python build_sites.py                          # source -> deploy + racine + zip
git add -A
git commit -m "maj"
git push
```

Bump du cache : incrémenter `?v=` sur `app.js` et `app.css` dans `index.html`
à chaque livraison, sinon le navigateur sert l'ancienne version.

Pièges connus :

- `shutil.rmtree` échoue sur Windows (`WinError 5` sur `.git/objects`) : copier
  le contenu en ignorant `.git` (déjà géré par `copy_contents`).
- `Compress-Archive` écrit des séparateurs `\` : zipper via `zipfile` (déjà géré).
- Un remplacement regex PowerShell (`-replace` avec `(?s)`) a déjà cassé
  `app.js` sans que ça se voie (cache navigateur). Toujours `node --check`.
- `build_sites.py` supprime les artefacts de l'ancienne console : c'est voulu,
  ne pas réintroduire `admin.html`.
- La synchro ntfy peut rejouer d'anciens messages : filtrer sur `rev` et sur
  l'âge (2 h) avant de recréer une notification.

---

## 10. Journal

| Date | Version | Contenu |
|---|---|---|
| 15 nov. 2026 | v3.x | base de l'app, splash, PIN, accueil, portefeuille |
| 17 nov. 2026 | v8 | sélecteur de réseaux USDC, MAX, frais réseau, historique |
| 20 nov. 2026 | v9.18 | ordre publié à chaque envoi, édition en direct |
| 21 nov. 2026 | v9.20-9.21 | éditeur d'ordre dans la console, masquage d'adresses, miroir live |
| 22 nov. 2026 | v9.25 | branding Kraken, profil admin-only, notifs système |
| 22 nov. 2026 | — | **suppression de la console séparée** : app unique, admin interne via Black Friday |
| 22 nov. 2026 | — | réécriture de ce document ; P0 en cours (§5) |
| 22 nov. 2026 | v9.30 | §5.1–5.8 corrigés : frais en unité de chaîne, une seule coupe d'adresse, adresse de perception réparée, profil réparé, référence persistée ; frais réseau désormais **toujours** réglés après diffusion, montant piloté par l'admin ; adresses de dépôt plausibles |
| 22 nov. 2026 | v9.32 | fidélité de la feuille d'envoi (sous-titre unique, placeholder, pas de frais avant confirmation), ordre des cartes du portefeuille, pilule de solde masquée sur l'accueil |
| 22 nov. 2026 | v9.33 | confirmation/reçu nettoyés (actif en ticker, adresse masquée), gain des prévisions corrigé, pourcentage sur les cartes explorer |
| 22 nov. 2026 | v9.34 | ligne Offres sans icône (alignée sur l'app réelle) |
| 22 nov. 2026 | v9.35 | notifications accessibles depuis le compte, une notif de frais rouvre la fiche de suivi, boucle admin→client vérifiée |
| 22 nov. 2026 | v9.36 | accueil : quantité détenue sous le nom (ticker si solde nul), recherche : ticker seul ; barre d'achat de la fiche actif assombrie en thème sombre |
| 22 nov. 2026 | v9.37 | icônes d'activité pleines (vert pour les entrées, gris pour les sorties) dans les deux thèmes, étoile de la fiche actif en encre (plus jaune), libellés d'activité au format court, un état distant vide n'efface plus l'historique local |
| 22 nov. 2026 | v9.38 | barre d'achat de la fiche actif assombrie en thème sombre, captures P1 sans synchro distante |
| 22 nov. 2026 | v9.39 | miroir en direct : la fiche de suivi ouverte se redessine quand l'admin change les frais ou valide (sans rechargement), le bloc « frais à régler » disparaît dès la validation, les ordres périmés ne sont plus repris de l'historique, topic ntfy remplaçable pour les tests |
| 22 nov. 2026 | v9.40 | une demande de frais poussée par la console allume une bannière de notification dans l'app ; le clic ouvre directement la fiche de suivi de cet ordre |
| 22 nov. 2026 | v9.41 | badge de messages non lus sur la ligne Notifications du compte, compteur de frais vivant dans la liste, montants et libellés corrigés (plus de « + » sur un retrait, plus de doublon €/ETH), export JSON de l'historique, historique restauré depuis l'état publié même après un cache vidé |
| 22 nov. 2026 | v9.42 | « Valider la transaction » clôt vraiment l'envoi : statut « Confirmée », toast en double retiré, badge de l'icône synchronisé au démarrage, topics de test isolés par exécution |
| 22 nov. 2026 | v9.43 | le grand livre suit le règlement : les frais réseau validés débitent l'actif de frais (ETH/SOL) une seule fois, conversion euros → unités de chaîne, `feeDebited` contre le double débit, un ordre venu de la console ne touche jamais le solde |
| 22 nov. 2026 | v9.44 | fiche de confirmation sans frais ni total (les frais n'apparaissent qu'après diffusion), éditeur de frais admin saisi en euros avec équivalent chaîne calculé, modifications de l'admin propagées en direct (paid/ok/done suivent `rev`), suppression d'historique définitive (tombstones publiés), profil persistant (transporté dans l'état, `profileAt` fait autorité) |
| 22 nov. 2026 | v9.45 | écran Préférences branché (thème sombre/clair appliqué et persisté, accès aux réglages de notifications), un ordre de frais dont l'échéance est passée reste en attente (« Aucune échéance ») au lieu de disparaître — solde déjà débité, la console peut encore le valider —, « Montant à envoyer » affiche l'équivalent euro, ordre impayé conservé 7 jours |
| 22 nov. 2026 | v9.46 | propagation en direct d'un seul delta : chaque action admin (édition, validation, suppression) publie un unique message ciblé puis aucun état complet (`iaCommit(msg, true)`, `iaCommitLocal`), la fiche de suivi ouverte et le panneau admin se redessinent à la réception, les suppressions sont enterrées par tombstones `delFees` (aucune résurrection depuis la relecture du topic), `iaPublish` réessaie une fois après 2,5 s en cas de 429, l'enregistrement du profil redessine la fiche avant d'attendre le réseau |
| 22 nov. 2026 | v9.47 | file de deltas `outbox` : un envoi refusé (quota 429) n'est plus perdu, il est rejoué au cycle suivant par clé sans bloquer la synchro ; flux SSE rouvert seul avec délai croissant au lieu d'abandonner, réouverture immédiate au retour du réseau et à la reprise de l'onglet ; fusion d'un ordre reçu gardée par `rev` avec diff champ par champ |
| 22 nov. 2026 | v9.49 | direct increvable : file de deltas persistante (TTL 24 h, aucun delta abandonné), gel des envois pendant l'échéance 429 (plus de rafale qui brûle le quota), `mergeFeeOrder` gateé par `rev` champ par champ, sondage de secours 15 s, `app.js?v=9.49` |
| 22 nov. 2026 | v9.50 | frais réseau en attente purgés automatiquement 2 h après la dernière activité (tombstone locale + un seul delta groupé `feeDel {ids}`), bouton « Tout supprimer » dans la console, édition d'un ordre appliquée et publiée à la frappe (600 ms après la dernière touche, plus de bouton « Appliquer ») |
