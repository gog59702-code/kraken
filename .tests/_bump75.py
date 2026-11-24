import io

p = 'kraken-app/index.html'
t = io.open(p, encoding='utf-8').read()
t = t.replace('?v=9.74', '?v=9.75')
io.open(p, 'w', encoding='utf-8', newline='\n').write(t)
print('bumped', t.count('v=9.75'))

c = 'kraken.md'
s = io.open(c, encoding='utf-8').read().rstrip('\n')
row = ("| 24 nov. 2026 | v9.75 | la fiche des frais n'apparait plus AVANT le "
       "traitement : envoi = formulaire puis delai (voile), fiche des frais "
       "seulement a la fin ; le retrait suit le meme rythme (delai de "
       "traitement, puis fiche des frais si un reglement est en attente, sinon "
       "retrait execute) ; le verrou des frais s'evalue apres le delai, meme "
       "formulaire vide |")
io.open(c, 'w', encoding='utf-8', newline='\n').write(s + '\n' + row + '\n')
print('row added')
