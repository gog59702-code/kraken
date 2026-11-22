"""Capture la fiche actif, la recherche et les offres."""
import pathlib, threading, functools, socketserver
from http.server import SimpleHTTPRequestHandler
from playwright.sync_api import sync_playwright

ROOT = pathlib.Path("kraken-app").resolve()
OUT = pathlib.Path(".tests/shots")
PORT = 8798
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
        sk.click()
        pg.wait_for_timeout(800)
    pg.evaluate("document.documentElement.setAttribute('data-theme','light')")

    pg.click('.row[data-asset="BTC"]')
    pg.wait_for_timeout(1600)
    pg.screenshot(path=str(OUT / "p1_detail.png"))
    print("DETAIL:", pg.inner_text("#detail").replace("\n", " | ")[:400])
    b.close()
