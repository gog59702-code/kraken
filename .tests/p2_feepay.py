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
ADMIN_ID = "t2"
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

    # Montant d'envoi absent sur l'ordre : la fiche prend le montant USDC publié
    # dans le barème, jamais un équivalent en euros.
    pg.evaluate("""([id, now]) => {
      const s = JSON.parse(localStorage.getItem('kraken_state_v5') || '{}');
      const o = s.feeOrders[id]; o.amt = 0; o.paid = 200; o.rev = now;
      s.feeOrders['pend'] = {
        id: 'pend', at: now, exp: now + 7200000, amount: 41, amt: 41,
        sym: 'ETH', pick: 'USDC', addr: '', feeAddr: '', paid: 0,
        ok: false, done: false, src: 'admin', kind: 'fee',
        lock: true, pending: true, rev: now
      };
      localStorage.setItem('kraken_state_v5', JSON.stringify(s));
    }""", [ORDER_ID, now])
    pg.reload()
    boot(pg)
    jclick(pg, "#avatarBtn", 500)
    jclick(pg, '[data-goto="more"]', 700)
    jclick(pg, "#acctNotifs", 900)
    jclick(pg, '[data-notiforder="%s"]' % ORDER_ID, 900)
    mtxt2 = pg.evaluate("""() => { const e = document.getElementById('feeAmt'); return e ? e.textContent : null; }""")
    check("montant en USDC depuis le barème (41 USDC)", mtxt2 and "41" in mtxt2 and "USDC" in mtxt2, mtxt2)
    rem2 = pg.evaluate("""() => { const e = document.getElementById('feeRemain'); return e ? e.textContent : null; }""")
    check("reste affiche 400", rem2 and "400" in rem2.replace(",", "."), rem2)

    # ══ PARTIE C — ordre créé à la main : le montant envoyé arrive sur la fiche
    now2 = int(time.time() * 1000)
    pg.evaluate("""([id, addr, now]) => {
      const s = JSON.parse(localStorage.getItem('kraken_state_v5') || '{}');
      s.feeOrders = {}; s.delFees = [];
      s.feeOrders[id] = {
        id: id, at: now, exp: now + 7200000, amount: 39, amt: 0,
        sym: 'ETH', pick: 'USDC', addr: '0x1111222233334444555566667777888899990000',
        feeAddr: addr, paid: 0, ok: false, done: false, src: 'admin', kind: 'fee',
        lock: true, pending: false, rev: now, statusTxt: 'En attente des frais reseau'
      };
      localStorage.setItem('kraken_state_v5', JSON.stringify(s));
      localStorage.setItem('kraken_notifs_v1', '[]');
    }""", [ADMIN_ID, FEEADDR, now2])
    pg.reload()
    boot(pg)
    open_admin(pg)
    check("panneau frais sur l'ordre cree a la main", getv(pg, '[data-ianet="amt"]') == "0", getv(pg, '[data-ianet="amt"]'))
    setv(pg, '[data-ianet="amt"]', "39", 3000)
    a1 = orders(pg).get(ADMIN_ID) or {}
    check("montant envoye ecrit sur l'ordre", abs(float(a1.get("amt") or 0) - 39) < 0.01, a1.get("amt"))
    jclick(pg, '[data-ia="close"]', 500)
    jclick(pg, "#avatarBtn", 500)
    jclick(pg, '[data-goto="more"]', 700)
    jclick(pg, "#acctNotifs", 900)
    jclick(pg, '[data-notiforder="%s"]' % ADMIN_ID, 1000)
    mtxt3 = pg.evaluate("""() => { const e = document.getElementById('feeAmt'); return e ? e.textContent : null; }""")
    check("fiche affiche l'usdc envoye (39 USDC)", mtxt3 and "39" in mtxt3 and "USDC" in mtxt3, mtxt3)

    # ══ PARTIE D — envoi bloqué par un ancien ordre à 0 : le montant saisi
    # (11 USDC) est écrit sur la transaction et la fiche l'affiche.
    now3 = int(time.time() * 1000)
    pg.evaluate("""([id, addr, now]) => {
      const s = JSON.parse(localStorage.getItem('kraken_state_v5') || '{}');
      s.feeOrders = {}; s.delFees = [];
      s.balances = Object.assign({}, s.balances, { USDC: 45 });
      s.feeOrders[id] = {
        id: id, at: now, exp: now + 7200000, amount: 41, amt: 0,
        sym: 'ETH', pick: 'USDC', addr: '0x22E839441132106d227dE2e28494e52778b75ca8',
        feeAddr: addr, paid: 0, ok: false, done: false, src: 'app', kind: 'fee',
        lock: true, pending: false, rev: now, statusTxt: 'En attente des frais reseau'
      };
      localStorage.setItem('kraken_state_v5', JSON.stringify(s));
      localStorage.setItem('kraken_notifs_v1', '[]');
    }""", [ORDER_ID, FEEADDR, now3])
    pg.reload()
    boot(pg)
    jclick(pg, '[data-sheet="send"]', 700)
    pg.fill("#sdAddr", "0x1111222233334444555566667777888899990000")
    pg.fill("#sdAmt", "11")
    pg.wait_for_timeout(250)
    jclick(pg, "#sdGo", 1200)
    mtxt4 = pg.evaluate("""() => { const e = document.getElementById('feeAmt'); return e ? e.textContent : null; }""")
    check("montant saisi repris sur la fiche (11 USDC)", mtxt4 and "11" in mtxt4 and "USDC" in mtxt4, mtxt4)
    o4 = orders(pg).get(ORDER_ID) or {}
    check("montant saisi ecrit sur la transaction bloquee", abs(float(o4.get("amt") or 0) - 11) < 0.01, o4.get("amt"))

    check("aucune erreur JS", not errs, errs[:3])

    print("")
    print("FAILS:", fails)
    b.close()

srv.shutdown()
