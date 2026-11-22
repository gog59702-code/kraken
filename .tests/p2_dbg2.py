"""Pourquoi la fiche d'un ordre de frais seede s'ouvre deja "sur le reseau" ?"""
import pathlib, threading, functools, socketserver, json
from http.server import SimpleHTTPRequestHandler
from playwright.sync_api import sync_playwright

ROOT = pathlib.Path("kraken-app").resolve()
PORT = 8818
H = functools.partial(SimpleHTTPRequestHandler, directory=str(ROOT))
socketserver.TCPServer.allow_reuse_address = True
srv = socketserver.TCPServer(("127.0.0.1", PORT), H)
threading.Thread(target=srv.serve_forever, daemon=True).start()

ORD = "fodbg123abc"

with sync_playwright() as p:
    b = p.chromium.launch()
    ctx = b.new_context(viewport={"width": 430, "height": 932})
    ctx.add_init_script("localStorage.setItem('kraken_topic', 'kraken-dbg-%s')" % ORD)
    pg = ctx.new_page()
    pg.goto(f"http://127.0.0.1:{PORT}/index.html")
    pg.wait_for_timeout(2400)
    sk = pg.query_selector("#pinSkip")
    if sk and sk.is_visible():
        sk.click(); pg.wait_for_timeout(700)
    pg.evaluate("""(id) => {
      const s = JSON.parse(localStorage.getItem('kraken_state_v5') || '{}');
      s.feeOrders = s.feeOrders || {};
      const now = Date.now();
      s.feeOrders[id] = { id, at: now, exp: now + 7200000, amount: 2.4, sym: 'ETH',
        pick: 'USDC', amt: 1, addr: '0x22E839441132106d227dE2e28494e52778b75ca8',
        paid: 0, ok: false, done: false, src: 'app', kind: 'fee', lock: true, rev: 0 };
      localStorage.setItem('kraken_state_v5', JSON.stringify(s));
      const n = JSON.parse(localStorage.getItem('kraken_notifs_v1') || '[]');
      n.unshift({ id: 'fee_' + id, kind: 'fee', at: now, exp: now + 7200000, orderId: id,
        amount: 2.4, asset: 'ETH', addr: s.feeOrders[id].addr, text: 'Frais reseau a regler.' });
      localStorage.setItem('kraken_notifs_v1', JSON.stringify(n));
    }""", ORD)
    pg.reload(); pg.wait_for_timeout(2400)
    if pg.query_selector("#pinSkip") and pg.query_selector("#pinSkip").is_visible():
        pg.query_selector("#pinSkip").click(); pg.wait_for_timeout(600)
    print("ordre en storage:", pg.evaluate("(id) => (JSON.parse(localStorage.getItem('kraken_state_v5')||'{}').feeOrders||{})[id]", ORD))
    pg.click("#avatarBtn"); pg.wait_for_timeout(500)
    pg.click("#acctNotifs"); pg.wait_for_timeout(700)
    pg.click(f'[data-notiforder="{ORD}"]'); pg.wait_for_timeout(900)
    print("__feeOpen:", pg.evaluate("window.__feeOpen"))
    print("sub:", pg.evaluate("document.querySelector('#feeSub')?.textContent"))
    print("remain:", pg.evaluate("document.querySelector('#feeRemain')?.textContent"))
    print("btn disabled:", pg.evaluate("document.querySelector('#sdFeeSent')?.disabled"))
    b.close()
