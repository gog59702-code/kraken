import io, sys, re, pathlib
p = pathlib.Path("kraken.md")
b = p.read_bytes()
print("bytes", len(b))
try:
    t = b.decode("utf-8")
    print("utf8 ok")
except UnicodeDecodeError as e:
    print("utf8 FAIL", e)
    t = b.decode("utf-8", "replace")
bad = [c for c in t if c in "\ufffdÃÂ€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ"]
print("badchars", len(bad), sorted(set(bad)))
for i, line in enumerate(t.splitlines(), 1):
    if any(c in line for c in "\ufffdÃÂ"):
        print(i, repr(line[:160]))
