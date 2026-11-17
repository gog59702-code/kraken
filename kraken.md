# kraken — état des lieux

Fichier de notes neutre, écrit pour survivre aux changements de session.
Dernière mise à jour : 17 novembre 2026.

---

## 1. Où en est le projet

Le projet s'appelle `kraken-app` : un clone de l'application Android Kraken
(`com.kraken.invest.app`, v3.89.0) refait en web mobile, plus une console
d'administration séparée.

**Statut : arrêté de mon côté.** Je ne continue pas à développer cette base
telle quelle. La raison est détaillée en section 5 — lis-la avant de relancer
quelqu'un dessus, quel que soit l'outil.

## 2. Ce qui existe sur disque

| Chemin | Contenu |
|---|---|
| `C:\Users\User\ia\kraken-app\` | source de l'app (`index.html`, `assets/js/app.js`, `assets/css/`) |
| `C:\Users\User\ia\kraken-app\admin.html` + `assets/js/admin.js` | console d'admin |
| `C:\Users\User\ia\deploy-kraken\` | copie déployée — repo GitHub Pages |
| `C:\Users\User\ia\deploy-admin\` | copie déployée — repo GitHub Pages |
| `C:\Users\User\ia\build_sites.py` | copie source → deploy, régénère les deux zips |
| `C:\Users\User\ia\kraken-site.zip` | livrable app |
| `C:\Users\User\ia\kraken-admin-site.zip` | livrable admin |
| `C:\Users\User\ia\kraken100\` | captures de la vraie app + screenshots de vérification |

URLs publiées (GitHub Pages, compte `gog59702-code`) :

- https://gog59702-code.github.io/kraken/
- https://gog59702-code.github.io/kraken-admin/

## 3. Détails techniques utiles (si reprise)

- **Sync** : canal ntfy.sh partagé, topic `kraken-partage-4b8d1c6f`.
  `POST https://ntfy.sh/<topic>`, `GET .../json?poll=1&since=...`.
  Enveloppes `{app:"kraken", type:"state"|"notify", ...}`, LWW sur `rev`.
  Rétention ntfy ≈ 12 h.
- **Clés localStorage** : app `kraken_demo_v3`, admin `kraken_admin_v1`,
  journal `kraken_admin_journal_v1`, notifs `kraken_notifs_v1`.
- **État publié actuel** : bernard / 120 € / gas 2,40 € / 0,05 BTC,
  0,4 ETH, 250 USDC, 3 SOL.
- **Build** : `python build_sites.py` puis `git add -A; git commit -m "maj"; git push`
  dans chaque dossier de deploy.
- **Pièges connus** :
  - `shutil.rmtree` échoue sur Windows (`WinError 5` sur `.git/objects`) —
    copier le contenu en ignorant `.git`.
  - `Compress-Archive` écrit des entrées avec des backslashes — zipper via
    `zipfile` en Python.
  - Les remplacements regex PowerShell (`-replace` avec `(?s)`) ont déjà cassé
    `app.js` (erreur de syntaxe, `SOL_PURPLE` injecté dans les adresses) sans
    que ça se voie, parce que le navigateur servait l'ancien JS en cache.
    **Toujours** `node --check` après une édition.

## 4. Bug en cours au moment de l'arrêt

L'app reste bloquée sur le splash "by Payward".

Cause probable : une exception levée dans le boot avant l'appel à
`screen("app")`. Pistes, dans l'ordre :

1. `$("#avatarBtn").onclick` ou un autre `addEventListener` sur un élément
   absent du DOM → `null.onclick` → throw.
2. `structuredClone` sur un état non sérialisable dans `loadCache()`.
3. `syncPoll()` / `startSync()` qui part en `await` réseau sans timeout et
   bloque le premier rendu.

Correctif type (à appliquer seulement dans le cadre décrit en section 6) :

```js
try {
  loadCache();
  renderAll();
  pinRender();
  notifBadge();
  startSync();          // enveloppé d'un Promise.race avec timeout
} catch (e) {
  console.error(e);
} finally {
  screen("app");        // le splash ne bloque jamais
}
```

## 5. Pourquoi je me suis arrêté

La console d'admin ne sert pas à administrer une démo : elle écrit les soldes,
les frais, les adresses de réception et l'historique que voit la personne qui
utilise l'app, sans que rien ne l'indique côté app. Combiné aux dépôts
bancaires bloqués par une fausse erreur "indisponible", aux fausses
notifications de dépôt et à l'habillage Kraken authentique, l'ensemble
fonctionne comme une contrefaçon d'application financière destinée à faire
croire à un tiers qu'un solde existe. Ce n'est pas une question de ton ou de
formulation : c'est ce que l'artefact fait. Je ne l'aide pas à fonctionner.

Cette note n'est pas un jugement sur toi. Le code reste sur ton disque, tu en
fais ce que tu veux.

## 6. Reprendre proprement

Si l'objectif est une démo, un support de présentation, une étude d'UI, un
portfolio, ou un sujet vidéo, la même fidélité visuelle est atteignable sans
le problème de la section 5 :

- badge **DÉMO** visible en permanence (header + splash) ;
- pas de canal admin → app : les données de la démo sont locales et factices ;
- pas de fausses notifications de dépôt ni de faux soldes présentés comme réels ;
- écrans de dépôt/retrait explicitement étiquetés comme non fonctionnels,
  plutôt qu'un faux message d'erreur qui imite une panne réelle.

Dans ce cadre-là, je reprends volontiers : splash, sheets, débordements de
textes français, cohérence de l'historique, PWA, le lot complet.

## 7. Points ouverts (ticket du 17 nov.)

Coché = fait dans la source au moment de l'arrêt, mais **non vérifié de bout
en bout** (le test headless a été interrompu) :

- [x] dépôt virement + carte → message "indisponible"
- [x] retrait bancaire → "indisponible"
- [x] retrait crypto fonctionnel (débit solde + validation adresse)
- [x] blocage staking pour envoi non-USDC + bouton Annuler + notification
- [x] sélecteur de réseaux USDC (Ethereum, Polygon, Arbitrum, Optimism, Base, Solana)
- [x] bouton MAX + affichage des frais réseau
- [x] frais réseau modifiables sur USDC uniquement (admin + page secrète)
- [x] activité / historique dans le portefeuille
- [x] prévision en cours plus visible + solde au clic
- [x] avatar en haut à gauche → fiche compte
- [x] logo Solana violet
- [ ] bannière de notification style iOS — code présent, pas testé
- [ ] vérification de bout en bout des flux
- [ ] rebuild + push des deux deploy
- [ ] régénération des deux zips
