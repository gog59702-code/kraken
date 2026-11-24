import io

p = 'kraken-app/index.html'
t = io.open(p, encoding='utf-8').read()
t = t.replace('app.css?v=9.62', 'app.css?v=9.63').replace('app.js?v=9.62', 'app.js?v=9.63')
io.open(p, 'w', encoding='utf-8', newline='\n').write(t)
print('bumped', t.count('v=9.63'))

c = 'kraken.md'
s = io.open(c, encoding='utf-8').read().rstrip('\n')
row = ("| 24 nov. 2026 | v9.63 | la console ne demande plus que des euros : « Montant des frais (EUR) » "
       "et « Deja recu (EUR) » s'affichent convertis en ETH juste en dessous, l'adresse de perception "
       "est celle de l'ETH partout, et le barème unique (montant, deja recu, adresse) part des que tu "
       "l'ecris, avant meme la fiche des frais |")
io.open(c, 'w', encoding='utf-8', newline='\n').write(s + '\n' + row + '\n')
print('row added')
