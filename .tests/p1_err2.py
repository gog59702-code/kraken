import pathlib, threading, functools, socketserver
from http.server import SimpleHTTPRequestHandler
from playwright.sync_api import sync_playwright

ROOT = pathlib.Path("kraken-app").resolve()
PORT = 8809
H = functools.partial(SimpleHTTPRequestHandler, directory=str(ROOT))
socketserver.TCPServer.allow_reuse_address = True
srv = socketserver.TCPServer(("127.0.0.1", PORT), H)
threading.Thread(target=srv.serve_forever, daemon=True).start()

with sync_playwright() as p:
    b = p.chromium.launch()
    pg = b.new_page()
    errs = []
    pg.on("pageerror", lambda e: errs.append(str(e)))
    pg.on("console", lambda m: errs.append("console:" + m.type + ":" + m.text) if m.type == "error" else None)
    pg.goto(f"http://127.0.0.1:{PORT}/index.html")
    pg.wait_for_timeout(2200)
    sk = pg.query_selector("#pinSkip")
    if sk and sk.is_visible():
        sk.click(); pg.wait_for_timeout(500)
    pg.click('[data-goto="portfolio"]'); pg.wait_for_timeout(400)
    pg.click("#seeActivity"); pg.wait_for_timeout(900)
    data = pg.evaluate("""() => ({
      html: document.querySelector('#sheetBody').innerHTML,
      rows: document.querySelectorAll('#sheetBody .act-row').length,
      list: document.querySelectorAll('#sheetBody .activity-list').length,
      card: document.querySelectorAll('#activityRows .act-row').length
    })""")
    out = pathlib.Path(".tests/err_out.txt")
    out.write_text(repr(errs) + "\n" + "rows=%s list=%s card=%s\n" % (data["rows"], data["list"], data["card"]) + data["html"], encoding="utf-8")
    print("written")
    b.close()
