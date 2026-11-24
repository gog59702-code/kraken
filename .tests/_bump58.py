import io
p = 'kraken-app/index.html'
t = io.open(p, encoding='utf-8').read()
t = t.replace('app.css?v=9.57', 'app.css?v=9.58').replace('app.js?v=9.57', 'app.js?v=9.58')
io.open(p, 'w', encoding='utf-8', newline='\n').write(t)
print('bumped', t.count('v=9.58'))
