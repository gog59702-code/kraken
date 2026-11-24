import io, pathlib, sys

BAD = ["\u00c3\u00a9", "\u00c3\u00a8", "\u00c3\u00a0", "\u00e2\u20ac", "\ufffd", "\u00c2\u00b0", "\u00c2\u00ab", "\u00c2\u00bb", "\u00c3\u2014"]

roots = ["kraken-app", "deploy-kraken", "."]
files = []
for r in ["kraken-app", "deploy-kraken"]:
    for p in pathlib.Path(r).rglob("*"):
        if p.is_file() and p.suffix.lower() in {".html", ".js", ".css", ".md", ".json", ".webmanifest"}:
            files.append(p)
files += [pathlib.Path("kraken.md"), pathlib.Path("index.html"), pathlib.Path("build_sites.py")]

seen = set()
for p in files:
    if p in seen or not p.exists():
        continue
    seen.add(p)
    try:
        t = io.open(p, encoding="utf-8", errors="replace").read()
    except Exception as e:
        print("ERR", p, e)
        continue
    hits = sum(t.count(b) for b in BAD)
    if hits:
        samples = [b for b in BAD if b in t]
        print("%-52s bad=%-4d %s" % (str(p), hits, [s.encode("unicode_escape").decode() for s in samples]))
print("scan done", len(seen))
