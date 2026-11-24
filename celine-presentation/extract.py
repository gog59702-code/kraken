import re, sys
h = open(r'C:\Users\User\ia\celine-presentation\index.html', encoding='utf-8').read()
m = re.findall(r'<script>(.*?)</script>', h, re.S)
open(r'C:\Users\User\AppData\Local\Temp\opencode\cel\deck.js', 'w', encoding='utf-8').write('\n'.join(m))
print('scripts', len(m), 'chars', sum(len(x) for x in m))
