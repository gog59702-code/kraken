import io

row = (
    "| 24 nov. 2026 | v9.53 | ordre d'attente permanent `pend` créé avant toute transaction : "
    "tant qu'il n'est pas validé, chaque envoi ouvre la fiche des frais à la place du formulaire, "
    "toutes monnaies confondues ; nouveau panneau « Frais réseau » en tête de la console (montant EUR, "
    "déjà reçu EUR, adresse ETH par défaut 0x22E8…5ca8) publié à la frappe et appliqué en direct sur "
    "tous les appareils, boutons Valider / Bloquer ; historique de départ de 9 notifications datées "
    "sur trois semaines, écrit directement dans le stockage, marqué lu, sans aucune notification "
    "système ; `addNotif` ne miroite vers l'OS que si `push` est vrai |"
)

p = "kraken.md"
t = io.open(p, encoding="utf-8", newline="").read()
if "| v9.53 |" not in t:
    if not t.endswith("\n"):
        t += "\n"
    t += row + "\n"
    io.open(p, "w", encoding="utf-8", newline="").write(t)
    print("appended")
else:
    print("already present")
