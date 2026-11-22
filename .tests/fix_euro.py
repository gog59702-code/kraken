"""Restaure les euros (U+0080 residuel) dans les fichiers texte de kraken-app."""
import pathlib

ROOT = pathlib.Path("kraken-app")
exts = {".html", ".js", ".css", ".json", ".webmanifest", ".txt", ".md"}
total = {}
for p in ROOT.rglob("*"):
    if not p.is_file() or p.suffix.lower() not in exts:
        continue
    b = p.read_bytes()
    try:
        t = b.decode("utf-8")
    except UnicodeDecodeError:
        print("SKIP (non utf-8):", p)
        continue
    n = t.count("\u0080")
    if not n:
        continue
    t2 = t.replace("\u0080", "\u20ac")
    p.write_bytes(t2.encode("utf-8"))
    total[str(p)] = n

for k, v in total.items():
    print(f"{k}: {v}")
print("fichiers corriges:", len(total))
