"""Detecte tout caractere de controle residuel dans le site construit."""
import pathlib

targets = [pathlib.Path("kraken-app"), pathlib.Path("assets"), pathlib.Path("deploy-kraken")]
exts = {".html", ".js", ".css", ".json", ".webmanifest", ".svg", ".txt"}
bad = []
for root in targets:
    if not root.exists():
        continue
    for p in root.rglob("*"):
        if not p.is_file() or p.suffix.lower() not in exts:
            continue
        try:
            t = p.read_bytes().decode("utf-8")
        except UnicodeDecodeError as e:
            bad.append((str(p), "not-utf8", str(e)[:60]))
            continue
        hits = sorted({hex(ord(c)) for c in t if 0x80 <= ord(c) <= 0x9f or ord(c) in (0xfffd,)})
        if hits:
            bad.append((str(p), ",".join(hits), ""))
for row in bad:
    print(row)
print("total:", len(bad))
