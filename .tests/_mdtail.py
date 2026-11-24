import io
t = io.open("kraken.md", encoding="utf-8").read()
print("rows 9.53:", t.count("| v9.53 |"))
bad = t.count("\u00c3\u00a2") + t.count("\u00ef\u00bf\u00bd")
print("mojibake:", bad)
print("tail:", t.strip().splitlines()[-1][:120])
