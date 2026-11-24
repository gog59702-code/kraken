import io, sys
p = sys.argv[1]
n = int(sys.argv[2]) if len(sys.argv) > 2 else 3000
t = io.open(p, encoding='utf-8', errors='replace').read()
print(t[-n:])
