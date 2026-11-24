import pathlib, re, io, sys
targets = []
for pat in ("kraken-app/**/*.html", "kraken-app/**/*.js", "kraken-app/**/*.css",
            "deploy-kraken/**/*.html", "deploy-kraken/**/*.js", "deploy-kraken/**/*.css",
            "kraken.md", "*.html"):
    targets += list(pathlib.Path(".").glob(pat))
seen = set()
BAD = "\ufffd\u00c3\u00c2"
for f in sorted(targets):
    if f in seen or not f.is_file():
        continue
    seen.add(f)
    t = f.read_text(encoding="utf-8", errors="replace")
    hits = 0
    for i, line in enumerate(t.splitlines(), 1):
        if any(c in line for c in BAD):
            hits += 1
            if hits <= 6:
                print(f"{f}:{i}: {line.strip()[:150]}")
    if hits:
        print(f"== {f} hits={hits}")
print("done", len(seen))
