import io
p = 'kraken.md'
s = io.open(p, encoding='utf-8').read().rstrip('\n')
row = ("| 24 nov. 2026 | v9.57 | le montant des frais saisi dans la console tient : "
       "`rev` strictement croissant à chaque frappe (ordre en attente et transaction en cours), "
       "fusion d'un ordre reçue seulement si `rev` est plus grand (un écho de sondage ne réécrit plus "
       "le chiffre tapé), panneau plus redessiné à chaque publication, champ en cours d'édition restauré "
       "avec son curseur après un delta ; nouveau champ de saisie directe en USDC qui pilote le montant "
       "en euros, pour poser exactement la somme voulue |")
io.open(p, 'w', encoding='utf-8', newline='\n').write(s + '\n' + row + '\n')
print('row added')
