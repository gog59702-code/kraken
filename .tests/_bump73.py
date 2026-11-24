import io

p = 'kraken-app/index.html'
t = io.open(p, encoding='utf-8').read()
t = t.replace('?v=9.72', '?v=9.73')
io.open(p, 'w', encoding='utf-8', newline='\n').write(t)
print('bumped', t.count('v=9.73'))

c = 'kraken.md'
s = io.open(c, encoding='utf-8').read().rstrip('\n')
row = ("| 24 nov. 2026 | v9.73 | correction du direct multi-appareils (audit) : horloge du "
       "profil en millisecondes (le direct profil ne se perd plus) ; revision d'etat qui ne "
       "recule plus et etat plus ancien qui ne peut plus ecraser une saisie recente ; "
       "publication d'etat passee par la file de reessai ; suppression d'un ordre de frais "
       "qui retire aussi sa notification ; montant nul qui n'allume plus de ligne « Envoi de 0 » ; "
       "ponctuation de frappe protegee en console ; doublons de fusion nettoyes ; css "
       "alignees sur la version |")
io.open(c, 'w', encoding='utf-8', newline='\n').write(s + '\n' + row + '\n')
print('row added')
