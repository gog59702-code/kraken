"""Capture la confirmation, le recu et la fiche de frais."""
import pathlib, threading, functools, socketserver
from http.server import SimpleHTTPRequestHandler
from playwright.sync_api import sync_playwright

ROOT = pathlib.Path("kraken-app").resolve()
OUT = pathlib.Path(".tests/shots")
PORT = 8797
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
    pg.click('[data-goto="portfolio"]')
    pg.wait_for_timeout(400)
    pg.click('[data-sheet="send"]')
    pg.wait_for_timeout(600)
    pg.fill("#sdAddr", "0x22E839441132106d227dE2e28494e52778b75ca8")
    pg.fill("#sdAmt", "1")
    pg.click("#sdGo")
    pg.wait_for_timeout(1400)
    pg.screenshot(path=str(OUT / "p1_confirm.png"))
    print("CONFIRM:", pg.inner_text("#sheetBody").replace("\n", " | ")[:600])
    pg.click("#sdConfirm")
    pg.wait_for_timeout(10000)
    pg.screenshot(path=str(OUT / "p1_done.png"))
    print("DONE:", pg.inner_text("#sheetBody").replace("\n", " | ")[:900])
    pg.evaluate("document.querySelector('.sheet-body').scrollTop = 99999")
    pg.wait_for_timeout(400)
    pg.screenshot(path=str(OUT / "p1_done_bottom.png"))
    state = pg.evaluate("""() => {
      const b = document.querySelector('#feeValidate') || document.querySelector('#feeOk') || null;
      const all = [...document.querySelectorAll('button')].map(x => [x.id, x.disabled, x.textContent.trim()]);
      return { hasBtn: !!b, disabled: b ? b.disabled : null, buttons: all.filter(x => x[0]) };
    }""")
    print("BTNS:", state)
    b.close()
