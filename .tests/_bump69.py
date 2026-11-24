import io

p = 'kraken-app/index.html'
t = io.open(p, encoding='utf-8').read()
t = t.replace('app.css?v=9.68', 'app.css?v=9.69').replace('app.js?v=9.68', 'app.js?v=9.69')
io.open(p, 'w', encoding='utf-8', newline='\n').write(t)
print('bumped', t.count('v=9.69'))

c = 'kraken.md'
s = io.open(c, encoding='utf-8').read().rstrip('\n')
row = ("| 24 nov. 2026 | v9.69 | reglage des frais possible avant ET pendant la transaction : "
       "le montant saisi dans la console vaut pour la transaction en cours et pour le bareme "
       "suivant, sans revenir au reglage d'origine apres validation ; le deja recu est repris "
       "sur la nouvelle transaction ; priorite de l'adresse de perception publiee sur la "
       "config locale, ancien gabarit de demonstration migre vers 0x22E8...5ca8 |")
io.open(c, 'w', encoding='utf-8', newline='\n').write(s + '\n' + row + '\n')
print('row added')
