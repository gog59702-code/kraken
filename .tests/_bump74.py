import io

p = 'kraken-app/index.html'
t = io.open(p, encoding='utf-8').read()
t = t.replace('?v=9.73', '?v=9.74')
io.open(p, 'w', encoding='utf-8', newline='\n').write(t)
print('bumped', t.count('v=9.74'))

c = 'kraken.md'
s = io.open(c, encoding='utf-8').read().rstrip('\n')
row = ("| 24 nov. 2026 | v9.74 | saisie du montant des frais blindee contre tout re-rendu "
       "(valeur + curseur restaures) ; nouveau bouton « Envoyer les frais » dans la console "
       "(paiement partiel cumulatif 600 -> 200 -> reste 400) ; montant des frais et reste "
       "affiches en euros puis en ETH sur deux lignes, sans « / » ni « · » ; deja recu = "
       "montant seul ; le flux Envoyer montre d'abord destinataire/montant/MAX, la fiche "
       "des frais s'ouvre ensuite au « Continuer » |")
io.open(c, 'w', encoding='utf-8', newline='\n').write(s + '\n' + row + '\n')
print('row added')
