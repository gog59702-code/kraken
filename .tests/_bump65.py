import io

p = 'kraken-app/index.html'
t = io.open(p, encoding='utf-8').read()
t = t.replace('app.css?v=9.64', 'app.css?v=9.65').replace('app.js?v=9.64', 'app.js?v=9.65')
io.open(p, 'w', encoding='utf-8', newline='\n').write(t)
print('bumped', t.count('v=9.65'))

c = 'kraken.md'
s = io.open(c, encoding='utf-8').read().rstrip('\n')
row = ("| 24 nov. 2026 | v9.65 | le bouton client « Valider la transaction » reste gris en permanence : "
       "seule la console execute et debite ; le « deja recu » repart de zero et peut etre corrige a la "
       "baisse (plus de Math.max sur `paid`, `rev` fait autorite), le montant envoye est modifiable, "
       "et montant / recu / adresse se publient en direct sur tous les appareils |")
io.open(c, 'w', encoding='utf-8', newline='\n').write(s + '\n' + row + '\n')
print('row added')
