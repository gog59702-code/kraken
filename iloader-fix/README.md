# iLoader — fix connexion Apple ID (Windows)

Repare les trois pannes qui donnent le meme symptome : le spinner de sign in
tourne et rien ne se passe.

| Panne | Ce que le log montre | Ce que le script fait |
|---|---|---|
| Proxy local sur `gsa.apple.com` | `proxy(http://127.0.0.1:xxxxx/) intercepts` puis `GoAway NO_ERROR`, aucune reponse | relance iLoader sans `HTTP_PROXY` / `HTTPS_PROXY` / `ALL_PROXY` |
| Etat anisette perime | `Loaded existing anisette state` puis blocage | `-PurgeAnisette` supprime le credential, l'etat est regenere |
| Compte coince en etat intermediaire | login qui repart en boucle sans jamais conclure | `-ResetAccount` retire l'id de `data.json` (avec backup) + le mot de passe en cache |

## Usage

```powershell
# cas normal : relance propre + surveillance du log
.\Fix-ILoader.ps1 -Account carole.dumonceau@hotmail.com -Watch

# le compte est coince, re-ajout propre necessaire
.\Fix-ILoader.ps1 -Account carole.dumonceau@hotmail.com -ResetAccount -Watch

# blocage APRES validation du 2FA
.\Fix-ILoader.ps1 -PurgeAnisette -Watch

# juste relancer proprement, sans surveiller
.\Fix-ILoader.ps1 -NoRestart   # diagnostic seul
.\Fix-ILoader.ps1              # relance propre
```

Double-clic : `fix.cmd` (lance le script avec la politique d'execution contournee).

## Lecture du verdict

Le script affiche les etapes du flow GrandSlam :

```
[1/6] login SRP demarre
[2/6] etape 1 OK (sel + iterations)
[3/6] preuve SRP envoyee
[4/6] etape 2 OK (preuve serveur verifiee)
[5/6] mot de passe accepte / 2FA
[6/6] SESSION DEV CREEE
```

Codes de sortie :

| Code | Sens | Action |
|---|---|---|
| 0 | session dev creee | rien, c'est bon |
| 2 | pas de login detecte dans le delai | le bouton n'a pas ete clique |
| 3 | Apple a coupe la preuve / la reconnexion post-2FA | `-PurgeAnisette`, puis retenter apres 10 min |
| 4 | etape 1 ou envoi de preuve bloque | verifier reseau, proxy, service Apple |

## Notes

- Le log iLoader est horodate en UTC : `%APPDATA%\me.nabdev.iloader\logs\iloader.YYYY-MM-DD.log`
- `-PurgeAnisette` regenere l'identite machine. Si un autre compte fonctionne
  deja, la session en cours peut demander un re-login.
- Compte gratuit Apple : 3 apps actives, certificat 7 jours, 3 appareils par an.
  Le sign in peut reussir et l'install echouer sur le quota — c'est cote compte.
- Serveurs anisette vivants verifies : `mac-ani.jkcoxson.com`, `new.ani.sidestore.io`.
  `ani.sidestore.io` renvoie 502, ne pas l'utiliser.
