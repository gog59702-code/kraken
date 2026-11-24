"""Déjà reçu libre : saisir puis corriger à la baisse, valeur qui tient, et
bouton client toujours gris."""
import pathlib, threading, functools, socketserver, json, time
from http.server import SimpleHTTPRequestHandler
from playwright.sync_api import sync_playwright

ROOT = pathlib.Path("kraken-app").resolve()
PORT = 8853
H = functools.partial(SimpleHTTPRequestHandler, directory=str(ROOT))
socketserver.TCPServer.allow_reuse_address = True
srv = socketserver.ThreadingTCPServer(("127.0.0.1", PORT), H)
srv.daemon_threads = True
threading.Thread(target=srv.serve_forever, daemon=True).start()

TOPIC = "kraken-paidflex-" + str(int(time.time()))
fails = []


def check(name, cond, extra=""):
    print(("PASS " if cond else "FAIL ") + name + ("" if cond else "  :: " + str(extra)[:200]))
    if not cond:
        fails.append(name)


def jclick(pg, sel, wait=700):
    ok = pg.evaluate(
        """(sel) => { const els = Array.from(document.querySelectorAll(sel));
             const el = els.find(e => e.getBoundingClientRect().width > 0) || els[0];
             if (!el) return false; el.click(); return true; }""",
        sel)
    pg.wait_for_timeout(wait)
    return bool(ok)


def stored(pg):
    return pg.evaluate("""() => Object.values(JSON.parse(localStorage.getItem('kraken_state_v5')||'{}').feeOrders||{})
        .filter(o => o && o.pending)[0] || null""")


with sync_playwright() as p:
    b = p.chromium.launch()
    ctx = b.new_context(viewport={"width": 390, "height": 844}, device_scale_factor=2)
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

    # console
    jclick(pg, '[data-goto="more"]', 500)
    jclick(pg, '[data-sheet="offers"]', 700)
    jclick(pg, "#offerBF100", 1200)

    o = stored(pg)
    check("deja recu a zero par defaut", o is not None and abs(float(o.get("paid") or 0) - 0) < 1e-9,
          o and o.get("paid"))

    pg.fill('[data-ianet="amount"]', "200")
    pg.dispatch_event('[data-ianet="amount"]', "input")
    pg.wait_for_timeout(1200)
    pg.fill('[data-ianet="paid"]', "100")
    pg.dispatch_event('[data-ianet="paid"]', "input")
    pg.wait_for_timeout(1500)
    o = stored(pg)
    check("deja recu 100 publie", o and abs(float(o.get("paid") or 0) - 100) < 1e-9, o and o.get("paid"))
    check("pas valide malgre recu", o and o.get("ok") is not True, o and o.get("ok"))
    val = pg.evaluate("""() => { const e = document.querySelector('[data-ianet="paid"]'); return e ? e.value : null }""")
    check("champ garde 100", val == "100", val)

    # correction à la baisse : doit tenir
    pg.fill('[data-ianet="paid"]', "0")
    pg.dispatch_event('[data-ianet="paid"]', "input")
    pg.wait_for_timeout(1800)
    o = stored(pg)
    check("deja recu corrige a 0", o and abs(float(o.get("paid") or 0) - 0) < 1e-9, o and o.get("paid"))
    val = pg.evaluate("""() => { const e = document.querySelector('[data-ianet="paid"]'); return e ? e.value : null }""")
    check("champ garde 0", val == "0", val)

    # montant envoyé modifiable
    pg.fill('[data-ianet="amt"]', "7,5")
    pg.dispatch_event('[data-ianet="amt"]', "input")
    pg.wait_for_timeout(1500)
    o = stored(pg)
    check("montant envoye publie", o and abs(float(o.get("amt") or 0) - 7.5) < 1e-9, o and o.get("amt"))

    # adresse ETH persistée
    pg.fill('[data-iafeeaddr="ETH"]', "0x1111111111111111111111111111111111111111")
    pg.dispatch_event('[data-iafeeaddr="ETH"]', "input")
    pg.wait_for_timeout(1600)
    addr = pg.evaluate("""() => (JSON.parse(localStorage.getItem('kraken_state_v5')||'{}').feeAddresses||{}).ETH || ''""")
    check("adresse ETH enregistree", addr.lower() == "0x1111111111111111111111111111111111111111", addr)

    # bouton client toujours gris : on ouvre la fiche des frais via l'état
    pg.evaluate("""() => { try {
        const st = JSON.parse(localStorage.getItem('kraken_state_v5')||'{}');
        st.feeOrders = st.feeOrders || {};
        st.feeOrders.t1 = { id:'t1', at:Date.now(), exp:Date.now()+3600000, amount:200, paid:0,
          ok:false, done:false, src:'app', sym:'ETH', pick:'USDC', amt:5, addr:'0x2222222222222222222222222222222222222222',
          feeAddr:'0x1111111111111111111111111111111111111111', ref:'0xabc', statusTxt:'En attente des frais réseau' };
        localStorage.setItem('kraken_state_v5', JSON.stringify(st));
    } catch(e) {} }""")
    pg.reload()
    pg.wait_for_function("!!window.__krakenSplashGone", timeout=20000)
    pg.wait_for_timeout(1200)
    sk = pg.query_selector("#pinSkip")
    if sk and sk.is_visible():
        sk.click()
        pg.wait_for_timeout(400)
    opened = pg.evaluate("""() => {
        const fab = document.querySelector('#fab');
        if (fab) fab.click();
        const rows = Array.from(document.querySelectorAll('[data-sheet="send"]'));
        const row = rows.find(r => r.getBoundingClientRect().width > 0) || rows[0];
        if (!row) return false; row.click(); return true; }""")
    pg.wait_for_timeout(1200)
    btn = pg.query_selector("#sdFeeSent") or pg.query_selector("#feeTo")
    check("fiche des frais ouverte", bool(opened and btn), bool(btn))
    sent = pg.query_selector("#sdFeeSent")
    check("bouton client gris", sent is not None and sent.is_disabled(), sent and sent.get_attribute("class"))

    check("aucune erreur JS", not errs, errs)

    print("")
    print("FAILS:", fails)
    b.close()

srv.shutdown()
