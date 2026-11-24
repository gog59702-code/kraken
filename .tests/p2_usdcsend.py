"""Envoi USDC : verrou avant transaction, aucune perte de solde, debit unique.

Scenario rapporte : 45 USDC en solde, l'utilisateur tente d'envoyer 20 sans
avoir regle les frais. Il ne doit rien perdre, ne doit pas lire un solde
faux, et doit etre renvoye sur la fiche des frais. Apres validation admin,
le meme envoi passe et le solde tombe a 25.
"""
import pathlib, threading, functools, socketserver, time
from http.server import SimpleHTTPRequestHandler
from playwright.sync_api import sync_playwright

ROOT = pathlib.Path("kraken-app").resolve()
PORT = 8853
H = functools.partial(SimpleHTTPRequestHandler, directory=str(ROOT))
socketserver.TCPServer.allow_reuse_address = True
srv = socketserver.ThreadingTCPServer(("127.0.0.1", PORT), H)
srv.daemon_threads = True
threading.Thread(target=srv.serve_forever, daemon=True).start()

DEF = "0x22E839441132106d227dE2e28494e52778b75ca8"
DEST = "0x5B1c9F7d3A8e4C2b6D0f1E9a7B3c5D8e2F4a6C10"
TOPIC = "kraken-usdcsend-" + str(int(time.time()))
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


def balance(pg, sym):
    return pg.evaluate("(sym) => Number((JSON.parse(localStorage.getItem('kraken_state_v5')||'{}').balances||{})[sym])||0", sym)


def open_admin(pg):
    jclick(pg, "#avatarBtn", 500)
    jclick(pg, '[data-goto="more"]', 600)
    jclick(pg, '[data-sheet="offers"]', 800)
    jclick(pg, "#offerBF100", 1400)


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

    # solde de depart : 45 USDC, aucun ordre d'attente encore regle
    pg.evaluate("""() => {
      const s = JSON.parse(localStorage.getItem('kraken_state_v5') || '{}');
      s.balances = Object.assign({}, s.balances, { USDC: 45 });
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

    pend = pg.evaluate("() => (JSON.parse(localStorage.getItem('kraken_state_v5')||'{}').feeOrders||{}).pend || null")
    check("ordre d'attente cree au demarrage", bool(pend), pend)
    check("verrou ferme par defaut", bool(pend) and pend.get("ok") is False, pend and pend.get("ok"))
    check("solde USDC de depart", abs(balance(pg, "USDC") - 45) < 1e-9, balance(pg, "USDC"))

    # ── 1. envoi refuse, redirige vers la fiche des frais ─────────────────
    check("clic Envoyer atteint", open_send(pg))
    check("fiche des frais ouverte a la place", pg.query_selector("#feeTo") is not None)
    check("formulaire d'envoi absent", pg.query_selector("#sdAddr") is None)
    check("solde inchange apres refus", abs(balance(pg, "USDC") - 45) < 1e-9, balance(pg, "USDC"))
    holds = pg.evaluate("""() => Object.values(JSON.parse(localStorage.getItem('kraken_state_v5')||'{}').feeOrders||{})
        .filter(o => o && o.hold).length""")
    check("aucune retenue creee", holds == 0, holds)

    # ── 2. console : adresse USDC, montant, deja recu, validation ─────────
    pg.evaluate("() => { try { closeSheet(); } catch (e) {} }")
    pg.wait_for_timeout(400)
    open_admin(pg)
    check("console ouverte", pg.query_selector("#iaPanel") is not None)
    cinp = pg.query_selector('.ia-netfee [data-iafeeaddr="USDC"]')
    check("champ adresse USDC en tete", cinp is not None)
    pg.fill('[data-ianet="amount"]', "200")
    pg.dispatch_event('[data-ianet="amount"]', "input")
    pg.wait_for_timeout(300)
    pg.fill('[data-ianet="paid"]', "120")
    pg.dispatch_event('[data-ianet="paid"]', "input")
    pg.wait_for_timeout(900)
    pend = pg.evaluate("() => (JSON.parse(localStorage.getItem('kraken_state_v5')||'{}').feeOrders||{}).pend || null")
    check("montant publie", pend and abs(float(pend.get("amount") or 0) - 200) < 1e-9, pend and pend.get("amount"))
    check("deja recu publie", pend and abs(float(pend.get("paid") or 0) - 120) < 1e-9, pend and pend.get("paid"))
    check("frais libelles en USDC", pend and pend.get("sym") == "USDC", pend and pend.get("sym"))
    check("adresse USDC par defaut", pend and str(pend.get("feeAddr") or "").lower() == DEF.lower(), pend and pend.get("feeAddr"))
    jclick(pg, '[data-ia="netValid"]', 900)
    pend = pg.evaluate("() => (JSON.parse(localStorage.getItem('kraken_state_v5')||'{}').feeOrders||{}).pend || null")
    check("ordre valide", pend and pend.get("ok") is True, pend and pend.get("ok"))

    # ── 3. l'envoi repasse : 20 USDC sur 45, solde 25 ────────────────────
    pg.evaluate("() => { try { closeSheet(); } catch (e) {} }")
    pg.wait_for_timeout(400)
    check("clic Envoyer apres validation", open_send(pg))
    check("formulaire d'envoi present", pg.query_selector("#sdAddr") is not None)
    line = pg.evaluate("() => (document.querySelector('.fee-line b')||{}).textContent || ''")
    check("solde affiche egal au solde reel", "45" in line.replace(",", "."), line)
    pg.fill("#sdAddr", DEST)
    pg.fill("#sdAmt", "20")
    pg.wait_for_timeout(200)
    jclick(pg, "#sdGo", 900)
    check("ecran de confirmation", pg.query_selector("#sdConfirm") is not None)
    jclick(pg, "#sdConfirm", 800)
    pg.wait_for_timeout(9000)
    title = pg.evaluate("() => (document.querySelector('#sheetBody .sheet-title')||{}).textContent || ''")
    check("transaction confirmee", "envoy" in title.lower(), title)
    check("solde debite une seule fois", abs(balance(pg, "USDC") - 25) < 1e-9, balance(pg, "USDC"))
    notif = pg.evaluate("""() => (JSON.parse(localStorage.getItem('kraken_notifs_v1')||'[]'))
        .filter(n => n.kind === 'withdraw' && String(n.text||'').includes('20')).map(n => n.text)""")
    check("envoi trace dans l'historique", len(notif) >= 1, notif)
    jclick(pg, "#sdOk", 600)

    check("aucune erreur JS", not errs, errs[:3])

    b.close()
srv.shutdown()
print("\nFAILS:", fails)
