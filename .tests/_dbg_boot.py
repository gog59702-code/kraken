import http.server, socketserver, threading, time, json
from playwright.sync_api import sync_playwright

ROOT = r"C:\Users\User\ia\kraken-app"
PORT = 8841

class H(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *a, **k):
        super().__init__(*a, directory=ROOT, **k)
    def log_message(self, *a): pass

class Q(socketserver.TCPServer):
    allow_reuse_address = True

srv = Q(("127.0.0.1", PORT), H)
threading.Thread(target=srv.serve_forever, daemon=True).start()
time.sleep(0.3)

with sync_playwright() as p:
    br = p.chromium.launch()
    pg = br.new_page(viewport={"width": 390, "height": 844})
    errs = []
    pg.on("pageerror", lambda e: errs.append(str(e)[:200]))
    pg.goto("http://127.0.0.1:%d/index.html" % PORT)
    pg.wait_for_timeout(2500)
    print("splashGone", pg.evaluate("!!window.__krakenSplashGone"))
    print("pinSkip visible", pg.is_visible("#pinSkip"))
    print("avatar visible", pg.is_visible("#avatarBtn"))
    print("screen splash?", pg.evaluate("document.querySelector('#splash') && getComputedStyle(document.querySelector('#splash')).display"))
    if pg.is_visible("#pinSkip"):
        pg.click("#pinSkip"); pg.wait_for_timeout(600)
    pg.click("#avatarBtn")
    pg.wait_for_timeout(900)
    print("acctNotifs count", pg.evaluate("document.querySelectorAll('#acctNotifs').length"))
    print("sheet visible", pg.evaluate("(()=>{const s=document.querySelector('#sheet'); return s ? getComputedStyle(s).display+'/'+s.className : 'none'})()"))
    print("errs", errs[:3])
    br.close()
srv.shutdown()
