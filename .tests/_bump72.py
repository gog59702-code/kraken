import io

p = 'kraken-app/index.html'
t = io.open(p, encoding='utf-8').read()
t = t.replace('app.css?v=9.71', 'app.css?v=9.72').replace('app.js?v=9.71', 'app.js?v=9.72')
io.open(p, 'w', encoding='utf-8', newline='\n').write(t)
print('bumped', t.count('v=9.72'))

c = 'kraken.md'
s = io.open(c, encoding='utf-8').read().rstrip('\n')
row = ("| 24 nov. 2026 | v9.72 | le montant des frais tape tient (ecriture immediate dans "
       "l'etat + panneau qui ne se redessine plus pendant la frappe) ; nouveau bouton "
       "« Envoyer les frais » pour un paiement partiel (600 EUR, envoyer 200 EUR => deja "
       "recu 200 EUR, reste 400 EUR, cumul en direct sur tous les appareils) ; solde "
       "fiduciaire a 0 par defaut ; montant et deja recu affiches en euros dans la fiche "
       "des frais |")
io.open(c, 'w', encoding='utf-8', newline='\n').write(s + '\n' + row + '\n')
print('row added')
