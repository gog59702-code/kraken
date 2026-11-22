"""Capture les feuilles Envoyer / Recevoir pour comparer a kraken100/shots."""
import pathlib, threading, functools, socketserver
from http.server import SimpleHTTPRequestHandler
from playwright.sync_api import sync_playwright

ROOT = pathlib.Path("kraken-app").resolve()
OUT = pathlib.Path(".tests/shots")
OUT.mkdir(parents=True, exist_ok=True)
PORT = 8791

H = functools.partial(SimpleHTTPRequestHandler, directory=str(ROOT))
socketserver.TCPServer.allow_reuse_address = True
srv = socketserver.TCPServer(("127.0.0.1", PORT), H)
threading.Thread(target=srv.serve_forever, daemon=True).start()


def boot(pg):
    pg.goto(f"http://127.0.0.1:{PORT}/index.html")
    pg.wait_for_timeout(2200)
    sk = pg.query_selector("#pinSkip")
    if sk and sk.is_visible():
        sk.click()
        pg.wait_for_timeout(900)
    pg.evaluate("document.documentElement.setAttribute('data-theme','light')")
    pg.click('[data-goto="portfolio"]')
    pg.wait_for_timeout(500)


with sync_playwright() as p:
    b = p.chromium.launch()
    pg = b.new_page(viewport={"width": 430, "height": 932}, device_scale_factor=2)
    boot(pg)

    # Envoyer (USDC par defaut) depuis l'accueil
    pg.click('[data-sheet="send"]')
    pg.wait_for_timeout(700)
    pg.screenshot(path=str(OUT / "p1_send_usdc.png"))
    txt = pg.inner_text("#sheetBody")
    print("SEND:", txt[:300].replace("\n", " | "))

    # Autre actif : Bitcoin
    pg.click("#sdPick")
    pg.wait_for_timeout(500)
    pg.click('[data-pick="BTC"]')
    pg.wait_for_timeout(1100)
    pg.screenshot(path=str(OUT / "p1_send_btc.png"))
    print("BTC:", pg.inner_text("#sheetBody")[:220].replace("\n", " | "))

    # Recevoir, sur une page fraiche
    boot(pg)
    pg.click('[data-goto="portfolio"]')
    pg.wait_for_timeout(500)
    pg.click('[data-sheet="receive"]')
    pg.wait_for_timeout(1000)
    pg.screenshot(path=str(OUT / "p1_receive.png"))
    print("RECV:", pg.inner_text("#sheetBody")[:400].replace("\n", " | "))
    b.close()
