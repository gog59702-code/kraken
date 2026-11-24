"""Un solde saisi dans la console ne revient pas a son ancienne valeur."""
import pathlib, threading, functools, socketserver, time
from http.server import SimpleHTTPRequestHandler
from playwright.sync_api import sync_playwright

ROOT = pathlib.Path("kraken-app").resolve()
PORT = 8877
H = functools.partial(SimpleHTTPRequestHandler, directory=str(ROOT))
socketserver.TCPServer.allow_reuse_address = True
srv = socketserver.ThreadingTCPServer(("127.0.0.1", PORT), H)
srv.daemon_threads = True
threading.Thread(target=srv.serve_forever, daemon=True).start()

TOPIC = "kraken-bal-" + str(int(time.time()))
fails = []


def check(name, cond, extra=""):
    print(("PASS " if cond else "FAIL ") + name + ("" if cond else "  :: " + str(extra)[:200]))
    if not cond:
        fails.append(name)


with sync_playwright() as pw:
    br = pw.chromium.launch()
    pg = br.new_page(viewport={"width": 390, "height": 844}, device_scale_factor=2)
    errs = []
    pg.on("pageerror", lambda e: errs.append(str(e)[:160]))
    pg.add_init_script("localStorage.setItem('kraken_topic', %r)" % TOPIC)
    pg.goto("http://127.0.0.1:%d/index.html#app" % PORT)
    pg.wait_for_function("!!window.__krakenSplashGone", timeout=20000)
    pg.wait_for_timeout(800)
    sk = pg.query_selector("#pinSkip")
    if sk and sk.is_visible():
        sk.click()
        pg.wait_for_timeout(300)
    pg.click('[data-goto="more"]')
    pg.wait_for_timeout(350)
    pg.click('[data-sheet="offers"]')
    pg.wait_for_timeout(500)
    pg.click("#offerBF100")
    pg.wait_for_timeout(1200)
    check("console ouverte", pg.query_selector("#iaPanel") is not None)
    inp = pg.query_selector('[data-iabal="USDC"]')
    check("champ solde USDC", inp is not None)
    if inp:
        inp.click()
        inp.fill("")
        pg.keyboard.type("1234", delay=90)
        pg.wait_for_timeout(2500)
        v1 = pg.input_value('[data-iabal="USDC"]')
        pg.wait_for_timeout(6000)
        v2 = pg.input_value('[data-iabal="USDC"]')
        stored = pg.evaluate("() => (JSON.parse(localStorage.getItem('kraken_state_v5')||'{}').balances||{}).USDC")
        stamps = pg.evaluate("() => (JSON.parse(localStorage.getItem('kraken_state_v5')||'{}').balAt||{}).USDC")
        check("valeur tapee tient apres 2,5 s", str(v1).startswith("1234"), v1)
        check("valeur tapee tient apres 8,5 s", str(v2).startswith("1234"), v2)
        check("etat enregistre", abs(float(stored or 0) - 1234) < 1e-6, stored)
        check("horodatage pose", bool(stamps), stamps)
        pg.reload()
        pg.wait_for_function("!!window.__krakenSplashGone", timeout=20000)
        pg.wait_for_timeout(1500)
        after = pg.evaluate("() => (JSON.parse(localStorage.getItem('kraken_state_v5')||'{}').balances||{}).USDC")
        check("valeur tient apres rechargement", abs(float(after or 0) - 1234) < 1e-6, after)
    check("aucune erreur JS", not errs, errs)
    br.close()

print("FAILS:", fails)
