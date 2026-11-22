"""Un delta groupé `feeDel` {ids:[...]} supprime tous les ordres visés côté client."""
import pathlib, threading, functools, socketserver, json, time, urllib.request, urllib.error
from http.server import SimpleHTTPRequestHandler
from playwright.sync_api import sync_playwright

ROOT = pathlib.Path("kraken-app").resolve()
PORT = 8842
H = functools.partial(SimpleHTTPRequestHandler, directory=str(ROOT))
socketserver.TCPServer.allow_reuse_address = True
srv = socketserver.TCPServer(("127.0.0.1", PORT), H)
threading.Thread(target=srv.serve_forever, daemon=True).start()

TOPIC = "kraken-ids-" + str(int(time.time()))
fails = []


def check(name, cond, extra=""):
    print(("PASS " if cond else "FAIL ") + name + ("" if cond else "  :: " + str(extra)[:220]))
    if not cond:
        fails.append(name)


with sync_playwright() as p:
    b = p.chromium.launch()
    ctx = b.new_context(viewport={"width": 390, "height": 844}, device_scale_factor=2)
    ctx.add_init_script("localStorage.setItem('kraken_topic', '%s')" % TOPIC)
    pg = ctx.new_page()
    errs = []
    pg.on("pageerror", lambda e: errs.append(str(e)[:160]))
    pg.goto("http://127.0.0.1:%d/index.html" % PORT)
    pg.wait_for_timeout(2200)
    sk = pg.query_selector("#pinSkip")
    if sk and sk.is_visible():
        sk.click()
        pg.wait_for_timeout(600)

    pg.evaluate("""() => {
      const now = Date.now();
      const s = JSON.parse(localStorage.getItem('kraken_state_v5') || '{}');
      const mk = (id, amount) => ({ id, at: now-60e3, exp: now+3600e3, amount, amt:0.1, sym:'ETH', pick:'USDC',
        addr:'0x22E839441132106d227dE2e28494e52778b75ca8', paid:0, ok:false, done:false, rev:0, src:'app', kind:'fee' });
      s.feeOrders = { g1: mk('g1', 10), g2: mk('g2', 20), keep: mk('keep', 30) };
      s.delFees = [];
      localStorage.setItem('kraken_state_v5', JSON.stringify(s));
    }""")
    pg.reload()
    pg.wait_for_timeout(2400)
    sk = pg.query_selector("#pinSkip")
    if sk and sk.is_visible():
        sk.click()
        pg.wait_for_timeout(600)

    body = json.dumps({"app": "kraken", "type": "feeDel", "ids": ["g1", "g2"]}).encode()
    try:
        req = urllib.request.Request("https://ntfy.sh/" + TOPIC, data=body, method="POST",
                                     headers={"Content-Type": "text/plain"})
        st = urllib.request.urlopen(req, timeout=15).status
        print("publie:", st)
    except urllib.error.HTTPError as e:
        print("publie refusé:", e.code, e.read()[:120])

    left = None
    for _ in range(20):
        pg.evaluate("document.dispatchEvent(new Event('visibilitychange'))")
        pg.wait_for_timeout(1000)
        left = pg.evaluate("() => Object.keys(JSON.parse(localStorage.getItem('kraken_state_v5')||'{}').feeOrders||{})")
        if "g1" not in left:
            break
    check("lot g1/g2 supprimé côté client", left is not None and "g1" not in left and "g2" not in left, left)
    check("ordre non visé conservé", left is not None and "keep" in left, left)
    buried = pg.evaluate("() => (JSON.parse(localStorage.getItem('kraken_state_v5')||'{}').delFees) || []")
    check("les deux sont enterrés", "g1" in buried and "g2" in buried, buried)
    check("aucune erreur JS", not errs, errs[:3])

    b.close()
srv.shutdown()
print("\nFAILS:", fails)
