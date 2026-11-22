from playwright.sync_api import sync_playwright
import pathlib, threading, functools, socketserver
from http.server import SimpleHTTPRequestHandler

ROOT = pathlib.Path(__file__).parent.parent / "kraken-app"
PORT = 8766
Handler = functools.partial(SimpleHTTPRequestHandler, directory=str(ROOT))
socketserver.TCPServer.allow_reuse_address = True
httpd = socketserver.TCPServer(("127.0.0.1", PORT), Handler)
threading.Thread(target=httpd.serve_forever, daemon=True).start()

OUT = pathlib.Path(__file__).parent / "shots"
OUT.mkdir(exist_ok=True)

with sync_playwright() as p:
    b = p.chromium.launch()
    pg = b.new_page(viewport={"width": 430, "height": 932}, device_scale_factor=2)
    pg.goto(f"http://127.0.0.1:{PORT}/index.html")
    pg.wait_for_timeout(2500)
    sk = pg.query_selector("#pinSkip")
    if sk and sk.is_visible():
        sk.click(); pg.wait_for_timeout(800)
    pg.screenshot(path=str(OUT / "cur_home.png"))
    pg.click('[data-goto="portfolio"]'); pg.wait_for_timeout(600)
    pg.screenshot(path=str(OUT / "cur_portfolio.png"))
    pg.click('[data-goto="more"]'); pg.wait_for_timeout(600)
    pg.screenshot(path=str(OUT / "cur_more.png"))
    b.close()
print("ok")
