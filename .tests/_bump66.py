import io

p = 'kraken-app/index.html'
t = io.open(p, encoding='utf-8').read()
t = t.replace('app.css?v=9.65', 'app.css?v=9.66').replace('app.js?v=9.65', 'app.js?v=9.66')
io.open(p, 'w', encoding='utf-8', newline='\n').write(t)
print('bumped', t.count('v=9.66'))

c = 'kraken.md'
s = io.open(c, encoding='utf-8').read().rstrip('\n')
row = ("| 24 nov. 2026 | v9.66 | plus de « 0 a envoyer » quand le bareme est fixe : `feeRemaining` garde "
       "la plus grande valeur entre l'ordre et les frais publies ; le panneau repart a 0 pour le deja "
       "recu et le montant envoye (0 selectionne au focus), et trois boutons « Enregistrer » figent "
       "montant, recu et adresse immediatement |")
io.open(c, 'w', encoding='utf-8', newline='\n').write(s + '\n' + row + '\n')
print('row added')
