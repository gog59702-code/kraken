import io
p = "kraken.md"
line = ("| 24 nov. 2026 | v9.55 | les frais réseau sont demandés avant la transaction : "
        "un envoi confirmé ouvre immédiatement la fiche de règlement (adresse USDC choisie dans la console, "
        "compte à rebours de 2 h, montant des frais et déjà reçu affichés en unités et en euros) ; "
        "le montant reste sur le solde et n'est débité qu'à la validation par la console ; "
        "tant que la transaction en attente n'est pas validée, tout autre envoi est refusé et renvoie sur cette fiche ; "
        "valider exige que le déjà reçu couvre le montant des frais ; bouton Bloquer suspend les envois même sans transaction en cours ; "
        "frais USDC uniquement, plus aucune retenue ni débit à la diffusion |\n")
with io.open(p, encoding="utf-8") as f:
    t = f.read()
if "| v9.55 |" not in t:
    if not t.endswith("\n"):
        t += "\n"
    t += line
    with io.open(p, "w", encoding="utf-8", newline="") as f:
        f.write(t)
print("ok")
