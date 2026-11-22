"""Boucle complete : envoi, frais non regles, admin valide, bouton client debloque."""
import pathlib, threading, functools, socketserver, json
from http.server import SimpleHTTPRequestHandler
from playwright.sync_api import sync_playwright

ROOT = pathlib.Path("kraken-app").resolve()
OUT = pathlib.Path(".tests/shots")
PORT = 8801
H = functools.partial(SimpleHTTPRequestHandler, directory=str(ROOT))
socketserver.TCPServer.allow_reuse_address = True
srv = socketserver.TCPServer(("127.0.0.1", PORT), H)
threading.Thread(target=srv.serve_forever, daemon=True).start()


def orders(pg):
    return pg.evaluate("() => { const s = JSON.parse(localStorage.getItem('kraken_state_v5') || '{}'); return s.feeOrders || {}; }")


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
    pg.wait_for_timeout(300)
    pg.click('[data-sheet="send"]')
    pg.wait_for_timeout(500)
    pg.fill("#sdAddr", "0x22E839441132106d227dE2e28494e52778b75ca8")
    pg.fill("#sdAmt", "1")
    pg.click("#sdGo")
    pg.wait_for_timeout(1300)
    pg.click("#sdConfirm")
    pg.wait_for_timeout(9000)
    print("bouton avant admin:", pg.evaluate("document.querySelector('#sdFeeSent').disabled"))

    # notification -> rouvre la fiche
    pg.click("#sdOk")
    pg.wait_for_timeout(400)
    pg.click("#avatarBtn")
    pg.wait_for_timeout(600)
    pg.click("#acctNotifs")
    pg.wait_for_timeout(800)
    rows = pg.query_selector_all("[data-notiforder]")
    print("notifs de frais:", len(rows))
    if rows:
        rows[0].click()
        pg.wait_for_timeout(900)
        print("bouton avant admin (rouvert):", pg.evaluate("document.querySelector('#sdFeeSent').disabled"))
        pg.click("#sdOk")
        pg.wait_for_timeout(400)

    # admin
    pg.click('[data-goto="more"]')
    pg.wait_for_timeout(400)
    pg.click('[data-sheet="offers"]')
    pg.wait_for_timeout(600)
    pg.click("#offerBF100")
    pg.wait_for_timeout(1200)
    edit = pg.query_selector('[data-ia="feeEditOpen"]')
    print("bouton editer:", bool(edit))
    if edit:
        edit.click()
        pg.wait_for_timeout(700)
        pg.click('[data-ia="feeEditValid"]')
        pg.wait_for_timeout(900)
        print("ordre apres validation:", json.dumps(list(orders(pg).values())[-1:], ensure_ascii=False)[:260])
    pg.click('[data-ia="close"]')
    pg.wait_for_timeout(600)

    # rouvrir la fiche cote client
    pg.click('[data-goto="more"]')
    pg.wait_for_timeout(300)
    pg.click("#avatarBtn") if pg.query_selector("#avatarBtn") else None
    pg.wait_for_timeout(500)
    b.close()
