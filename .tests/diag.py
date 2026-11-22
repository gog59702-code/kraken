from playwright.sync_api import sync_playwright
import pathlib, threading, functools, socketserver
from http.server import SimpleHTTPRequestHandler

ROOT = pathlib.Path("kraken-app").resolve()
PORT = 8768
H = functools.partial(SimpleHTTPRequestHandler, directory=str(ROOT))
socketserver.TCPServer.allow_reuse_address = True
srv = socketserver.TCPServer(("127.0.0.1", PORT), H)
threading.Thread(target=srv.serve_forever, daemon=True).start()

with sync_playwright() as p:
    b = p.chromium.launch()
    pg = b.new_page(viewport={"width": 430, "height": 932})
    pg.goto(f"http://127.0.0.1:{PORT}/index.html")
    pg.wait_for_timeout(2000)
    for sel in ["#balancePill", "#hugeBal"]:
        t = pg.inner_text(sel)
        print(sel, repr(t), [hex(ord(c)) for c in t if ord(c) > 127])
        print("font", pg.evaluate("s=>getComputedStyle(document.querySelector(s)).fontFamily", sel))
    print("views", pg.eval_on_selector_all(".view", "els=>els.map(e=>e.dataset.view)"))
    pg.click('.tab[data-goto="portfolio"]')
    pg.wait_for_timeout(600)
    print("on", pg.eval_on_selector_all(".view.is-on", "els=>els.map(e=>e.dataset.view)"))
    b.close()
