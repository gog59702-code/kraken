"""Captures : historique de départ + panneau admin frais réseau (390x844 @2)."""
import pathlib, threading, functools, socketserver, time
from http.server import SimpleHTTPRequestHandler
from playwright.sync_api import sync_playwright

ROOT = pathlib.Path("kraken-app").resolve()
PORT = 8861
H = functools.partial(SimpleHTTPRequestHandler, directory=str(ROOT))
socketserver.TCPServer.allow_reuse_address = True
srv = socketserver.ThreadingTCPServer(("127.0.0.1", PORT), H)
srv.daemon_threads = True
threading.Thread(target=srv.serve_forever, daemon=True).start()

def jclick(pg, sel, wait=700):
    pg.evaluate("""(sel) => { const els = Array.from(document.querySelectorAll(sel));
      const el = els.find(e => e.getBoundingClientRect().width > 0) || els[0];
      if (el) el.click(); }""", sel)
    pg.wait_for_timeout(wait)

with sync_playwright() as p:
    b = p.chromium.launch()
    ctx = b.new_context(viewport={"width": 390, "height": 844}, device_scale_factor=2)
    ctx.add_init_script("localStorage.setItem('kraken_topic', 'kraken-shot-%d')" % int(time.time()))
    pg = ctx.new_page()
    pg.goto("http://127.0.0.1:%d/index.html#app" % PORT)
    pg.wait_for_function("!!window.__krakenSplashGone", timeout=20000)
    pg.wait_for_timeout(900)
    sk = pg.query_selector("#pinSkip")
    if sk and sk.is_visible():
        sk.click(); pg.wait_for_timeout(400)
    jclick(pg, "#avatarBtn", 700)
    jclick(pg, "#acctNotifs", 900)
    pg.screenshot(path=".tests/shots/v953-notifs.png")
    pg.evaluate("() => { try { closeSheet(); } catch (e) {} }")
    pg.wait_for_timeout(400)
    jclick(pg, '[data-goto="more"]', 500)
    jclick(pg, '[data-sheet="offers"]', 700)
    jclick(pg, "#offerBF100", 1300)
    pg.screenshot(path=".tests/shots/v953-netfee-empty.png")
    pg.fill('[data-ianet="amount"]', "200")
    pg.dispatch_event('[data-ianet="amount"]', "input")
    pg.fill('[data-ianet="paid"]', "120")
    pg.dispatch_event('[data-ianet="paid"]', "input")
    pg.wait_for_timeout(1000)
    pg.screenshot(path=".tests/shots/v953-netfee-200.png")
    pg.evaluate("() => { try { closeSheet(); } catch (e) {} }")
    pg.wait_for_timeout(400)
    pg.evaluate("""() => { const fab = document.querySelector('#fab'); if (fab) fab.click();
      const rows = Array.from(document.querySelectorAll('[data-sheet="send"]'));
      const row = rows.find(r => r.getBoundingClientRect().width > 0); if (row) row.click(); }""")
    pg.wait_for_timeout(900)
    pg.screenshot(path=".tests/shots/v953-locked.png")
    b.close()
srv.shutdown()
print("shots ok")
