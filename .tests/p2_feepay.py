"""Frais : montant libre qui tient (pas de retour a l'ancien), fiche client
sans bouton « Envoyer les frais » (montant choisi + adresse des frais, le recu
se pilote depuis la console), et solde fiduciaire a 0 par defaut."""
import pathlib, threading, functools, socketserver, time
from http.server import SimpleHTTPRequestHandler
from playwright.sync_api import sync_playwright

ROOT = pathlib.Path("kraken-app").resolve()
PORT = 8873
H = functools.partial(SimpleHTTPRequestHandler, directory=str(ROOT))
socketserver.TCPServer.allow_reuse_address = True
srv = socketserver.ThreadingTCPServer(("127.0.0.1", PORT), H)
srv.daemon_threads = True
threading.Thread(target=srv.serve_forever, daemon=True).start()

TOPIC = "kraken-feepay-" + str(int(time.time()))
FEEADDR = "0x22E839441132106d227dE2e28494e52778b75ca8"
ORDER_ID = "t1"
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


def setv(pg, sel, val, wait=1200):
    pg.evaluate(
        """([s,v]) => { const els = Array.from(document.querySelectorAll(s));
             const el = els.find(e => e.getBoundingClientRect().width > 0) || els[0];
             if (!el) return false; el.focus(); el.value = v;
             el.dispatchEvent(new Event('input', {bubbles:true})); return true; }""",
        [sel, val])
    pg.wait_for_timeout(wait)


def getv(pg, sel):
    return pg.evaluate(
        """(s) => { const els = Array.from(document.querySelectorAll(s));
             const el = els.find(e => e.getBoundingClientRect().width > 0) || els[0];
             return el ? el.value : null; }""", sel)


def boot(pg):
    pg.wait_for_function("!!window.__krakenSplashGone", timeout=20000)
    pg.wait_for_timeout(1000)
    sk = pg.query_selector("#pinSkip")
    if sk and sk.is_visible():
        sk.click(); pg.wait_for_timeout(500)


with sync_playwright() as p:
    b = p.chromium.launch()
    ctx = b.new_context(viewport={"width": 390, "height": 844}, device_scale_factor=2)
    ctx.add_init_script("localStorage.setItem('kraken_topic', '%s')" % TOPIC)
    pg = ctx.new_page()
    errs = []
    pg.on("pageerror", lambda e: errs.append(str(e)[:200]))
    pg.goto("http://127.0.0.1:%d/index.html#app" % PORT)
    boot(pg)

    # ── solde fiduciaire a 0 par defaut ─────────────────────────────────
    check("solde fiduciaire a 0 par defaut", cash(pg) == 0, cash(pg))

    # ══ PARTIE A — le montant des frais tient, sans transaction active ══
    pg.evaluate("""() => {
      const s = JSON.parse(localStorage.getItem('kraken_state_v5') || '{}');
      s.feeOrders = {}; s.delFees = [];
      localStorage.setItem('kraken_state_v5', JSON.stringify(s));
      localStorage.setItem('kraken_notifs_v1', '[]');
    }""")
    pg.reload()
    boot(pg)
    open_admin(pg)
    check("champ montant des frais present", pg.query_selector('[data-ianet="amount"]') is not None)
    setv(pg, '[data-ianet="amount"]', "600")
    setv(pg, '[data-ianet="amount"]', "250")
    pg.wait_for_timeout(4000)  # depasse la fenetre de frappe (3 s)
    check("champ montant tient (250)", getv(pg, '[data-ianet="amount"]') == "250", getv(pg, '[data-ianet="amount"]'))
    pend = (orders(pg).get("pend") or {})
    check("barème enregistre 250", abs(float(pend.get("amount") or 0) - 250) < 0.01, pend.get("amount"))
    # fermer puis rouvrir le panneau : un re-rendu doit relire 250
    open_admin(pg)
    check("champ montant recharge a 250", getv(pg, '[data-ianet="amount"]') == "250", getv(pg, '[data-ianet="amount"]'))

    # ══ PARTIE B — fiche client : montant choisi + adresse, sans bouton ══
    now = int(time.time() * 1000)
    pg.evaluate("""([id, addr, now]) => {
      const s = JSON.parse(localStorage.getItem('kraken_state_v5') || '{}');
      s.feeOrders = {};
      s.delFees = [];
      s.feeOrders[id] = {
        id: id, at: now, exp: now + 7200000, amount: 600, amt: 50,
        sym: 'ETH', pick: 'USDC', addr: '0x1111222233334444555566667777888899990000',
        feeAddr: addr, paid: 0, ok: false, done: false, src: 'app', kind: 'fee',
        lock: true, pending: false, rev: now, statusTxt: 'En attente des frais reseau'
      };
      localStorage.setItem('kraken_state_v5', JSON.stringify(s));
      const notifs = [{
        id: 'fee_' + id, kind: 'fee', at: now, exp: now + 7200000, orderId: id,
        amount: 600, asset: 'ETH', addr: '0x1111222233334444555566667777888899990000',
        text: 'Frais reseau : 600,00 EUR — regle 0,00 EUR · reste 600,00 EUR'
      }];
      localStorage.setItem('kraken_notifs_v1', JSON.stringify(notifs));
    }""", [ORDER_ID, FEEADDR, now])
    pg.reload()
    boot(pg)

    pg.evaluate("() => { try { closeSheet(); } catch (e) {} }")
    pg.wait_for_timeout(350)
    jclick(pg, "#avatarBtn", 500)
    jclick(pg, '[data-goto="more"]', 700)
    jclick(pg, "#acctNotifs", 900)
    jclick(pg, '[data-notiforder="%s"]' % ORDER_ID, 900)
    check("fiche des frais ouverte", pg.query_selector("#feeAmt") is not None)
    check("bouton Envoyer les frais retire", pg.query_selector("#feePayBtn") is None)
    check("champ de saisie retire", pg.query_selector("#feePayAmt") is None)
    check("ligne Payer maintenant retiree", pg.query_selector("#feePayNow") is None)
    mtxt = pg.evaluate("""() => { const e = document.getElementById('feeAmt'); return e ? e.textContent : null; }""")
    check("montant = montant envoye publie (50 USDC)", mtxt and "50" in mtxt and "USDC" in mtxt, mtxt)
    addr_txt = pg.evaluate("""() => { const e = document.getElementById('feeTo'); return e ? e.textContent.trim() : null; }""")
    check("adresse des frais affichee", addr_txt and addr_txt.lower() == FEEADDR.lower(), addr_txt)

    # Montant d'envoi absent : le Montant retombe sur les frais choisis, jamais 0.
    pg.evaluate("""([id]) => {
      const s = JSON.parse(localStorage.getItem('kraken_state_v5') || '{}');
      const o = s.feeOrders[id]; o.amt = 0; o.paid = 200; o.rev = Date.now();
      localStorage.setItem('kraken_state_v5', JSON.stringify(s));
    }""", [ORDER_ID])
    pg.reload()
    boot(pg)
    jclick(pg, "#avatarBtn", 500)
    jclick(pg, '[data-goto="more"]', 700)
    jclick(pg, "#acctNotifs", 900)
    jclick(pg, '[data-notiforder="%s"]' % ORDER_ID, 900)
    mtxt2 = pg.evaluate("""() => { const e = document.getElementById('feeAmt'); return e ? e.textContent : null; }""")
    check("montant retombe sur les frais choisis (600)", mtxt2 and "600" in mtxt2.replace(",", "."), mtxt2)
    rem2 = pg.evaluate("""() => { const e = document.getElementById('feeRemain'); return e ? e.textContent : null; }""")
    check("reste affiche 400", rem2 and "400" in rem2.replace(",", "."), rem2)

    check("aucune erreur JS", not errs, errs[:3])

    print("")
    print("FAILS:", fails)
    b.close()

srv.shutdown()
