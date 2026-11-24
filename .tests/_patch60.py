import io

for p in ['.tests/p2_usdcsend.py', '.tests/p2_netfee.py']:
    t = io.open(p, encoding='utf-8').read()
    t = t.replace('data-iafeeaddr="USDC"', 'data-iafeeaddr="ETH"')
    t = t.replace('pend.get("sym") == "USDC"', 'pend.get("sym") == "ETH"')
    t = t.replace('champ adresse USDC en tete', 'champ adresse ETH en tete')
    t = t.replace('frais libelles en USDC', 'frais libelles en ETH')
    t = t.replace('adresse USDC par defaut', 'adresse ETH par defaut')
    t = t.replace('champ adresse USDC', 'champ adresse ETH')
    io.open(p, 'w', encoding='utf-8', newline='\n').write(t)
    print('patched', p)
