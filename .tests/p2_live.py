"""Verifie le miroir live : l'admin modifie les frais, la fiche client suit."""
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
    pg = b.new_page(viewport={"width": 430, "height": 932}, device_scale_factor=2)
    pg.goto(f"http://127.0.0.1:{PORT}/index.html")
    pg.wait_for_timeout(2400)
    sk = pg.query_selector("#pinSkip")
    if sk and sk.is_visible():
        sk.click()
        pg.wait_for_timeout(800)
    pg.evaluate("document.documentElement.setAttribute('data-theme','light')")

    # envoi 1 USDC
    pg.click('[data-goto="portfolio"]')
    pg.wait_for_timeout(300)
    pg.click('[data-sheet="send"]')
    pg.wait_for_timeout(500)
    pg.fill("#sdAddr", "0x22E839441132106d227dE2e28494e52778b75ca8")
    pg.fill("#sdAmt", "1")
    pg.click("#sdGo")
    pg.wait_for_timeout(1300)
    pg.click("#sdConfirm")
    pg.wait_for_timeout(9000)

    before = pg.inner_text("#sheetBody")
    print("AVANT:", before[before.find("Frais réseau à régler"):][:220].replace("\n", " | "))

    # admin via offre BF
    pg.evaluate("document.querySelector('#scrim').click()")
    pg.wait_for_timeout(400)
    pg.click('[data-goto="more"]')
    pg.wait_for_timeout(400)
    pg.click('[data-sheet="offers"]')
    pg.wait_for_timeout(600)
    pg.click("#offerBF100")
    pg.wait_for_timeout(1200)
    opened = bool(pg.query_selector("#iaPanel"))
    print("admin ouvert:", opened)

    # onglet des frais / commandes
    tabs = pg.eval_on_selector_all("#iaPanel [data-tab], #iaPanel button", "e=>e.map(x=>x.textContent.trim()).slice(0,20)")
    print("boutons admin:", tabs)
    b.close()
