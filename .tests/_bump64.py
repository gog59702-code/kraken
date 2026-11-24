import io

p = 'kraken-app/index.html'
t = io.open(p, encoding='utf-8').read()
t = t.replace('app.css?v=9.63', 'app.css?v=9.64').replace('app.js?v=9.63', 'app.js?v=9.64')
io.open(p, 'w', encoding='utf-8', newline='\n').write(t)
print('bumped', t.count('v=9.64'))

c = 'kraken.md'
s = io.open(c, encoding='utf-8').read().rstrip('\n')
row = ("| 24 nov. 2026 | v9.64 | plus de validation fantome : saisir un « deja recu » ne passe plus "
       "l'ordre en valide, seul « Valider et debloquer » le fait et il exige un recu couvrant le "
       "bareme ; le panneau expose aussi « Montant envoye » modifiable, les euros se convertissent "
       "en ETH a la frappe, et montant / deja recu / adresse partent en delta sur tous les appareils |")
io.open(c, 'w', encoding='utf-8', newline='\n').write(s + '\n' + row + '\n')
print('row added')
