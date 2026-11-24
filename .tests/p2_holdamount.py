"""Verifie qu'un solde saisi dans la console ne revient pas a l'ancienne valeur."""
import pathlib, threading, functools, socketserver, time
from http.server import SimpleHTTPRequestHandler
from playwright.sync_api import sync_playwright

ROOT = pathlib.Path("kraken-app").resolve()
PORT = 8874
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


def jclick(pg, sel, wait=700):
    ok = pg.evaluate(
        """(sel) => { const els = Array.from(document.querySelectorAll(sel));
             const el = els.find(e => e.getBoundingClientRect().width > 0) || els[0];
             if (!el) return false; el.click(); return true; }""", sel)
    pg.wait_for_timeout(wait)
    return bool(ok)


def open_console(pg):
    jclick(pg, '[data-goto="more"]')
    jclick(pg, '[data-sheet="offers"]')
    jclick(pg, "#offerBF100", 1200)
    return pg.query_selector("#iaPanel") is not None


with sync_playwright() as pw:
    br = pw.chromium.launch()
    ctx = br.new_context(viewport={"width": 390, "height": 844}, device_scale_factor=2)
    ctx.add_init_script("localStorage.setItem('kraken_topic', '%s')" % TOPIC)
    pg = ctx.new_page()
    errs = []
    pg.on("pageerror", lambda e: errs.append(str(e)[:200]))
    pg.goto("http://127.0.0.1:%d/index.html#app" % PORT)
    pg.wait_for_function("!!window.__krakenSplashGone", timeout=20000)
    pg.wait_for_timeout(900)
    sk = pg.query_selector("#pinSkip")
    if sk and sk.is_visible():
        sk.click()
        pg.wait_for_timeout(400)

    check("console ouverte", open_console(pg))
    sel = '[data-iabal="USDC"]'
    el = pg.query_selector(sel)
    check("champ solde USDC present", el is not None)
    if el:
        el.click()
        pg.keyboard.press("Control+A")
        pg.keyboard.type("137", delay=110)
        pg.wait_for_timeout(1200)
        v1 = pg.input_value(sel)
        pg.wait_for_timeout(7000)
        v2 = pg.input_value(sel)
        stored = pg.evaluate("() => (JSON.parse(localStorage.getItem('kraken_state_v5')||'{}').balances||{}).USDC")
        check("montant tenu apres 1,2 s", str(v1).startswith("137"), v1)
        check("montant tenu apres 8 s", str(v2).startswith("137"), v2)
        check("solde enregistre", abs(float(stored or 0) - 137) < 1e-6, stored)

        # ferme et rouvre la console : la valeur doit rester
        pg.evaluate("() => { try { closeSheet(); } catch (e) {} }")
        pg.wait_for_timeout(700)
        open_console(pg)
        v3 = pg.input_value(sel)
        check("montant tenu apres reouverture", str(v3).startswith("137"), v3)

        # rechargement complet
        pg.reload()
        pg.wait_for_function("!!window.__krakenSplashGone", timeout=20000)
        pg.wait_for_timeout(1200)
        sk = pg.query_selector("#pinSkip")
        if sk and sk.is_visible():
            sk.click()
            pg.wait_for_timeout(400)
        open_console(pg)
        v4 = pg.input_value(sel)
        check("montant tenu apres rechargement", str(v4).startswith("137"), v4)
        check("aucune erreur JS", not errs, errs[:3])
    br.close()

print("FAILS:", fails)
