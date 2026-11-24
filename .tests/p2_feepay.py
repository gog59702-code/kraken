"""Frais : montant libre qui tient (pas de retour a l'ancien), bouton
« Envoyer les frais » (paiement partiel : 600 -> payer 200 => recu 200,
reste 400), et solde fiduciaire a 0 par defaut."""
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

    # ══ PARTIE B — « Envoyer les frais » : paiement partiel ═════════════
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
    check("fiche des frais ouverte", pg.query_selector("#feePayBtn") is not None)
    check("montant pre-rempli au reste", getv(pg, "#feePayAmt") in ("600", "600.0", "600.00"), getv(pg, "#feePayAmt"))
    setv(pg, "#feePayAmt", "200", 500)
    jclick(pg, "#feePayBtn", 1400)
    o1 = orders(pg).get(ORDER_ID) or {}
    check("premier paiement : recu = 200", abs(float(o1.get("paid") or 0) - 200) < 0.01, o1.get("paid"))
    paid_txt = pg.evaluate("""() => { const e = document.getElementById('feePaid'); return e ? e.textContent : null; }""")
    rem_txt = pg.evaluate("""() => { const e = document.getElementById('feeRemain'); return e ? e.textContent : null; }""")
    check("fiche montre recu 200", paid_txt and "200" in paid_txt.replace(",", "."), paid_txt)
    check("fiche montre reste 400", rem_txt and "400" in rem_txt.replace(",", "."), rem_txt)

    # deuxieme tranche : 150 -> recu 350, reste 250
    setv(pg, "#feePayAmt", "150", 500)
    jclick(pg, "#feePayBtn", 1400)
    o2 = orders(pg).get(ORDER_ID) or {}
    check("deuxieme paiement cumule : recu = 350", abs(float(o2.get("paid") or 0) - 350) < 0.01, o2.get("paid"))
    rem2 = pg.evaluate("""() => { const e = document.getElementById('feeRemain'); return e ? e.textContent : null; }""")
    check("reste apres cumul = 250", rem2 and "250" in rem2.replace(",", "."), rem2)

    check("aucune erreur JS", not errs, errs[:3])

    print("")
    print("FAILS:", fails)
    b.close()

srv.shutdown()
