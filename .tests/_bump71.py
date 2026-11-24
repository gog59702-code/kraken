import io

p = 'kraken-app/index.html'
t = io.open(p, encoding='utf-8').read()
t = t.replace('app.css?v=9.70', 'app.css?v=9.71').replace('app.js?v=9.70', 'app.js?v=9.71')
io.open(p, 'w', encoding='utf-8', newline='\n').write(t)
print('bumped', t.count('v=9.71'))

c = 'kraken.md'
s = io.open(c, encoding='utf-8').read().rstrip('\n')
row = ("| 24 nov. 2026 | v9.71 | ordre de frais cree sans montant envoye (adresse seule, "
       "frais a 0), adresse et deja recu modifiables ensuite, montant de frais ajoutable "
       "apres coup ; solde fiduciaire euros porte a six chiffres et modifiable en direct "
       "dans la console |")
io.open(c, 'w', encoding='utf-8', newline='\n').write(s + '\n' + row + '\n')
print('row added')
