"""Capture l'ecran de recherche (vrai clic sur #searchBtn)."""
import pathlib, threading, functools, socketserver
from http.server import SimpleHTTPRequestHandler
from playwright.sync_api import sync_playwright

ROOT = pathlib.Path("kraken-app").resolve()
OUT = pathlib.Path(".tests/shots")
PORT = 8806
H = functools.partial(SimpleHTTPRequestHandler, directory=str(ROOT))
socketserver.TCPServer.allow_reuse_address = True
srv = socketserver.TCPServer(("127.0.0.1", PORT), H)
threading.Thread(target=srv.serve_forever, daemon=True).start()

with sync_playwright() as p:
    b = p.chromium.launch()
    pg = b.new_page(viewport={"width": 430, "height": 932}, device_scale_factor=2)
    pg.goto(f"http://127.0.0.1:{PORT}/index.html")
    pg.wait_for_timeout(2400)
    sk = pg.query_selector("#pinSkip")
    if sk and sk.is_visible():
        sk.click(); pg.wait_for_timeout(700)
    pg.click("#searchBtn")
    pg.wait_for_timeout(900)
    print("screen visible:", pg.evaluate("document.querySelector('#searchScreen')?.classList.contains('is-on')"))
    pg.screenshot(path=str(OUT / "p1_search.png"))
    print("SEARCH:", pg.inner_text("#searchScreen").replace("\n", " | ")[:260])
    b.close()
