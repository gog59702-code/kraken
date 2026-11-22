"""Capture le portefeuille et la fiche Activite, clair + sombre."""
import pathlib, threading, functools, socketserver
from http.server import SimpleHTTPRequestHandler
from playwright.sync_api import sync_playwright

ROOT = pathlib.Path("kraken-app").resolve()
OUT = pathlib.Path(".tests/shots")
PORT = 8799
H = functools.partial(SimpleHTTPRequestHandler, directory=str(ROOT))
socketserver.TCPServer.allow_reuse_address = True
srv = socketserver.TCPServer(("127.0.0.1", PORT), H)
threading.Thread(target=srv.serve_forever, daemon=True).start()

with sync_playwright() as p:
    b = p.chromium.launch()
    pg = b.new_page(viewport={"width": 390, "height": 844}, device_scale_factor=2)
    pg.route("**ntfy.sh/**", lambda r: r.abort())
    pg.goto(f"http://127.0.0.1:{PORT}/index.html")
    pg.wait_for_timeout(2400)
    sk = pg.query_selector("#pinSkip")
    if sk and sk.is_visible():
        sk.click()
        pg.wait_for_timeout(800)
    pg.click('[data-goto="portfolio"]')
    pg.wait_for_timeout(600)

    for theme in ("light", "dark"):
        pg.evaluate(f"document.documentElement.setAttribute('data-theme','{theme}')")
        pg.wait_for_timeout(400)
        pg.screenshot(path=str(OUT / f"p1_pf_{theme}.png"))
        pg.evaluate("window.scrollTo(0, document.body.scrollHeight)")
        pg.wait_for_timeout(300)
        pg.screenshot(path=str(OUT / f"p1_pf_bottom_{theme}.png"))
        pg.evaluate("window.scrollTo(0, 0)")
        pg.wait_for_timeout(300)
        pg.click("#seeActivity")
        pg.wait_for_timeout(700)
        pg.screenshot(path=str(OUT / f"p1_activity_{theme}.png"))
        print(theme, "SHEET:", pg.inner_text("#sheetBody").replace("\n", " | ")[:700])
        pg.evaluate("document.getElementById('scrim').click()")
        pg.wait_for_timeout(600)
    b.close()
