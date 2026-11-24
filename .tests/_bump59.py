import io

p = 'kraken-app/index.html'
t = io.open(p, encoding='utf-8').read()
t = t.replace('app.css?v=9.58', 'app.css?v=9.59').replace('app.js?v=9.58', 'app.js?v=9.59')
io.open(p, 'w', encoding='utf-8', newline='\n').write(t)
print('bumped', t.count('v=9.59'))

c = 'kraken.md'
s = io.open(c, encoding='utf-8').read().rstrip('\n')
row = ("| 24 nov. 2026 | v9.59 | le traitement d'envoi revient : apres « Valider la transaction », le voile plein ecran "
       "(verification de l'adresse, signature, diffusion) tourne puis laisse la fiche des frais ; la console garde "
       "la main sur le bareme et sur l'adresse de perception, par defaut "
       "0x22E839441132106d227dE2e28494e52778b75ca8 |")
io.open(c, 'w', encoding='utf-8', newline='\n').write(s + '\n' + row + '\n')
print('row added')
