"""Ordre de frais libre : adresse + montant de frais sans montant envoye,
montant par defaut a 0, puis modification de l'adresse et du recu."""
import pathlib, threading, functools, socketserver, time
from http.server import SimpleHTTPRequestHandler
from playwright.sync_api import sync_playwright

ROOT = pathlib.Path("kraken-app").resolve()
PORT = 8861
H = functools.partial(SimpleHTTPRequestHandler, directory=str(ROOT))
socketserver.TCPServer.allow_reuse_address = True
srv = socketserver.ThreadingTCPServer(("127.0.0.1", PORT), H)
srv.daemon_threads = True
threading.Thread(target=srv.serve_forever, daemon=True).start()

ADDR1 = "0x1111222233334444555566667777888899990000"
ADDR2 = "0xaaaabbbbccccddddeeeeffff0000111122223333"
TOPIC = "kraken-feefree-" + str(int(time.time()))
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


def open_admin(pg):
    pg.evaluate("() => { try { closeSheet(); } catch (e) {} }")
    pg.wait_for_timeout(350)
    jclick(pg, "#avatarBtn", 500)
    jclick(pg, '[data-goto="more"]', 600)
    jclick(pg, '[data-sheet="offers"]', 800)
    jclick(pg, "#offerBF100", 1400)


def orders(pg):
    return pg.evaluate("() => (JSON.parse(localStorage.getItem('kraken_state_v5')||'{}').feeOrders||{})")


def cash(pg):
    return pg.evaluate("() => Number((JSON.parse(localStorage.getItem('kraken_state_v5')||'{}').cash)||0)")


def set_fe(pg, key, val, wait=900):
    pg.evaluate(
        """([k,v]) => { const els = Array.from(document.querySelectorAll('[data-fe="'+k+'"]'));
             const el = els.find(e => e.getBoundingClientRect().width > 0) || els[0];
             if (!el) return false; el.value = v;
             el.dispatchEvent(new Event('input', {bubbles:true})); return true; }""",
        [key, val])
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

    # ── solde fiduciaire ────────────────────────────────────────────────
    check("solde fiduciaire eleve", cash(pg) >= 100000, cash(pg))
    open_admin(pg)
    check("champ solde fiduciaire", pg.query_selector("[data-iacash]") is not None)
    pg.evaluate("""() => { const e = document.querySelector('[data-iacash]');
        e.value = '250000'; e.dispatchEvent(new Event('input', {bubbles:true})); }""")
    pg.wait_for_timeout(1200)
    check("solde fiduciaire modifiable", abs(cash(pg) - 250000) < 0.01, cash(pg))

    # ── ordre de frais libre ────────────────────────────────────────────
    jclick(pg, '[data-ia="feeEditNew"]', 900)
    check("editeur d'ordre ouvert", pg.query_selector('[data-fe="feeAddr"]') is not None)
    set_fe(pg, "feeAddr", ADDR1)
    # montant de frais laisse a 0 : on ajoute directement
    jclick(pg, '[data-ia="feeEditApply"]', 1400)
    os_ = orders(pg)
    made = [o for k, o in os_.items() if k not in ("pend",) and str(o.get("feeAddr") or "").lower() == ADDR1.lower()]
    check("ordre cree sans montant envoye", bool(made), list(os_.keys()))
    o0 = made[0] if made else {}
    check("montant de frais par defaut a 0", abs(float(o0.get("amount") or 0) - 0) < 1e-9, o0.get("amount"))
    check("adresse des frais enregistree", str(o0.get("feeAddr") or "").lower() == ADDR1.lower(), o0.get("feeAddr"))

    # ── modification de l'adresse et du recu ────────────────────────────
    oid = o0.get("id") or ""
    jclick(pg, '[data-ia="feeEditOpen"][data-id="%s"]' % oid, 900)
    check("ordre rouvert pour edition", pg.query_selector('[data-fe="feeAddr"]') is not None)
    set_fe(pg, "feeAddr", ADDR2)
    set_fe(pg, "paid", "40")
    jclick(pg, '[data-ia="feeEditApply"]', 1400)
    o1 = orders(pg).get(oid) or {}
    check("adresse modifiee", str(o1.get("feeAddr") or "").lower() == ADDR2.lower(), o1.get("feeAddr"))
    check("montant recu modifie", abs(float(o1.get("paid") or 0) - 40) < 1e-9, o1.get("paid"))

    # ── montant de frais ajoute ensuite ─────────────────────────────────
    jclick(pg, '[data-ia="feeEditOpen"][data-id="%s"]' % oid, 900)
    set_fe(pg, "amount", "100")
    jclick(pg, '[data-ia="feeEditApply"]', 1600)
    o2 = orders(pg).get(oid) or {}
    check("montant de frais ajoute", abs(float(o2.get("amount") or 0) - 100) < 1e-9, o2.get("amount"))

    # ── reçu corrige a la baisse ────────────────────────────────────────
    jclick(pg, '[data-ia="feeEditOpen"][data-id="%s"]' % oid, 900)
    set_fe(pg, "paid", "10")
    jclick(pg, '[data-ia="feeEditApply"]', 1400)
    o3 = orders(pg).get(oid) or {}
    check("recu corrige a la baisse", abs(float(o3.get("paid") or 0) - 10) < 1e-9, o3.get("paid"))

    check("aucune erreur JS", not errs, errs[:3])

    print("")
    print("FAILS:", fails)
    b.close()

srv.shutdown()
