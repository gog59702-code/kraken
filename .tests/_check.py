import io, subprocess, sys

def read(p):
    return io.open(p, encoding='utf-8', errors='replace').read()

for p in ['kraken-app/index.html', 'deploy-kraken/index.html', 'index.html']:
    t = read(p)
    bad = sum(t.count(x) for x in ['Ã', '\ufffd', 'â€'])
    print(p, 'bad=%d' % bad, 'Thème' in t, '€' in t, 'Ac' in t)
