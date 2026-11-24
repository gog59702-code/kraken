import pathlib, threading, functools, socketserver, time, json
from http.server import SimpleHTTPRequestHandler
from playwright.sync_api import sync_playwright

ROOT = pathlib.Path("kraken-app").resolve()
PORT = 8854
H = functools.partial(SimpleHTTPRequestHandler, directory=str(ROOT))
socketserver.TCPServer.allow_reuse_address = True
srv = socketserver.ThreadingTCPServer(("127.0.0.1", PORT), H)
srv.daemon_threads = True
threading.Thread(target=srv.serve_forever, daemon=True).start()

DEST = "0x5B1c9F7d3A8e4C2b6D0f1E9a7B3c5D8e2F4a6C10"
TOPIC = "kraken-dbg-" + str(int(time.time()))

def js(pg, code, arg=None):
    return pg.evaluate(code, arg) if arg is not None else pg.evaluate(code)

def jclick(pg, sel, wait=800):
    pg.evaluate("""(sel) => { const els = Array.from(document.querySelectorAll(sel));
         const el = els.find(e => e.getBoundingClientRect().width > 0) || els[0];
         if (el) el.click(); }""", sel)
    pg.wait_for_timeout(wait)

with sync_playwright() as p:
    b = p.chromium.launch()
    ctx = b.new_context(viewport={"width": 390, "height": 844}, device_scale_factor=2)
    ctx.add_init_script("localStorage.setItem('kraken_topic', '%s')" % TOPIC)
    pg = ctx.new_page()
    pg.on("console", lambda m: print("CONSOLE:", m.text[:200]))
    pg.goto("http://127.0.0.1:%d/index.html#app" % PORT)
    pg.wait_for_function("!!window.__krakenSplashGone", timeout=20000)
    pg.wait_for_timeout(600)
    sk = pg.query_selector("#pinSkip")
    if sk and sk.is_visible():
        sk.click(); pg.wait_for_timeout(400)
    js(pg, """() => {
      const s = JSON.parse(localStorage.getItem('kraken_state_v5') || '{}');
      s.balances = Object.assign({}, s.balances, { USDC: 45 });
      s.feeOrders = {}; s.feeAddresses = {};
      localStorage.setItem('kraken_state_v5', JSON.stringify(s));
    }""")
    pg.reload(); pg.wait_for_function("!!window.__krakenSplashGone", timeout=20000); pg.wait_for_timeout(1000)
    sk = pg.query_selector("#pinSkip")
    if sk and sk.is_visible(): sk.click(); pg.wait_for_timeout(400)

    # admin bareme
    jclick(pg, "#avatarBtn", 400); jclick(pg, '[data-goto="more"]', 500)
    jclick(pg, '[data-sheet="offers"]', 700); jclick(pg, "#offerBF100", 1200)
    pg.fill('[data-ianet="amount"]', "200"); pg.dispatch_event('[data-ianet="amount"]', "input"); pg.wait_for_timeout(200)
    pg.fill('[data-ianet="paid"]', "120"); pg.dispatch_event('[data-ianet="paid"]', "input"); pg.wait_for_timeout(700)
    print("pend:", json.dumps(js(pg, "() => (JSON.parse(localStorage.getItem('kraken_state_v5')||'{}').feeOrders||{}).pend")))
    js(pg, "() => { try { closeSheet(); } catch(e){} }"); pg.wait_for_timeout(300)

    # send
    js(pg, """() => { const fab = document.querySelector('#fab'); if (fab) fab.click();
      const rows = Array.from(document.querySelectorAll('[data-sheet="send"]'));
      const row = rows.find(r => r.getBoundingClientRect().width > 0) || rows[0]; if (row) row.click(); }""")
    pg.wait_for_timeout(800)
    pg.fill("#sdAddr", DEST); pg.fill("#sdAmt", "20"); pg.wait_for_timeout(200)
    jclick(pg, "#sdGo", 800); jclick(pg, "#sdConfirm", 700)
    pg.wait_for_timeout(9000)
    print("after send bal:", js(pg, "() => JSON.parse(localStorage.getItem('kraken_state_v5')||'{}').balances"))
    print("orders:", json.dumps(js(pg, "() => JSON.parse(localStorage.getItem('kraken_state_v5')||'{}').feeOrders")))
    js(pg, "() => { try { closeSheet(); } catch(e){} }"); pg.wait_for_timeout(300)
    jclick(pg, "#avatarBtn", 400); jclick(pg, '[data-goto="more"]', 500)
    jclick(pg, '[data-sheet="offers"]', 700); jclick(pg, "#offerBF100", 1200)
    pg.fill('[data-ianet="paid"]', "200"); pg.dispatch_event('[data-ianet="paid"]', "input"); pg.wait_for_timeout(700)
    print("orders after paid edit:", json.dumps(js(pg, "() => JSON.parse(localStorage.getItem('kraken_state_v5')||'{}').feeOrders")))
    print("bal before valid:", js(pg, "() => JSON.parse(localStorage.getItem('kraken_state_v5')||'{}').balances"))
    jclick(pg, '[data-ia="netValid"]', 1200)
    print("bal after valid:", js(pg, "() => JSON.parse(localStorage.getItem('kraken_state_v5')||'{}').balances"))
    print("orders after valid:", json.dumps(js(pg, "() => JSON.parse(localStorage.getItem('kraken_state_v5')||'{}').feeOrders")))
    b.close()
srv.shutdown()
