import io, subprocess

def bad(t):
    return sum(t.count(x) for x in ['Ã', '\ufffd', 'â€'])

for ref in ['8168b70', '27b4c76', 'a459c98', 'dab8aad', 'HEAD~5']:
    out = subprocess.run(['git', 'show', ref + ':kraken-app/index.html'], capture_output=True)
    if out.returncode != 0:
        print(ref, 'missing')
        continue
    t = out.stdout.decode('utf-8', 'replace')
    print(ref, 'bytes=%d' % len(out.stdout), 'bad=%d' % bad(t), 'euro=%d' % t.count('\u20ac'),
          'script=' + (t.split('app.js?v=')[1][:5] if 'app.js?v=' in t else '?'))
