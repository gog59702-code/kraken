"""v9.75 : la fiche des frais apparaît APRÈS le délai de traitement (envoi),
et le retrait suit le même rythme (délai, puis fiche des frais si un
règlement est en attente ; sinon le retrait s'exécute)."""
import pathlib, threading, functools, socketserver, time
from http.server import SimpleHTTPRequestHandler
from playwright.sync_api import sync_playwright

ROOT = pathlib.Path("kraken-app").resolve()
PORT = 8875
H = functools.partial(SimpleHTTPRequestHandler, directory=str(ROOT))
socketserver.TCPServer.allow_reuse_address = True
srv = socketserver.ThreadingTCPServer(("127.0.0.1", PORT), H)
srv.daemon_threads = True
threading.Thread(target=srv.serve_forever, daemon=True).start()

TOPIC = "kraken-flow-" + str(int(time.time()))
FAILS = []


def ck(name, cond, extra=""):
    print(("PASS " if cond else "FAIL ") + name + ((" :: " + str(extra)) if extra else ""))
    if not cond:
        FAILS.append(name)


DEST = "0x2222222222222222222222222222222222222222"
BTCADDR = "bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdq"


def boot(pg):
    pg.wait_for_function("!!window.__krakenSplashGone", timeout=20000)
    pg.wait_for_timeout(1200)
    sk = pg.query_selector("#pinSkip")
    if sk and sk.is_visible():
        sk.click()
        pg.wait_for_timeout(400)


def open_sheet(pg, name, wait=700):
    pg.evaluate("(n) => document.querySelector('#fab').click()", name)
    pg.wait_for_timeout(400)
    pg.evaluate("""(n) => { const rows=Array.from(document.querySelectorAll('[data-sheet="'+n+'"]'));
        const r=rows.find(x=>x.getBoundingClientRect().width>0)||rows[0];
        if(r) r.click(); }""", name)
    pg.wait_for_timeout(wait)


def balances(pg):
    return pg.evaluate("() => JSON.parse(localStorage.getItem('kraken_state_v5')||'{}').balances || {}")


with sync_playwright() as p:
    b = p.chromium.launch()
    ctx = b.new_context(viewport={"width": 390, "height": 844}, device_scale_factor=2)
    ctx.add_init_script("localStorage.setItem('kraken_topic','%s')" % TOPIC)
    pg = ctx.new_page()
    errs = []
    pg.on("pageerror", lambda e: errs.append(str(e)[:200]))
    pg.goto("http://127.0.0.1:%d/index.html#app" % PORT)
    boot(pg)
    pg.evaluate("""() => { const s=JSON.parse(localStorage.getItem('kraken_state_v5')||'{}');
        s.balances={BTC:1, USDC:45, ETH:2}; s.cash=0; s.feeOrders={}; s.feeAddresses={};
        localStorage.setItem('kraken_state_v5', JSON.stringify(s)); }""")
    pg.reload()
    boot(pg)

    # ── A) retrait sans frais : délai de traitement, puis fermeture ──────
    open_sheet(pg, "withdraw")
    ck("formulaire de retrait ouvert", pg.query_selector("#wdAmt") is not None)
    pg.fill("#wdAmt", "0.1")
    pg.fill("#wdAddr", BTCADDR)
    pg.wait_for_timeout(200)
    pg.evaluate("() => document.querySelector('#wdGo').click()")
    pg.wait_for_timeout(300)
    _open = pg.evaluate("() => document.querySelector('#sheet').classList.contains('on')")
    ck("retrait en traitement (feuille encore ouverte)", _open)
    pg.wait_for_timeout(1000)
    _open = pg.evaluate("() => document.querySelector('#sheet').classList.contains('on')")
    ck("retrait sans frais termine apres le delai", not _open)

    # ── B) envoi : la fiche des frais apparaît APRES le délai ────────────
    pg.reload()
    boot(pg)
    open_sheet(pg, "send")
    pg.fill("#sdAddr", DEST)
    pg.fill("#sdAmt", "20")
    pg.wait_for_timeout(200)
    pg.evaluate("() => document.querySelector('#sdGo').click()")
    pg.wait_for_timeout(900)
    ck("ecran de confirmation present", pg.query_selector("#sdConfirm") is not None)
    pg.evaluate("() => document.querySelector('#sdConfirm').click()")
    pg.wait_for_timeout(900)
    ck("fiche des frais pas encore la (délai en cours)", pg.query_selector("#feeTo") is None)
    pg.wait_for_timeout(8500)
    ck("fiche des frais presente apres le delai", pg.query_selector("#feeTo") is not None)
    act = pg.evaluate("""() => Object.values(JSON.parse(localStorage.getItem('kraken_state_v5')||'{}').feeOrders||{})
        .filter(o => o && !o.done && !o.cancelled && !o.pending && o.src === 'app' && !o.ok).length""")
    ck("ordre de frais cree", act >= 1, act)

    # ── C) retrait avec frais en attente : fiche des frais, solde intact ─
    before = balances(pg)
    pg.reload()
    boot(pg)
    open_sheet(pg, "withdraw")
    ck("formulaire de retrait rouvert", pg.query_selector("#wdAmt") is not None)
    pg.fill("#wdAmt", "0.1")
    pg.fill("#wdAddr", BTCADDR)
    pg.wait_for_timeout(200)
    pg.evaluate("() => document.querySelector('#wdGo').click()")
    pg.wait_for_timeout(1300)
    ck("retrait bloque : fiche des frais ouverte", pg.query_selector("#feeTo") is not None)
    after = balances(pg)
    ck("retrait bloque : solde inchange", abs(float(after.get("BTC", 0)) - float(before.get("BTC", 0))) < 1e-9,
       {"before": before.get("BTC"), "after": after.get("BTC")})

    ck("aucune erreur JS", len(errs) == 0, errs[:3])
    b.close()
srv.shutdown()
print("FAILS:", FAILS)
