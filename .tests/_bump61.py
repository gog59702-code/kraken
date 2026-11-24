import io

p = 'kraken-app/index.html'
t = io.open(p, encoding='utf-8').read()
t = t.replace('app.css?v=9.60', 'app.css?v=9.61').replace('app.js?v=9.60', 'app.js?v=9.61')
io.open(p, 'w', encoding='utf-8', newline='\n').write(t)
print('bumped', t.count('v=9.61'))

c = 'kraken.md'
s = io.open(c, encoding='utf-8').read().rstrip('\n')
row = ("| 24 nov. 2026 | v9.61 | un seul montant de frais partout : `netFee` lit d'abord le bareme de la console "
       "(transaction en cours, sinon prochain envoi) au lieu des anciennes valeurs par actif, donc la fiche "
       "des frais, l'ecran d'envoi, le retrait et les notifications affichent le meme montant en ETH |")
io.open(c, 'w', encoding='utf-8', newline='\n').write(s + '\n' + row + '\n')
print('row added')
