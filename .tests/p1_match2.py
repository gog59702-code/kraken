"""Capture detail actif + confirmation + fiche de suivi (390x844 @2x)."""
import pathlib, threading, functools, socketserver
from http.server import SimpleHTTPRequestHandler
from playwright.sync_api import sync_playwright

ROOT = pathlib.Path("kraken-app").resolve()
OUT = pathlib.Path(".tests/shots")
PORT = 8802
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

    for theme in ("dark", "light"):
        pg.evaluate(f"document.documentElement.setAttribute('data-theme','{theme}')")
        pg.wait_for_timeout(300)
        if not pg.is_visible('[data-view="portfolio"] .row[data-asset="BTC"]'):
            pg.click('[data-goto="portfolio"]')
            pg.wait_for_timeout(400)
        pg.click('[data-view="portfolio"] .row[data-asset="BTC"]')
        pg.wait_for_timeout(1400)
        pg.screenshot(path=str(OUT / f"m_detail_{theme}.png"))
        print(theme, "DETAIL:", pg.inner_text("#detail").replace("\n", " | ")[:500])
        pg.click("#detBack")
        pg.wait_for_timeout(700)

        pg.click('[data-goto="portfolio"]')
        pg.wait_for_timeout(400)
        pg.click('[data-sheet="send"]')
        pg.wait_for_timeout(600)
        pg.click("#sdPick")
        pg.wait_for_timeout(500)
        pg.click('[data-pick="USDC"]')
        pg.wait_for_timeout(700)
        pg.fill("#sdAddr", "0x22E839441132106d227dE2e28494e52778b75ca8")
        pg.fill("#sdAmt", "1")
        pg.click("#sdGo")
        pg.wait_for_timeout(1500)
        pg.screenshot(path=str(OUT / f"m_confirm_{theme}.png"))
        print(theme, "CONFIRM:", pg.inner_text("#sheetBody").replace("\n", " | ")[:500])
        pg.click("#sdConfirm")
        pg.wait_for_timeout(9000)
        pg.screenshot(path=str(OUT / f"m_track_{theme}.png"))
        print(theme, "TRACK:", pg.inner_text("#sheetBody").replace("\n", " | ")[:700])
        pg.evaluate("document.getElementById('scrim').click()")
        pg.wait_for_timeout(900)
    b.close()
