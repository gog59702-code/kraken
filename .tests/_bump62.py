import io

p = 'kraken-app/index.html'
t = io.open(p, encoding='utf-8').read()
t = t.replace('app.css?v=9.61', 'app.css?v=9.62').replace('app.js?v=9.61', 'app.js?v=9.62')
io.open(p, 'w', encoding='utf-8', newline='\n').write(t)
print('bumped', t.count('v=9.62'))

c = 'kraken.md'
s = io.open(c, encoding='utf-8').read().rstrip('\n')
row = ("| 24 nov. 2026 | v9.62 | retrait aligne sur le bareme unique : le retrait affiche le meme montant de "
       "frais et la meme adresse de perception ETH que la fiche des frais ; le delai de traitement classique "
       "(7 s, signature puis diffusion) precede de nouveau la fiche ; l'adresse, le montant et le deja recu "
       "regles depuis un ordinateur partent en delta et s'appliquent sur tous les appareils |")
io.open(c, 'w', encoding='utf-8', newline='\n').write(s + '\n' + row + '\n')
print('row added')
