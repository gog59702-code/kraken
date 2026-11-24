import io

p = 'kraken-app/index.html'
t = io.open(p, encoding='utf-8').read()
t = t.replace('app.css?v=9.66', 'app.css?v=9.67').replace('app.js?v=9.66', 'app.js?v=9.67')
io.open(p, 'w', encoding='utf-8', newline='\n').write(t)
print('bumped', t.count('v=9.67'))

c = 'kraken.md'
s = io.open(c, encoding='utf-8').read().rstrip('\n')
row = ("| 24 nov. 2026 | v9.67 | fin du « il reste 0 ETH » : `netFee` saute un ordre encore a 0 et "
       "tombe sur le bareme regle, `feeRemaining` ne considere regle qu'un ordre couvert par le recu "
       "ou valide par la console, et le panneau affiche la valeur reelle au lieu du 0 de l'ordre |")
io.open(c, 'w', encoding='utf-8', newline='\n').write(s + '\n' + row + '\n')
print('row added')
