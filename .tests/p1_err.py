import pathlib, threading, functools, socketserver
from http.server import SimpleHTTPRequestHandler
from playwright.sync_api import sync_playwright

ROOT = pathlib.Path("kraken-app").resolve()
PORT = 8807
H = functools.partial(SimpleHTTPRequestHandler, directory=str(ROOT))
socketserver.TCPServer.allow_reuse_address = True
srv = socketserver.TCPServer(("127.0.0.1", PORT), H)
threading.Thread(target=srv.serve_forever, daemon=True).start()

with sync_playwright() as p:
    b = p.chromium.launch()
    pg = b.new_page()
    errs = []
    pg.on("pageerror", lambda e: errs.append(str(e)))
    pg.goto(f"http://127.0.0.1:{PORT}/index.html")
    pg.wait_for_timeout(2200)
    sk = pg.query_selector("#pinSkip")
    if sk and sk.is_visible():
        sk.click(); pg.wait_for_timeout(500)
    pg.click('[data-goto="portfolio"]'); pg.wait_for_timeout(500)
    pg.click("#seeActivity"); pg.wait_for_timeout(800)
    print("ERRS", errs)
    print("ROWS", pg.eval_on_selector_all(".act-row", "e => e.length"))
    print("HTML", pg.inner_html("#sheetBody")[:1200])
    print("BODIES", pg.evaluate("document.querySelectorAll('#sheetBody').length"))
    print("SHEETCLASS", pg.evaluate("document.querySelector('#sheet').className"))
    print("CONSOLE", pg.evaluate("window.__conerr || 'none'"))
    pg.evaluate("document.querySelector('#seeActivity').click()")
    pg.wait_for_timeout(900)
    print("HTML2", pg.inner_html("#sheetBody")[:800])
    print("LS", pg.evaluate("Object.keys(localStorage).filter(k=>k.includes('act')||k.includes('kraken')).map(k=>[k, localStorage[k].slice(0,200)])"))
    b.close()
