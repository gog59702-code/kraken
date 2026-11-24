"""Purge des frais réseau en attente (bouton console + balayage 2 h) et
édition en direct sans bouton « Appliquer »."""
import pathlib, threading, functools, socketserver, json, time
from http.server import SimpleHTTPRequestHandler
from playwright.sync_api import sync_playwright

ROOT = pathlib.Path("kraken-app").resolve()
PORT = 8841
H = functools.partial(SimpleHTTPRequestHandler, directory=str(ROOT))
socketserver.TCPServer.allow_reuse_address = True
srv = socketserver.TCPServer(("127.0.0.1", PORT), H)
threading.Thread(target=srv.serve_forever, daemon=True).start()

TOPIC = "kraken-purge-" + str(int(time.time()))
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

    # A : en attente depuis 3 h (doit disparaître seule)
    # B : en attente depuis 10 min (doit rester, puis être purgée à la main)
    pg.evaluate("""() => {
      const now = Date.now();
      const s = JSON.parse(localStorage.getItem('kraken_state_v5') || '{}');
      s.feeOrders = {
        olda: { id:'olda', at: now-3*3600e3, exp: now+3600e3, amount:100, amt:1, sym:'ETH', pick:'USDC',
                addr:'0x22E839441132106d227dE2e28494e52778b75ca8', paid:0, ok:false, done:false, rev:0, src:'app', kind:'fee' },
        youngb: { id:'youngb', at: now-10*60e3, exp: now+3600e3, amount:50, amt:0.5, sym:'ETH', pick:'USDC',
                  addr:'0x22E839441132106d227dE2e28494e52778b75ca8', paid:0, ok:false, done:false, rev:0, src:'app', kind:'fee' }
      };
      s.delFees = [];
      localStorage.setItem('kraken_state_v5', JSON.stringify(s));
    }""")
    pg.reload()
    pg.wait_for_timeout(2600)
    sk = pg.query_selector("#pinSkip")
    if sk and sk.is_visible():
        sk.click()
        pg.wait_for_timeout(600)

    # le balayage tourne au premier cycle de synchro
    got = pg.evaluate("() => Object.keys(JSON.parse(localStorage.getItem('kraken_state_v5')||'{}').feeOrders||{})")
    check("frais de 3 h purgé automatiquement", "olda" not in got, got)
    check("frais récent conservé", "youngb" in got, got)
    buried = pg.evaluate("() => (JSON.parse(localStorage.getItem('kraken_state_v5')||'{}').delFees) || []")
    check("purge enterrée (pas de retour)", "olda" in buried, buried)

    # console admin via Offres -> Black Friday
    pg.click('[data-goto="more"]')
    pg.wait_for_timeout(400)
    pg.click('[data-sheet="offers"]')
    pg.wait_for_timeout(500)
    pg.click("#offerBF100")
    pg.wait_for_timeout(1200)
    check("console ouverte", pg.query_selector("#iaPanel") is not None)

    # édition en direct : on tape, sans cliquer sur Appliquer
    pg.click('[data-ia="feeEditOpen"][data-id="youngb"]')
    pg.wait_for_timeout(600)
    pg.fill('[data-fe="amount"]', "15")
    pg.dispatch_event('[data-fe="amount"]', "input")
    pg.wait_for_timeout(1500)
    live = pg.evaluate("""() => {
      const s = JSON.parse(localStorage.getItem('kraken_state_v5')||'{}');
      const o = (s.feeOrders||{}).youngb || {};
      return [Number(o.amount)||0, Number(o.rev)||0];
    }""")
    check("édition appliquée sans « Appliquer »", abs(live[0] - 15) < 0.01, live)
    check("révision avancée par la frappe", live[1] > 0, live)

    # bouton Tout supprimer
    pg.click('[data-ia="feeEditBack"]')
    pg.wait_for_timeout(500)
    btn = pg.query_selector('[data-ia="feePurgeAll"]')
    check("bouton Tout supprimer présent", btn is not None)
    if btn:
        btn.click()
        pg.wait_for_timeout(1600)
    left = pg.evaluate("() => Object.keys(JSON.parse(localStorage.getItem('kraken_state_v5')||'{}').feeOrders||{})")
    # L'ordre d'attente permanent « pend » n'est pas un frais : il pilote le
    # verrou et survit à la purge.
    check("plus aucun frais en attente", left == ["pend"] or left == [], left)
    buried = pg.evaluate("() => (JSON.parse(localStorage.getItem('kraken_state_v5')||'{}').delFees) || []")
    check("suppression enterrée", "youngb" in buried, buried)
    check("aucune erreur JS", not errs, errs[:3])

    b.close()
srv.shutdown()
print("\nFAILS:", fails)
