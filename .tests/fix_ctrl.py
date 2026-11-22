"""Restaure les caracteres cp1252 laisses en C1 (0x80-0x9f) dans kraken-app."""
import pathlib

MAP = {
    "\u20ac": ["\u0080"],
    "\u201a": ["\u0082"],
    "\u0192": ["\u0083"],
    "\u201e": ["\u0084"],
    "\u2026": ["\u0085"],
    "\u2020": ["\u0086"],
    "\u2021": ["\u0087"],
    "\u02c6": ["\u0088"],
    "\u2030": ["\u0089"],
    "\u0160": ["\u008a"],
    "\u2039": ["\u008b"],
    "\u0152": ["\u008c"],
    "\u017d": ["\u008e"],
    "\u2018": ["\u0091"],
    "\u2019": ["\u0092"],
    "\u201c": ["\u0093"],
    "\u201d": ["\u0094"],
    "\u2022": ["\u0095"],
    "\u2013": ["\u0096"],
    "\u2014": ["\u0097"],
    "\u2122": ["\u0099"],
    "\u0161": ["\u009a"],
    "\u203a": ["\u009b"],
    "\u0153": ["\u009c"],
    "\u017e": ["\u009e"],
    "\u0178": ["\u009f"],
}
FLAT = {src: dst for dst, srcs in MAP.items() for src in srcs}

exts = {".html", ".js", ".css", ".json", ".webmanifest", ".svg", ".txt", ".xml"}
changed = 0
for p in pathlib.Path("kraken-app").rglob("*"):
    if not p.is_file() or p.suffix.lower() not in exts:
        continue
    try:
        t = p.read_bytes().decode("utf-8")
    except UnicodeDecodeError:
        print("SKIP non-utf8:", p)
        continue
    n = sum(t.count(k) for k in FLAT)
    if not n:
        continue
    for k, v in FLAT.items():
        t = t.replace(k, v)
    p.write_bytes(t.encode("utf-8"))
    print(f"{p}: {n}")
    changed += 1
print("fichiers modifies:", changed)
