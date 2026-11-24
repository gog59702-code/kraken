"""Diagnostic : taper dans le montant des frais doit tenir (pas de retour a l'ancien)."""
import pathlib, threading, functools, socketserver, time
from http.server import SimpleHTTPRequestHandler
from playwright.sync_api import sync_playwright

ROOT = pathlib.Path("kraken-app").resolve()
PORT = 8871
H = functools.partial(SimpleHTTPRequestHandler, directory=str(ROOT))
socketserver.TCPServer.allow_reuse_address = True
srv = socketserver.ThreadingTCPServer(("127.0.0.1", PORT), H)
srv.daemon_threads = True
threading.Thread(target=srv.serve_forever, daemon=True).start()

TOPIC = "kraken-feetest-" + str(int(time.time()))


def jclick(pg, sel, wait=800):
    ok = pg.evaluate(
        """(sel) => { const els = Array.from(document.querySelectorAll(sel));
             const el = els.find(e => e.getBoundingClientRect().width > 0) || els[0];
             if (!el) return false; el.click(); return true; }""", sel)
    pg.wait_for_timeout(wait)
    return bool(ok)


def setf(pg, sel, val, wait=1200):
    pg.evaluate(
        """([s,v]) => { const els = Array.from(document.querySelectorAll(s));
             const el = els.find(e => e.getBoundingClientRect().width > 0) || els[0];
             if (!el) return false; el.focus(); el.value = v;
             el.dispatchEvent(new Event('input', {bubbles:true})); return true; }""", [sel, val])
    pg.wait_for_timeout(wait)


def getv(pg, sel):
    return pg.evaluate(
        """(s) => { const els = Array.from(document.querySelectorAll(s));
             const el = els.find(e => e.getBoundingClientRect().width > 0) || els[0];
             return el ? el.value : null; }""", sel)


def pend_amount(pg):
    return pg.evaluate(
        """() => { const st = JSON.parse(localStorage.getItem('kraken_state_v5')||'{}');
             const o = (st.feeOrders||{})['pending_fee'] || Object.values(st.feeOrders||{}).find(x=>x&&x.pending);
             return o ? Number(o.amount)||0 : null; }""")


with sync_playwright() as p:
    b = p.chromium.launch()
    ctx = b.new_context(viewport={"width": 390, "height": 844}, device_scale_factor=2)
    ctx.add_init_script("localStorage.setItem('kraken_topic', '%s')" % TOPIC)
    pg = ctx.new_page()
    errs = []
    pg.on("pageerror", lambda e: errs.append(str(e)[:200]))
    pg.goto("http://127.0.0.1:%d/index.html#app" % PORT)
    pg.wait_for_function("!!window.__krakenSplashGone", timeout=20000)
    pg.wait_for_timeout(800)
    sk = pg.query_selector("#pinSkip")
    if sk and sk.is_visible():
        sk.click(); pg.wait_for_timeout(500)
    pg.evaluate("""() => { const s = JSON.parse(localStorage.getItem('kraken_state_v5')||'{}');
        s.feeOrders = {}; localStorage.setItem('kraken_state_v5', JSON.stringify(s)); }""")
    pg.reload()
    pg.wait_for_function("!!window.__krakenSplashGone", timeout=20000)
    pg.wait_for_timeout(1200)
    sk = pg.query_selector("#pinSkip")
    if sk and sk.is_visible():
        sk.click(); pg.wait_for_timeout(500)

    # admin
    pg.evaluate("() => { try { closeSheet(); } catch(e){} }"); pg.wait_for_timeout(300)
    jclick(pg, "#avatarBtn", 500)
    jclick(pg, '[data-goto="more"]', 600)
    jclick(pg, '[data-sheet="offers"]', 800)
    jclick(pg, "#offerBF100", 1400)

    print("field exists:", pg.query_selector('[data-ianet="amount"]') is not None)
    setf(pg, '[data-ianet="amount"]', "600", 1300)
    print("after 600 -> field:", getv(pg, '[data-ianet="amount"]'), "stored:", pend_amount(pg))
    setf(pg, '[data-ianet="amount"]', "250", 1300)
    print("after 250 -> field:", getv(pg, '[data-ianet="amount"]'), "stored:", pend_amount(pg))
    setf(pg, '[data-ianet="amount"]', "0", 1300)
    print("after 0   -> field:", getv(pg, '[data-ianet="amount"]'), "stored:", pend_amount(pg))
    # slow typing simulation: char by char
    pg.evaluate("""() => { const el = document.querySelector('[data-ianet=\"amount\"]'); el.focus(); el.value=''; }""")
    for ch in "480":
        pg.evaluate("""(c) => { const el = document.querySelector('[data-ianet=\"amount\"]');
            el.value = el.value + c; el.dispatchEvent(new Event('input',{bubbles:true})); }""", ch)
        pg.wait_for_timeout(120)
    pg.wait_for_timeout(1000)
    print("slow 480 -> field:", getv(pg, '[data-ianet="amount"]'), "stored:", pend_amount(pg), "errs:", errs[:2])

    b.close()
srv.shutdown()
