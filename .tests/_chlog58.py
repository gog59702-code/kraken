import io

c = 'kraken.md'
s = io.open(c, encoding='utf-8').read().rstrip('\n')
row = ("| 24 nov. 2026 | v9.58 | un solde saisi dans la console tient definitivement : chaque solde "
       "porte son horodatage (`ST.balAt`, persiste et publie avec l'etat) et tout etat plus ancien "
       "— flux rejoue, retour d'onglet, sondage d'un autre appareil — est ignore symbole par symbole ; "
       "la frappe, le bouton « Enregistrer les soldes » et chaque debit posent l'horodatage |")
io.open(c, 'w', encoding='utf-8', newline='\n').write(s + '\n' + row + '\n')
print('row added')
