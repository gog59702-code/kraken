import io, pathlib
p = pathlib.Path("kraken-app/index.html")
t = io.open(p, encoding="utf-8", newline="").read()
t = t.replace("app.css?v=9.38", "app.css?v=9.53").replace("app.js?v=9.52", "app.js?v=9.53")
io.open(p, "w", encoding="utf-8", newline="").write(t)
print("bumped", t.count("?v=9.53"))
