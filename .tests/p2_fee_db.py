import pathlib, threading, functools, socketserver, json
from http.server import SimpleHTTPRequestHandler
from playwright.sync_api import sync_playwright

ROOT = pathlib.Path("kraken-app").resolve()
PORT = 8814
H = functools.partial(SimpleHTTPRequestHandler, directory=str(ROOT))
socketserver.TCPServer.allow_reuse_address = True
srv = socketserver.TCPServer(("127.0.0.1", PORT), H)
threading.Thread(target=srv.serve_forever, daemon=True).start()

ADDR = "0x22E839441132106d227dE2e28494e52778b75ca8"

with sync_playwright() as p:
    b = p.chromium.launch()
    pg = b.new_page()
    pg.route("**ntfy.sh/**", lambda r: r.abort())
    pg.goto(f"http://127.0.0.1:{PORT}/index.html")
    pg.wait_for_timeout(2200)
    pg.evaluate("localStorage.clear()")
    pg.reload(); pg.wait_for_timeout(2200)
    sk = pg.query_selector("#pinSkip")
    if sk and sk.is_visible():
        sk.click(); pg.wait_for_timeout(600)
    pg.click('[data-goto="portfolio"]'); pg.wait_for_timeout(400)
    pg.click('[data-sheet="send"]'); pg.wait_for_timeout(500)
    print("SEND sheet:", pg.inner_text("#sheetBody").replace("\n", " | ")[:400])
    pg.click("#sdPick"); pg.wait_for_timeout(400)
    pg.click('[data-pick="USDC"]'); pg.wait_for_timeout(600)
    pg.fill("#sdAddr", ADDR)
    pg.fill("#sdAmt", "1")
    pg.click("#sdGo"); pg.wait_for_timeout(1200)
    print("CONFIRM:", pg.inner_text("#sheetBody").replace("\n", " | "))
    b.close()
