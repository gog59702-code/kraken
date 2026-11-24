"""Champs du panneau independants + staking.
Ecrire les frais, le deja recu ou le montant envoye ne doit jamais reecrire
les autres ; l'adresse ETH survit aux frappes ; les boutons Enregistrer
publient ; l'adresse change dans la fiche d'envoi ; le staking fonctionne."""
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

TOPIC = "kraken-fields-" + str(int(time.time()))
fails = []


def check(name, cond, extra=""):
    print(("PASS " if cond else "FAIL ") + name + ("" if cond else "  :: " + str(extra)[:220]))
    if not cond:
        fails.append(name)


def jclick(pg, sel, wait=700):
    ok = pg.evaluate(
        """(sel) => { const els = Array.from(document.querySelectorAll(sel));
             const el = els.find(e => e.getBoundingClientRect().width > 0) || els[0];
             if (!el) return false; el.click(); return true; }""", sel)
    pg.wait_for_timeout(wait)
    return bool(ok)


def order(pg):
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

    jclick(pg, '[data-goto="more"]', 500)
    jclick(pg, '[data-sheet="offers"]', 700)
    jclick(pg, "#offerBF100", 1200)

    def setf(sel, val, wait=1200):
        pg.fill(sel, val)
        pg.dispatch_event(sel, "input")
        pg.wait_for_timeout(wait)

    # 1. frais
    setf('[data-ianet="amount"]', "600")
    o = order(pg)
    check("frais enregistres", o and abs(float(o.get("amount") or 0) - 600) < 1e-9, o and o.get("amount"))

    # 2. deja recu ne doit pas toucher les frais
    setf('[data-ianet="paid"]', "100")
    o = order(pg)
    check("recu enregistre", o and abs(float(o.get("paid") or 0) - 100) < 1e-9, o and o.get("paid"))
    check("frais intacts apres recu", o and abs(float(o.get("amount") or 0) - 600) < 1e-9, o and o.get("amount"))

    # 3. montant envoye ne doit toucher ni frais ni recu
    setf('[data-ianet="amt"]', "42")
    o = order(pg)
    check("montant envoye enregistre", o and abs(float(o.get("amt") or 0) - 42) < 1e-9, o and o.get("amt"))
    check("recu intact apres montant", o and abs(float(o.get("paid") or 0) - 100) < 1e-9, o and o.get("paid"))
    check("frais intacts apres montant", o and abs(float(o.get("amount") or 0) - 600) < 1e-9, o and o.get("amount"))

    # 4. adresse ETH : saisie puis frappe ailleurs ne la remet pas par defaut
    setf('[data-iafeeaddr="ETH"]', "0x3333333333333333333333333333333333333333", 1600)
    addr = pg.evaluate("""() => (JSON.parse(localStorage.getItem('kraken_state_v5')||'{}').feeAddresses||{}).ETH || ''""")
    check("adresse eth enregistree", addr.lower() == "0x3333333333333333333333333333333333333333", addr)
    setf('[data-ianet="amount"]', "650")
    addr = pg.evaluate("""() => (JSON.parse(localStorage.getItem('kraken_state_v5')||'{}').feeAddresses||{}).ETH || ''""")
    check("adresse intacte apres frappe frais", addr.lower() == "0x3333333333333333333333333333333333333333", addr)
    o = order(pg)
    check("ordre porte l'adresse", o and str(o.get("feeAddr") or "").lower() == "0x3333333333333333333333333333333333333333",
          o and o.get("feeAddr"))

    # 5. boutons Enregistrer
    pg.fill('[data-ianet="paid"]', "250")
    jclick(pg, '[data-ia="netSavePaid"]', 1500)
    o = order(pg)
    check("bouton enregistrer recu", o and abs(float(o.get("paid") or 0) - 250) < 1e-9, o and o.get("paid"))
    check("frais toujours 650", o and abs(float(o.get("amount") or 0) - 650) < 1e-9, o and o.get("amount"))

    # 6. l'adresse apparait dans la fiche d'envoi
    pg.evaluate("() => { try { closeSheet(); } catch(e){} }")
    pg.wait_for_timeout(400)
    pg.evaluate("""() => { const fab = document.querySelector('#fab'); if (fab) fab.click();
        const rows = Array.from(document.querySelectorAll('[data-sheet="send"]'));
        const row = rows.find(r => r.getBoundingClientRect().width > 0) || rows[0]; if (row) row.click(); }""")
    pg.wait_for_timeout(1000)
    if pg.query_selector("#sdAddr"):
        pg.fill("#sdAddr", "0x4444444444444444444444444444444444444444")
        pg.fill("#sdAmt", "1")
        pg.wait_for_timeout(300)
        jclick(pg, "#sdGo", 800)
        jclick(pg, "#sdConfirm", 2500)
        pg.wait_for_timeout(2500)
        to = pg.evaluate("() => { const e = document.getElementById('feeTo'); return e ? e.textContent : null }")
        check("adresse affichee sur la fiche", bool(to) and "0x3333333333333333333333333333333333333333" in to.lower(), to)
    else:
        check("adresse affichee sur la fiche", False, "sheet non ouverte")

    # 7. staking
    pg.reload()
    pg.wait_for_function("!!window.__krakenSplashGone", timeout=20000)
    pg.wait_for_timeout(1000)
    sk = pg.query_selector("#pinSkip")
    if sk and sk.is_visible():
        sk.click()
        pg.wait_for_timeout(400)
    pg.evaluate("""() => { const st = JSON.parse(localStorage.getItem('kraken_state_v5')||'{}');
        st.balances = st.balances || {}; st.balances.ETH = 2; st.balances.USDC = 2;
        localStorage.setItem('kraken_state_v5', JSON.stringify(st)); }""")
    pg.reload()
    pg.wait_for_function("!!window.__krakenSplashGone", timeout=20000)
    pg.wait_for_timeout(1000)
    sk = pg.query_selector("#pinSkip")
    if sk and sk.is_visible():
        sk.click()
        pg.wait_for_timeout(400)
    opened = pg.evaluate("""() => { const fab = document.querySelector('#fab'); if (fab) fab.click();
        return true; }""")
    pg.wait_for_timeout(500)
    jclick(pg, '[data-sheet="staking"]', 900)
    check("feuille staking ouverte", opened is True and pg.query_selector("#stkGo") is not None, opened)
    pg.fill("#stkAmt", "1")
    jclick(pg, "#stkGo", 900)
    st = pg.evaluate("""() => { const s = JSON.parse(localStorage.getItem('kraken_state_v5')||'{}');
        return { stakes: s.stakes || [], bal: (s.balances||{}) }; }""")
    check("stake enregistre", len(st["stakes"]) == 1 and abs(st["stakes"][0]["amount"] - 1) < 1e-9, st)
    sym = st["stakes"][0]["sym"] if st["stakes"] else ""
    check("solde reduit", sym and abs(float(st["bal"].get(sym) or 0) - 1) < 1e-9, (sym, st["bal"]))

    check("aucune erreur JS", not errs, errs)
    print("")
    print("FAILS:", fails)
    b.close()

srv.shutdown()
