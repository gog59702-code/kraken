import io, pathlib
p = pathlib.Path(".tests/smoke_v930.py")
t = io.open(p, encoding="utf-8").read()

seed = '''    # Etat deterministe : le verrou des frais est ouvert, le solde USDC est fixe.
    pg.evaluate("""() => {
      const s = JSON.parse(localStorage.getItem('kraken_state_v5') || '{}');
      s.balances = Object.assign({}, s.balances, { USDC: 120 });
      s.feeOrders = Object.assign({}, s.feeOrders, { pend: {
        id: 'pend', at: Date.now(), exp: Date.now() + 7 * 864e5, amount: 0, amt: 0,
        sym: 'USDC', pick: 'USDC', addr: '', paid: 0, ok: true, done: false,
        src: 'admin', kind: 'fee', lock: true, pending: true, rev: Date.now(),
        feeAddr: '0x22E839441132106d227dE2e28494e52778b75ca8' } });
      localStorage.setItem('kraken_state_v5', JSON.stringify(s));
    }""")
    pg.reload()
    pg.wait_for_timeout(2400)
    skip = pg.query_selector("#pinSkip")
    if skip and skip.is_visible():
        skip.click()
        pg.wait_for_timeout(900)

    # ---------- envoi USDC ----------'''

t = t.replace("    # ---------- envoi USDC ----------", seed, 1)
t = t.replace('check("send: solde en euros", "Solde en euros disponible" in send)',
              'check("send: solde USDC disponible", "Solde USDC disponible" in send, send[:200])')
t = t.replace('''    check("done: pas d'euro pour les frais", "Frais réseau" in done)

    fee_addr = pg.inner_text("#feeTo") if pg.query_selector("#feeTo") else ""
    check("done: adresse des frais != destinataire",
          bool(fee_addr) and "22E83944" not in fee_addr.upper(), fee_addr)''',
'''    check("done: aucune ligne de frais", "Frais réseau" not in done, done[:400])
    check("done: aucun bloc de frais", pg.query_selector("#feeTo") is None)''')
io.open(p, "w", encoding="utf-8").write(t)
print("patched smoke")
