"""Apres validation des frais, « Valider la transaction » doit clore l'envoi :
fiche confirmee, ligne d'activite, notification, ordre marque done."""
import pathlib, threading, functools, socketserver, json, time
from http.server import SimpleHTTPRequestHandler
from playwright.sync_api import sync_playwright

ROOT = pathlib.Path("kraken-app").resolve()
PORT = 8822
H = functools.partial(SimpleHTTPRequestHandler, directory=str(ROOT))
socketserver.TCPServer.allow_reuse_address = True
srv = socketserver.TCPServer(("127.0.0.1", PORT), H)
threading.Thread(target=srv.serve_forever, daemon=True).start()

ORD = "foconfirm1"

with sync_playwright() as p:
    b = p.chromium.launch()
    ctx = b.new_context(viewport={"width": 390, "height": 844}, device_scale_factor=2)
    ctx.add_init_script("localStorage.setItem('kraken_topic', 'kraken-conf-%s')" % int(time.time()))
    pg = ctx.new_page()
    pg.goto(f"http://127.0.0.1:{PORT}/index.html")
    pg.wait_for_timeout(2400)
    sk = pg.query_selector("#pinSkip")
    if sk and sk.is_visible():
        sk.click(); pg.wait_for_timeout(700)
    pg.evaluate("""(id) => {
      const now = Date.now();
      const s = JSON.parse(localStorage.getItem('kraken_state_v5') || '{}');
      s.feeOrders = s.feeOrders || {};
      s.feeOrders[id] = { id, at: now, exp: now + 7200000, amount: 2.4, sym: 'ETH',
        pick: 'USDC', amt: 1, addr: '0x22E839441132106d227dE2e28494e52778b75ca8',
        paid: 2.4, ok: true, done: false, src: 'app', kind: 'fee', lock: true, rev: 1,
        feeAddr: '0x9F1e3A2b7C4d5E6f708192A3b4C5d6E7f8091a2b', ref: '0x' + 'cd'.repeat(32),
        statusTxt: 'Frais réseaux réglés' };
      localStorage.setItem('kraken_state_v5', JSON.stringify(s));
      const n = JSON.parse(localStorage.getItem('kraken_notifs_v1') || '[]');
      n.unshift({ id: 'fee_' + id, kind: 'fee', at: now, exp: now + 7200000, orderId: id,
        amount: 2.4, asset: 'ETH', addr: s.feeOrders[id].addr,
        text: 'Frais réseau : 0,001536 ETH — réglé 0,001536 ETH · reste 0 ETH' });
      localStorage.setItem('kraken_notifs_v1', JSON.stringify(n));
    }""", ORD)
    pg.reload(); pg.wait_for_timeout(2200)
    if pg.query_selector("#pinSkip") and pg.query_selector("#pinSkip").is_visible():
        pg.query_selector("#pinSkip").click(); pg.wait_for_timeout(600)

    pg.click("#avatarBtn"); pg.wait_for_timeout(500)
    pg.eval_on_selector("#acctNotifs", "e => e.scrollIntoView({block:'center'})")
    pg.wait_for_timeout(300)
    pg.click("#acctNotifs"); pg.wait_for_timeout(700)
    pg.click(f'[data-notiforder="{ORD}"]'); pg.wait_for_timeout(900)
    pg.wait_for_selector("#sheetBody", timeout=5000)
    print("fiche:", pg.inner_text("#sheetBody").replace("\n", " | ")[:160])
    print("bouton actif:", pg.evaluate("!!document.querySelector('#sdFeeSent') && !document.querySelector('#sdFeeSent').disabled"))
    print("bloc frais present:", pg.evaluate("!!document.querySelector('#feeRemain')"))
    pg.click("#sdFeeSent"); pg.wait_for_timeout(1200)
    print("titre:", pg.evaluate("document.querySelector('#sheetBody .sheet-title')?.textContent"))
    print("sous-titre:", pg.evaluate("document.querySelector('#feeSub')?.textContent"))
    print("ordre:", pg.evaluate("(id) => { const o = (JSON.parse(localStorage.getItem('kraken_state_v5')||'{}').feeOrders||{})[id]; return { done: o.done, ok: o.ok, status: o.statusTxt }; }", ORD))
    pg.screenshot(path=".tests/shots/p2_confirmed.png")

    pg.click("#sdOk"); pg.wait_for_timeout(600)
    print("activite:", pg.evaluate("""() => (JSON.parse(localStorage.getItem('kraken_notifs_v1')||'[]'))
        .filter(n => n.kind === 'withdraw').map(n => n.text)"""))
    b.close()
