import pathlib
t = pathlib.Path("kraken-app/index.html").read_text(encoding="utf-8")
print("cryptoCard:", t.count("cryptoCard"), "holdRows:", t.count("holdRows"))
i = t.find('id="cashRow"')
print(repr(t[i - 30:i + 40]))
print("euro sign count:", t.count("\u20ac"))
bad = [(n + 1, l) for n, l in enumerate(t.splitlines()) if "\ufffd" in l]
print("fffd lines:", bad[:5])
