import io

p = 'kraken-app/index.html'
t = io.open(p, encoding='utf-8').read()
t = t.replace('app.css?v=9.69', 'app.css?v=9.70').replace('app.js?v=9.69', 'app.js?v=9.70')
io.open(p, 'w', encoding='utf-8', newline='\n').write(t)
print('bumped', t.count('v=9.70'))

c = 'kraken.md'
s = io.open(c, encoding='utf-8').read().rstrip('\n')
row = ("| 24 nov. 2026 | v9.70 | controle complet du reglage avant ET pendant la transaction : "
       "montant, deja recu et adresse des frais modifies en cours de transaction suivent l'ordre "
       "ouvert et le bareme suivant, la valeur reste apres validation et le nouvel envoi part "
       "avec le dernier montant regle |")
io.open(c, 'w', encoding='utf-8', newline='\n').write(s + '\n' + row + '\n')
print('row added')
