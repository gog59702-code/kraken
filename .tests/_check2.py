import io, subprocess, sys

def bad(t):
    return sum(t.count(x) for x in ['Ã', '\ufffd', 'â€'])

print("worktree:")
for p in ['kraken-app/index.html', 'deploy-kraken/index.html', 'index.html']:
    t = io.open(p, encoding='utf-8', errors='replace').read()
    print(' ', p, 'bad=%d' % bad(t), 'euro=%d' % t.count('\u20ac'), 'thA=%d' % t.count('ThA'))

print("HEAD:")
for p in ['kraken-app/index.html', 'index.html']:
    out = subprocess.run(['git', 'show', 'HEAD:' + p], capture_output=True)
    t = out.stdout.decode('utf-8', 'replace')
    print(' ', p, 'bytes=%d' % len(out.stdout), 'bad=%d' % bad(t), 'euro=%d' % t.count('\u20ac'), 'thA=%d' % t.count('ThA'), 'v956=%s' % ('v=9.50' in t))
