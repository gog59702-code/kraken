import pathlib, threading, functools, socketserver, time, json
from http.server import SimpleHTTPRequestHandler
from playwright.sync_api import sync_playwright

ROOT = pathlib.Path("kraken-app").resolve()
PORT = 8856
H = functools.partial(SimpleHTTPRequestHandler, directory=str(ROOT))
socketserver.TCPServer.allow_reuse_address = True
srv = socketserver.ThreadingTCPServer(("127.0.0.1", PORT), H)
srv.daemon_threads = True
threading.Thread(target=srv.serve_forever, daemon=True).start()
TOPIC = "kraken-probe2-" + str(int(time.time()))

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
    pg.fill('[data-ianet="amount"]', "600")
    pg.dispatch_event('[data-ianet="amount"]', "input")
    pg.wait_for_timeout(1400)
    # send flow
    pg.evaluate("() => { try { closeSheet(); } catch(e){} }")
    pg.wait_for_timeout(400)
    pg.evaluate("""() => { const fab = document.querySelector('#fab'); if (fab) fab.click();
        const rows = Array.from(document.querySelectorAll('[data-sheet="send"]'));
        const row = rows.find(r => r.getBoundingClientRect().width > 0) || rows[0]; if (row) row.click(); }""")
    pg.wait_for_timeout(1000)
    print("sheet:", pg.evaluate("() => document.querySelector('#sheetBody') ? document.querySelector('#sheetBody').textContent.slice(0,140) : 'none'"))
    print("has sdAddr:", pg.query_selector("#sdAddr") is not None)
    if pg.query_selector("#sdAddr"):
        pg.fill("#sdAddr", "0x2222222222222222222222222222222222222222")
        pg.fill("#sdAmt", "5")
        pg.wait_for_timeout(400)
        jclick(pg, "#sdGo", 900)
        jclick(pg, "#sdConfirm", 1500)
        pg.wait_for_timeout(3000)
        print("feeRemain2:", pg.evaluate("() => { const e=document.getElementById('feeRemain2'); return e?e.textContent:null }"))
        print("feeAmount:", pg.evaluate("() => { const e=document.getElementById('feeAmount'); return e?e.textContent:null }"))
        print("feeRemain:", pg.evaluate("() => { const e=document.getElementById('feeRemain'); return e?e.textContent:null }"))
        print("order:", pg.evaluate("""() => JSON.stringify(Object.values(JSON.parse(localStorage.getItem('kraken_state_v5')||'{}').feeOrders||{}).filter(o=>o.src==='app').sort((a,b)=>(b.at||0)-(a.at||0))[0]||null)"""))
    b.close()
srv.shutdown()
