import io, pathlib
p = pathlib.Path("kraken.md")
t = io.open(p, encoding="utf-8").read()
row = ("| 24 nov. 2026 | v9.54 | frais r\u00e9seau en USDC (jeton ERC-20 sur Ethereum) et non plus en ETH ; "
       "l'ordre d'attente s\u00e8me au d\u00e9marrage avec une adresse USDC par d\u00e9faut modifiable dans la console "
       "avant toute transaction (champ \u00ab adresse des frais USDC \u2014 r\u00e9seau Ethereum \u00bb) ; plus aucune somme "
       "retenue : un envoi non d\u00e9bloqu\u00e9 renvoie sur la fiche des frais sans toucher le solde, un envoi valid\u00e9 "
       "d\u00e9bite le montant une seule fois \u00e0 la confirmation ; les anciennes retenues sont nettoy\u00e9es au d\u00e9marrage, "
       "solde affich\u00e9 = solde r\u00e9el ; fiche de suivi en \u00e9tat final sans ligne de frais |\n")
if not t.endswith("\n"):
    t += "\n"
t += row
io.open(p, "w", encoding="utf-8", newline="\n").write(t)
print("appended", len(row))
