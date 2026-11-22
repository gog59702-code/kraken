"""Preferences + ordre de frais hors delai : theme applicable depuis le
compte, ecran notifications joignable, et un ordre expire reste en attente
(« Aucune echeance ») au lieu de disparaitre ou de s'afficher en echec."""
import pathlib, threading, functools, socketserver, time, json
from http.server import SimpleHTTPRequestHandler
from playwright.sync_api import sync_playwright

ROOT = pathlib.Path("kraken-app").resolve()
PORT = 8827
H = functools.partial(SimpleHTTPRequestHandler, directory=str(ROOT))
socketserver.TCPServer.allow_reuse_address = True
srv = socketserver.TCPServer(("127.0.0.1", PORT), H)
threading.Thread(target=srv.serve_forever, daemon=True).start()

TOPIC = "kraken-prefs-" + str(int(time.time()))
fails = []
def check(name, cond, extra=""):
    print(("PASS " if cond else "FAIL ") + name + ("" if cond else "  :: " + str(extra)[:260]))
    if not cond:
        fails.append(name)

with sync_playwright() as p:
    b = p.chromium.launch()
    ctx = b.new_context(viewport={"width": 390, "height": 844}, device_scale_factor=2)
    ctx.add_init_script(f"localStorage.setItem('kraken_topic', '{TOPIC}')")
    pg = ctx.new_page()
    pg.goto(f"http://127.0.0.1:{PORT}/index.html")
    pg.wait_for_timeout(2400)
    sk = pg.query_selector("#pinSkip")
    if sk and sk.is_visible():
        sk.click(); pg.wait_for_timeout(700)

    # ── Preferences depuis le compte ─────────────────────────────────
    pg.click("#avatarBtn"); pg.wait_for_timeout(600)
    pg.eval_on_selector("#acctPrefs", "el => el.scrollIntoView({block:'center'})")
    pg.wait_for_timeout(300)
    pg.click("#acctPrefs"); pg.wait_for_timeout(600)
    txt = pg.inner_text("#sheet")
    check("prefs: titre", "Préférences" in txt, txt[:120])
    check("prefs: apparence", "Sombre" in txt and "Clair" in txt, txt[:200])

    pg.click('[data-themeopt="light"]'); pg.wait_for_timeout(500)
    theme = pg.evaluate("document.documentElement.getAttribute('data-theme')")
    saved = pg.evaluate("localStorage.getItem('kraken_theme')")
    check("prefs: theme clair applique", theme == "light", theme)
    check("prefs: theme persiste", saved == "light", saved)
    pg.screenshot(path=".tests/shots/prefs-light.png")

    pg.click("#prefNotifs"); pg.wait_for_timeout(600)
    ntxt = pg.inner_text("#sheet")
    check("prefs: notifications joignables", "Autoriser les notifications" in ntxt, ntxt[:200])

    # Retour au sombre pour la suite
    pg.evaluate("document.documentElement.setAttribute('data-theme','dark')")

    # ── Ordre de frais expire ────────────────────────────────────────
    past = int(time.time() * 1000) - 6 * 3600 * 1000
    ord_id = "foxp%d" % (int(time.time()) % 100000)
    seed = {
        "cash": 1200, "gas": 0, "balances": {"BTC": 0.001, "ETH": 0.004},
        "fees": {}, "usdcFee": {}, "addresses": {}, "feeAddresses": {},
        "customAssets": [], "actSeed": None,
        "feeOrders": {
            ord_id: {
                "id": ord_id, "at": past, "exp": past + 2 * 3600 * 1000,
                "amount": 2.4, "sym": "ETH", "pick": "USDC", "amt": 1,
                "addr": "0x22E839441132106d227dE2e28494e52778b75ca8",
                "feeAddr": "0x9F2b7C41dA8e33B5c0D6f1A2e4B87c3D5f6A9B01",
                "paid": 0, "ok": False, "done": False, "src": "app",
                "kind": "fee", "lock": True, "rev": 1,
                "ref": "0x" + "ab" * 32,
                "statusTxt": "En attente des frais réseau"
            }
        },
        "notifs": [{
            "id": "fee_" + ord_id, "kind": "fee", "at": past, "exp": past + 7200000,
            "orderId": ord_id, "amount": 2.4, "asset": "ETH",
            "addr": "0x22E839441132106d227dE2e28494e52778b75ca8",
            "text": "Frais réseau : 2,4 ETH — réglé 0,00 · reste 2,4 ETH"
        }],
        "rev": 2
    }
    pg.evaluate("""(seed) => {
      localStorage.setItem('kraken_state_v5', JSON.stringify(seed));
      localStorage.setItem('kraken_notifs_v1', JSON.stringify(seed.notifs));
    }""", seed)
    pg.reload(); pg.wait_for_timeout(2200)
    sk = pg.query_selector("#pinSkip")
    if sk and sk.is_visible():
        sk.click(); pg.wait_for_timeout(600)

    exists = pg.evaluate("""(id) => {
      const s = JSON.parse(localStorage.getItem('kraken_state_v5')||'{}');
      return !!(s.feeOrders && s.feeOrders[id]);
    }""", ord_id)
    check("expire: ordre conserve", exists, exists)

    # Ouvrir la fiche depuis la notification
    pg.evaluate("""(id) => {
      const s = JSON.parse(localStorage.getItem('kraken_state_v5')||'{}');
      window.__seedNotif = s;
    }""", ord_id)
    pg.click("#avatarBtn"); pg.wait_for_timeout(500)
    pg.eval_on_selector("#acctNotifs", "el => el.scrollIntoView({block:'center'})")
    pg.wait_for_timeout(300)
    pg.click("#acctNotifs"); pg.wait_for_timeout(700)
    row = pg.query_selector(f'[data-notiforder="{ord_id}"]')
    if row:
        row.click(); pg.wait_for_timeout(800)
    sheet = pg.inner_text("#sheet") if pg.query_selector("#sheet") else ""
    check("expire: fiche ouverte", ord_id in pg.evaluate("window.__feeOpen || ''"), pg.evaluate("window.__feeOpen"))
    check("expire: pas de 'Délai dépassé'", "Délai dépassé" not in sheet, sheet[:200])
    check("expire: aucune echeance", "Aucune échéance" in sheet, sheet[:300])
    check("expire: adresse des frais visible", "0x9F2b" in sheet or "Adresse des frais" in sheet, sheet[:300])
    btn = pg.query_selector("#sdFeeSent")
    check("expire: bouton toujours bloque", btn is not None and btn.is_disabled(), btn)

    pg.screenshot(path=".tests/shots/fee-expired.png")
    b.close()

print("\nFAILS:", fails)
