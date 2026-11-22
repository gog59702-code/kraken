"""Capture les vues a la taille reelle (390x844 @2x) pour comparer aux shots."""
import pathlib, threading, functools, socketserver, sys
from http.server import SimpleHTTPRequestHandler
from playwright.sync_api import sync_playwright

ROOT = pathlib.Path("kraken-app").resolve()
OUT = pathlib.Path(".tests/shots")
PORT = 8801
H = functools.partial(SimpleHTTPRequestHandler, directory=str(ROOT))
socketserver.TCPServer.allow_reuse_address = True
srv = socketserver.TCPServer(("127.0.0.1", PORT), H)
threading.Thread(target=srv.serve_forever, daemon=True).start()

with sync_playwright() as p:
    b = p.chromium.launch()
    pg = b.new_page(viewport={"width": 390, "height": 844}, device_scale_factor=2)
    pg.goto(f"http://127.0.0.1:{PORT}/index.html")
    pg.wait_for_timeout(2400)
    sk = pg.query_selector("#pinSkip")
    if sk and sk.is_visible():
        sk.click()
        pg.wait_for_timeout(800)

    def shot(name):
        pg.wait_for_timeout(500)
        pg.screenshot(path=str(OUT / f"m_{name}.png"))
        print(name, "ok")

    for theme in ("dark", "light"):
        pg.evaluate(f"document.documentElement.setAttribute('data-theme','{theme}')")
        pg.wait_for_timeout(300)
        pg.click('[data-goto="home"]'); shot(f"home_{theme}")
        pg.click('[data-goto="portfolio"]'); shot(f"pf_{theme}")
        pg.click('[data-goto="explorer"]'); shot(f"explorer_{theme}")
        pg.click('[data-goto="more"]'); shot(f"more_{theme}")
    b.close()
