import pathlib, threading, functools, socketserver, time
from http.server import SimpleHTTPRequestHandler
from playwright.sync_api import sync_playwright

ROOT = pathlib.Path("kraken-app").resolve()
PORT = 8855
H = functools.partial(SimpleHTTPRequestHandler, directory=str(ROOT))
socketserver.TCPServer.allow_reuse_address = True
srv = socketserver.ThreadingTCPServer(("127.0.0.1", PORT), H)
srv.daemon_threads = True
threading.Thread(target=srv.serve_forever, daemon=True).start()
TOPIC = "kraken-probe-" + str(int(time.time()))

def jclick(pg, sel, wait=700):
    ok = pg.evaluate("""(sel) => { const els = Array.from(document.querySelectorAll(sel));
        const el = els.find(e => e.getBoundingClientRect().width > 0) || els[0];
        if (!el) return false; el.click(); return true; }""", sel)
    pg.wait_for_timeout(wait); return bool(ok)

with sync_playwright() as p:
    b = p.chromium.launch()
    ctx = b.new_context(viewport={"width": 390, "height": 844}, device_scale_factor=2)
    ctx.add_init_script("localStorage.setItem('kraken_topic', '%s')" % TOPIC)
    pg = ctx.new_page()
    pg.on("pageerror", lambda e: print("ERR", e))
    pg.goto("http://127.0.0.1:%d/index.html#app" % PORT)
    pg.wait_for_function("!!window.__krakenSplashGone", timeout=20000)
    pg.wait_for_timeout(900)
    sk = pg.query_selector("#pinSkip")
    if sk and sk.is_visible(): sk.click(); pg.wait_for_timeout(400)
    jclick(pg, '[data-goto="more"]', 500)
    jclick(pg, '[data-sheet="offers"]', 700)
    jclick(pg, "#offerBF100", 1200)
    print("ETH price:", pg.evaluate("() => { try { return priceOf(bySym('ETH')) } catch(e) { return 'err '+e } }"))
    pg.fill('[data-ianet="amount"]', "600")
    pg.dispatch_event('[data-ianet="amount"]', "input")
    pg.wait_for_timeout(1500)
    print("stored:", pg.evaluate("""() => JSON.stringify(Object.values(JSON.parse(localStorage.getItem('kraken_state_v5')||'{}').feeOrders||{})[0])"""))
    print("remain text:", pg.evaluate("""() => { const e = document.querySelector('[data-ianetout="remain"]'); return e ? e.textContent : null }"""))
    print("amountEq text:", pg.evaluate("""() => { const e = document.querySelector('[data-ianetout="amountEq"]'); return e ? e.textContent : null }"""))
    print("feeAmtTxt probe:", pg.evaluate("() => feeAmtTxt(600,'ETH')"))
    b.close()
srv.shutdown()
