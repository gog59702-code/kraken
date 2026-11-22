"""Une demande de frais poussee par l'admin sur le canal allume une banniere
dans l'app, et un clic ouvre la fiche de suivi de cet ordre."""
import pathlib, threading, functools, socketserver, time, json, urllib.request
from http.server import SimpleHTTPRequestHandler
from playwright.sync_api import sync_playwright

ROOT = pathlib.Path("kraken-app").resolve()
PORT = 8815
H = functools.partial(SimpleHTTPRequestHandler, directory=str(ROOT))
socketserver.TCPServer.allow_reuse_address = True
srv = socketserver.TCPServer(("127.0.0.1", PORT), H)
threading.Thread(target=srv.serve_forever, daemon=True).start()

TOPIC = "kraken-test-" + str(int(time.time()))
OID = "fobanner" + str(int(time.time()))[-4:]
NOW = int(time.time() * 1000)
ORDER = { "id": OID, "at": NOW, "exp": NOW + 7200000, "amount": 2.4, "sym": "ETH",
          "pick": "USDC", "amt": 0.5, "addr": "0x22E839441132106d227dE2e28494e52778b75ca8",
          "paid": 0, "ok": False, "done": False, "src": "admin", "kind": "fee",
          "lock": True, "ref": "0x" + "ab" * 32 }

with sync_playwright() as p:
    b = p.chromium.launch()
    ctx = b.new_context(viewport={"width": 390, "height": 844}, device_scale_factor=2)
    ctx.add_init_script(f"localStorage.setItem('kraken_topic', '{TOPIC}')")
    pg = ctx.new_page()
    pg.goto(f"http://127.0.0.1:{PORT}/index.html")
    pg.wait_for_timeout(2600)
    sk = pg.query_selector("#pinSkip")
    if sk and sk.is_visible():
        sk.click(); pg.wait_for_timeout(900)

    # Publier comme le ferait la console d'administration.
    body = json.dumps({"app": "kraken", "type": "feeOrder", "order": ORDER}).encode()
    req = urllib.request.Request(f"https://ntfy.sh/{TOPIC}", data=body, method="POST",
                                 headers={"Content-Type": "text/plain"})
    print("publie:", urllib.request.urlopen(req, timeout=15).status)
    chk = urllib.request.urlopen(f"https://ntfy.sh/{TOPIC}/json?poll=1&since=1m", timeout=15).read().decode()
    print("sur le canal:", chk.replace("\n", " ")[:200])
    logs = []
    pg.on("console", lambda m: logs.append(m.type + ":" + m.text[:100]))
    pg.on("pageerror", lambda e: logs.append("err:" + str(e)[:100]))

    shown = False
    for _ in range(50):
        pg.wait_for_timeout(1000)
        if pg.query_selector(".ios-banner.on"):
            shown = True
            break
    print("banniere affichee:", shown)
    print("etat:", pg.evaluate("""(id) => {
      const s = JSON.parse(localStorage.getItem('kraken_state_v5') || '{}');
      const n = JSON.parse(localStorage.getItem('kraken_notifs_v1') || '[]');
      return { order: !!(s.feeOrders || {})[id], notifs: n.filter(x => x.orderId === id).length,
               vis: document.visibilityState, banners: document.querySelectorAll('.ios-banner').length };
    }""", OID))
    print("logs:", logs[-4:])
    if shown:
        txt = pg.inner_text(".ios-banner.on").replace("\n", " | ")
        print("banniere:", txt[:160])
        pg.screenshot(path=str(pathlib.Path(".tests/shots/p2_banner.png")))
        pg.click(".ios-banner.on")
        pg.wait_for_timeout(1200)
        print("fiche ouverte:", pg.evaluate("window.__feeOpen"))
        print("titre fiche:", pg.inner_text("#sheetBody").split("\n")[0] if pg.query_selector("#sheetBody") else "")
        print("montant du:", pg.inner_text("#feeRemain") if pg.query_selector("#feeRemain") else "")
    b.close()
