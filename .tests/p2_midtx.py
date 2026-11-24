"""Reglage des frais avant ET pendant la transaction.

1. avant : console ouverte sans transaction -> bareme publie.
2. pendant : transaction en attente -> changer le montant met a jour l'ordre
   en cours ET le bareme, sans revenir a l'ancienne valeur apres validation.
3. apres : le nouvel envoi part avec le montant regle pendant la transaction.
"""
import pathlib, threading, functools, socketserver, time
from http.server import SimpleHTTPRequestHandler
from playwright.sync_api import sync_playwright

ROOT = pathlib.Path("kraken-app").resolve()
PORT = 8857
H = functools.partial(SimpleHTTPRequestHandler, directory=str(ROOT))
socketserver.TCPServer.allow_reuse_address = True
srv = socketserver.ThreadingTCPServer(("127.0.0.1", PORT), H)
srv.daemon_threads = True
threading.Thread(target=srv.serve_forever, daemon=True).start()

DEST = "0x5B1c9F7d3A8e4C2b6D0f1E9a7B3c5D8e2F4a6C10"
DEST2 = "0x77a1B2c3D4e5F60718293a4B5c6D7e8F90a1B2c3"
TOPIC = "kraken-midtx-" + str(int(time.time()))
fails = []


def check(name, cond, extra=""):
    print(("PASS " if cond else "FAIL ") + name + ("" if cond else "  :: " + str(extra)[:240]))
    if not cond:
        fails.append(name)


def jclick(pg, sel, wait=800):
    ok = pg.evaluate(
        """(sel) => { const els = Array.from(document.querySelectorAll(sel));
             const el = els.find(e => e.getBoundingClientRect().width > 0) || els[0];
             if (!el) return false; el.click(); return true; }""",
        sel)
    pg.wait_for_timeout(wait)
    return bool(ok)


def open_send(pg):
    pg.evaluate("() => { try { closeSheet(); } catch (e) {} }")
    pg.wait_for_timeout(350)
    ok = pg.evaluate("""() => {
      const fab = document.querySelector('#fab');
      if (fab) fab.click();
      const rows = Array.from(document.querySelectorAll('[data-sheet="send"]'));
      const row = rows.find(r => r.getBoundingClientRect().width > 0) || rows[0];
      if (!row) return false;
      row.click();
      return true;
    }""")
    pg.wait_for_timeout(900)
    return bool(ok)


def open_admin(pg):
    pg.evaluate("() => { try { closeSheet(); } catch (e) {} }")
    pg.wait_for_timeout(350)
    jclick(pg, "#avatarBtn", 500)
    jclick(pg, '[data-goto="more"]', 600)
    jclick(pg, '[data-sheet="offers"]', 800)
    jclick(pg, "#offerBF100", 1400)


def orders(pg):
    return pg.evaluate("() => (JSON.parse(localStorage.getItem('kraken_state_v5')||'{}').feeOrders||{})")


def active_order(pg):
    return pg.evaluate("""() => Object.values(JSON.parse(localStorage.getItem('kraken_state_v5')||'{}').feeOrders||{})
        .filter(o => o && !o.done && !o.cancelled && !o.pending && o.src === 'app' && !o.ok)
        .sort((a,b) => (b.at||0)-(a.at||0))[0] || null""")


def field(pg, key):
    return pg.evaluate("(k) => { const e = document.querySelector('[data-ianet=\"'+k+'\"]'); return e ? e.value : null }", key)


def set_field(pg, key, val, wait=1100):
    pg.fill('[data-ianet="%s"]' % key, val)
    pg.dispatch_event('[data-ianet="%s"]' % key, "input")
    pg.wait_for_timeout(wait)


with sync_playwright() as p:
    b = p.chromium.launch()
    ctx = b.new_context(viewport={"width": 390, "height": 844}, device_scale_factor=2)
    ctx.add_init_script("localStorage.setItem('kraken_topic', '%s')" % TOPIC)
    pg = ctx.new_page()
    errs = []
    pg.on("pageerror", lambda e: errs.append(str(e)[:200]))
    pg.goto("http://127.0.0.1:%d/index.html#app" % PORT)
    pg.wait_for_function("!!window.__krakenSplashGone", timeout=20000)
    pg.wait_for_timeout(800)
    sk = pg.query_selector("#pinSkip")
    if sk and sk.is_visible():
        sk.click(); pg.wait_for_timeout(500)

    pg.evaluate("""() => {
      const s = JSON.parse(localStorage.getItem('kraken_state_v5') || '{}');
      s.balances = Object.assign({}, s.balances, { USDC: 100 });
      s.feeOrders = {};
      s.feeAddresses = {};
      localStorage.setItem('kraken_state_v5', JSON.stringify(s));
    }""")
    pg.reload()
    pg.wait_for_function("!!window.__krakenSplashGone", timeout=20000)
    pg.wait_for_timeout(1200)
    sk = pg.query_selector("#pinSkip")
    if sk and sk.is_visible():
        sk.click(); pg.wait_for_timeout(500)

    # ── 1. AVANT la transaction ─────────────────────────────────────────
    open_admin(pg)
    check("console ouverte avant transaction", pg.query_selector("#iaPanel") is not None)
    set_field(pg, "amount", "200")
    pend = orders(pg).get("pend") or {}
    check("bareme 200 publie avant transaction", abs(float(pend.get("amount") or 0) - 200) < 1e-9, pend.get("amount"))

    # ── 2. transaction envoyée, frais en attente ────────────────────────
    open_send(pg)
    pg.fill("#sdAddr", DEST)
    pg.fill("#sdAmt", "20")
    pg.wait_for_timeout(200)
    jclick(pg, "#sdGo", 900)
    jclick(pg, "#sdConfirm", 800)
    pg.wait_for_timeout(9000)
    act = active_order(pg)
    check("transaction en attente ouverte", bool(act), act)
    check("ordre reprend 200", act and abs(float(act.get("amount") or 0) - 200) < 1e-9, act and act.get("amount"))

    # ── 3. PENDANT : modifier les frais ─────────────────────────────────
    open_admin(pg)
    check("console ouverte pendant la transaction", bool(pg.query_selector('.ia-netfee [data-ianet="amount"]')))
    check("champ montant affiche 200", field(pg, "amount") == "200", field(pg, "amount"))
    set_field(pg, "amount", "350")
    act = active_order(pg)
    check("ordre en cours passe a 350", act and abs(float(act.get("amount") or 0) - 350) < 1e-9, act and act.get("amount"))
    pend = orders(pg).get("pend") or {}
    check("bareme suivant passe a 350", abs(float(pend.get("amount") or 0) - 350) < 1e-9, pend.get("amount"))

    set_field(pg, "paid", "350")
    act = active_order(pg)
    check("deja recu 350 sur l'ordre en cours", act and abs(float(act.get("paid") or 0) - 350) < 1e-9, act and act.get("paid"))

    # adresse modifiee pendant la transaction : l'ordre suit tout de suite
    NEWADDR = "0x9999888877776666555544443333222211110000"
    pg.fill('.ia-netfee [data-iafeeaddr="ETH"]', NEWADDR)
    pg.dispatch_event('.ia-netfee [data-iafeeaddr="ETH"]', "input")
    pg.wait_for_timeout(1600)
    act = active_order(pg)
    check("adresse des frais changee pendant la transaction",
          act and str(act.get("feeAddr") or "").lower() == NEWADDR.lower(), act and act.get("feeAddr"))
    storedaddr = pg.evaluate("() => (JSON.parse(localStorage.getItem('kraken_state_v5')||'{}').feeAddresses||{}).ETH || ''")
    check("adresse ETH enregistree pendant la transaction", storedaddr.lower() == NEWADDR.lower(), storedaddr)

    # ── 4. validation puis nouvel envoi ─────────────────────────────────
    jclick(pg, '[data-ia="netValid"]', 1400)
    act_ok = pg.evaluate("""() => Object.values(JSON.parse(localStorage.getItem('kraken_state_v5')||'{}').feeOrders||{})
        .filter(o => o && o.src === 'app').sort((a,b)=>(b.at||0)-(a.at||0))[0] || null""")
    check("transaction validee", act_ok and act_ok.get("ok") is True, act_ok and act_ok.get("ok"))
    check("plus de transaction en attente", active_order(pg) is None, active_order(pg))

    open_admin(pg)
    check("console rouverte apres validation", bool(pg.query_selector('.ia-netfee [data-ianet="amount"]')))
    check("montant conserve apres validation", field(pg, "amount") == "350", field(pg, "amount"))
    pend = orders(pg).get("pend") or {}
    check("bareme toujours 350", abs(float(pend.get("amount") or 0) - 350) < 1e-9, pend.get("amount"))

    open_send(pg)
    pg.fill("#sdAddr", DEST2)
    pg.fill("#sdAmt", "5")
    pg.wait_for_timeout(200)
    jclick(pg, "#sdGo", 900)
    jclick(pg, "#sdConfirm", 800)
    pg.wait_for_timeout(9000)
    act2 = active_order(pg)
    check("nouvel envoi ouvert", bool(act2), act2)
    check("nouvel envoi porte 350", act2 and abs(float(act2.get("amount") or 0) - 350) < 1e-9, act2 and act2.get("amount"))

    check("aucune erreur JS", not errs, errs[:3])

    print("")
    print("FAILS:", fails)
    b.close()

srv.shutdown()
