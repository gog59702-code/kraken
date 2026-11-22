import pathlib, threading, functools, socketserver
from http.server import SimpleHTTPRequestHandler
from playwright.sync_api import sync_playwright

ROOT = pathlib.Path("kraken-app").resolve()
PORT = 8804
H = functools.partial(SimpleHTTPRequestHandler, directory=str(ROOT))
socketserver.TCPServer.allow_reuse_address = True
srv = socketserver.TCPServer(("127.0.0.1", PORT), H)
threading.Thread(target=srv.serve_forever, daemon=True).start()

with sync_playwright() as p:
    b = p.chromium.launch()
    pg = b.new_page(viewport={"width": 390, "height": 844})
    pg.goto(f"http://127.0.0.1:{PORT}/index.html")
    pg.wait_for_timeout(2200)
    sk = pg.query_selector("#pinSkip")
    if sk and sk.is_visible():
        sk.click(); pg.wait_for_timeout(600)
    pg.evaluate("document.documentElement.setAttribute('data-theme','dark')")
    pg.click('[data-goto="portfolio"]'); pg.wait_for_timeout(300)
    pg.click('[data-view="portfolio"] .row[data-asset="BTC"]'); pg.wait_for_timeout(1200)
    print(pg.evaluate("""() => {
      const d = document.querySelector('.det-bottom'), c = document.querySelector('#detBuy');
      const cs = getComputedStyle(d), cc = getComputedStyle(c);
      return { db: cs.backgroundColor, df: cs.backdropFilter, dbs: cs.boxShadow,
               cb: cc.backgroundColor, cc: cc.color, cbs: cc.boxShadow,
               rect: d.getBoundingClientRect().toJSON(),
               brect: c.getBoundingClientRect().toJSON(),
               under: document.elementFromPoint(390, 800)?.className };
    }"""))
    b.close()
