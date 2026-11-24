import io, re, pathlib
p = pathlib.Path(".tests/p2_netfee.py")
t = io.open(p, encoding="utf-8").read()
t = t.replace('addr_in = pg.query_selector(\'.ia-netfee [data-iafeeaddr="ETH"]\')',
              'addr_in = pg.query_selector(\'.ia-netfee [data-iafeeaddr="USDC"]\')')
t = t.replace('check("champ adresse ETH", addr_in is not None)',
              'check("champ adresse USDC", addr_in is not None)')
t = t.replace('check("adresse par d\u00e9faut appliqu\u00e9e"', 'check("adresse par d\u00e9faut appliqu\u00e9e"')
io.open(p, "w", encoding="utf-8").write(t)
print("patched", t.count('data-iafeeaddr="USDC"'))
