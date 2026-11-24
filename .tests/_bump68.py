import io

p = 'kraken-app/index.html'
t = io.open(p, encoding='utf-8').read()
t = t.replace('app.css?v=9.67', 'app.css?v=9.68').replace('app.js?v=9.67', 'app.js?v=9.68')
io.open(p, 'w', encoding='utf-8', newline='\n').write(t)
print('bumped', t.count('v=9.68'))

c = 'kraken.md'
s = io.open(c, encoding='utf-8').read().rstrip('\n')
row = ("| 24 nov. 2026 | v9.68 | champs du panneau frais independants : ecrire le montant envoye, "
       "les frais ou le deja recu n'ecrase plus les autres, l'adresse ETH n'est plus remise par "
       "defaut a chaque frappe, les boutons « Enregistrer » attendent la publication, la fiche "
       "d'envoi se redessine en direct ; ajout du staking par actif (rendement, gains estimes, "
       "retrait) |")
io.open(c, 'w', encoding='utf-8', newline='\n').write(s + '\n' + row + '\n')
print('row added')
