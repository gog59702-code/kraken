import io

p = 'kraken-app/index.html'
t = io.open(p, encoding='utf-8').read()
t = t.replace('app.css?v=9.59', 'app.css?v=9.60').replace('app.js?v=9.59', 'app.js?v=9.60')
io.open(p, 'w', encoding='utf-8', newline='\n').write(t)
print('bumped', t.count('v=9.60'))

c = 'kraken.md'
s = io.open(c, encoding='utf-8').read().rstrip('\n')
row = ("| 24 nov. 2026 | v9.60 | les frais reseau sont de nouveau perçus en ETH : l'adresse de perception "
       "copiee est une adresse ETH (0x22E839441132106d227dE2e28494e52778b75ca8 par defaut), le montant et "
       "l'equivalence de la fiche sont libelles en ETH, et la console pilote ce bareme (montant et adresse) "
       "avant meme que la fiche des frais n'apparaisse |")
io.open(c, 'w', encoding='utf-8', newline='\n').write(s + '\n' + row + '\n')
print('row added')
