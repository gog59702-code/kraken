import pathlib, threading, functools, socketserver
from http.server import SimpleHTTPRequestHandler
from playwright.sync_api import sync_playwright

ROOT = pathlib.Path("kraken-app").resolve()
OUT = pathlib.Path(".tests/shots")
PORT = 8805
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
        sk.click(); pg.wait_for_timeout(700)
    pg.evaluate("document.documentElement.setAttribute('data-theme','dark')")
    pg.click('[data-goto="portfolio"]'); pg.wait_for_timeout(500)
    pg.click("#seeActivity"); pg.wait_for_timeout(800)
    print("ROWS", pg.eval_on_selector_all(".act-row", "els => els.map(e => e.innerText.replace(/\\n/g, ' | '))"))
    pg.evaluate("document.querySelector('.sheet-body').scrollTop = 0")
    pg.wait_for_timeout(300)
    pg.screenshot(path=str(OUT / "p1_activity_dark.png"))
    b.close()
