"""Historique persistant : l'etat publie transporte les notifications, un
appareil au cache vide les recupere sans dependre du rejeu ntfy."""
import pathlib, threading, functools, socketserver, time, json, urllib.request
from http.server import SimpleHTTPRequestHandler
from playwright.sync_api import sync_playwright

ROOT = pathlib.Path("kraken-app").resolve()
PORT = 8821
H = functools.partial(SimpleHTTPRequestHandler, directory=str(ROOT))
socketserver.TCPServer.allow_reuse_address = True
srv = socketserver.TCPServer(("127.0.0.1", PORT), H)
threading.Thread(target=srv.serve_forever, daemon=True).start()

TOPIC = "kraken-persist-" + str(int(time.time()))
NOW = int(time.time() * 1000)
STATE = {
    "cash": 1240.58, "gas": 0, "balances": {"BTC": 0.0012, "ETH": 0.0064},
    "fees": {}, "usdcFee": {}, "addresses": {}, "feeAddresses": {},
    "customAssets": [], "actSeed": None, "feeOrders": {},
    "notifs": [
        {"id": "p1", "kind": "deposit", "at": NOW - 7200000, "amount": 250, "asset": "EUR",
         "addr": "", "text": "Dépôt de 250,00 € reçu.", "exp": 0, "orderId": ""},
        {"id": "p2", "kind": "withdraw", "at": NOW - 3600000, "amount": 0.25, "asset": "ETH",
         "addr": "0x22E839441132106d227dE2e28494e52778b75ca8", "text": "Retrait envoyé.", "exp": 0,
         "orderId": ""}
    ],
    "rev": 7
}

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

    body = json.dumps({"app": "kraken", "type": "state", "state": STATE}).encode()
    req = urllib.request.Request(f"https://ntfy.sh/{TOPIC}", data=body, method="POST",
                                 headers={"Content-Type": "text/plain"})
    print("publie:", urllib.request.urlopen(req, timeout=15).status)

    got = []
    for _ in range(40):
        pg.wait_for_timeout(1000)
        # Coup de pouce : la synchro de fond tourne toutes les 30 s ; on la
        # relance comme le ferait un retour au premier plan.
        pg.evaluate("document.dispatchEvent(new Event('visibilitychange'))")
        got = pg.evaluate("() => JSON.parse(localStorage.getItem('kraken_notifs_v1') || '[]').map(x => x.id)")
        if len(got) >= 2:
            break
    print("historique recupere:", got)
    print("rev local:", pg.evaluate("() => (JSON.parse(localStorage.getItem('kraken_state_v5')||'{}').rev) || 0"))
    print("etat poll:", pg.evaluate("""async (t) => {
      const r = await fetch('https://ntfy.sh/' + t + '/json?poll=1&since=1h', {cache:'no-store'});
      const txt = await r.text();
      return [r.status, txt.split('\\n').filter(Boolean).length];
    }""", TOPIC))
    pg.click("#avatarBtn"); pg.wait_for_timeout(500)
    pg.eval_on_selector("#acctNotifs", "e => e.scrollIntoView({block:'center'})")
    pg.wait_for_timeout(300)
    pg.click("#acctNotifs"); pg.wait_for_timeout(800)
    txt = pg.inner_text("#sheetBody").replace("\n", " | ")
    print("fiche:", txt[:200])
    b.close()
