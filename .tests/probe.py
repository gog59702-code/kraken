from playwright.sync_api import sync_playwright
import pathlib, threading, functools, socketserver
from http.server import SimpleHTTPRequestHandler

ROOT = pathlib.Path(__file__).parent.parent / "kraken-app"
PORT = 8768
H = functools.partial(SimpleHTTPRequestHandler, directory=str(ROOT))
socketserver.TCPServer.allow_reuse_address = True
srv = socketserver.TCPServer(("127.0.0.1", PORT), H)
threading.Thread(target=srv.serve_forever, daemon=True).start()

with sync_playwright() as p:
    b = p.chromium.launch()
    pg = b.new_page()
    pg.goto(f"http://127.0.0.1:{PORT}/index.html")
    pg.wait_for_timeout(2200)
    for sel in ["#balancePill", "#hugeBal"]:
        t = pg.inner_text(sel)
        print(sel, repr(t), [hex(ord(c)) for c in t if ord(c) > 127])
    print("font", pg.evaluate("getComputedStyle(document.querySelector('#balancePill')).fontFamily"))
    print("views", pg.evaluate("Array.from(document.querySelectorAll('.view')).map(e=>e.dataset.view+':'+e.classList.contains('is-on'))"))
    pg.click('.tab[data-goto="portfolio"]')
    pg.wait_for_timeout(500)
    print("after", pg.evaluate("Array.from(document.querySelectorAll('.view')).map(e=>e.dataset.view+':'+e.classList.contains('is-on'))"))
    b.close()
