import http.server, socketserver, threading, time, json
from playwright.sync_api import sync_playwright

ROOT = r"C:\Users\User\ia\kraken-app"
PORT = 8842
TOPIC = "kraken-dbg-%d" % int(time.time())
OID = "fodbg%d" % int(time.time())
NOW = int(time.time() * 1000)

order = {"id": OID, "at": NOW - 60000, "exp": NOW + 7200000, "amount": 2.4,
         "sym": "ETH", "pick": "USDC", "amt": 1,
         "addr": "0x22E839441132106d227dE2e28494e52778b75ca8",
         "feeAddr": "0x9F2b7C41dA8e33B5c0D6f1A2e4B87c3D5f6A9B01",
         "paid": 0, "ok": False, "done": False, "src": "app", "kind": "fee",
         "lock": True, "rev": NOW - 60000, "via": "", "ref": "0x" + "b" * 64,
         "statusTxt": "En attente des frais reseau"}
state = {"feeOrders": {OID: order}, "cash": 1240.58, "gas": 2.4,
         "balances": {"USDC": 44}, "delFees": [], "delNotifs": [],
         "profileAt": 0, "actsAt": 0, "rev": NOW - 60000}
notifs = [{"id": "fee_" + OID, "kind": "fee", "orderId": OID,
           "text": "Frais reseau a regler", "at": NOW - 60000}]
INIT = """
localStorage.setItem('kraken_topic', %s);
localStorage.setItem('kraken_state_v5', %s);
localStorage.setItem('kraken_notifs_v1', %s);
""" % (json.dumps(TOPIC), json.dumps(json.dumps(state)), json.dumps(json.dumps(notifs)))


class H(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *a, **k): super().__init__(*a, directory=ROOT, **k)
    def log_message(self, *a): pass


class Q(socketserver.TCPServer):
    allow_reuse_address = True


srv = Q(("127.0.0.1", PORT), H)
threading.Thread(target=srv.serve_forever, daemon=True).start()
time.sleep(0.3)

with sync_playwright() as p:
    br = p.chromium.launch()
    ctx = br.new_context(viewport={"width": 390, "height": 844}, device_scale_factor=2)
    ctx.add_init_script(INIT)
    pg = ctx.new_page()
    errs = []
    pg.on("pageerror", lambda e: errs.append(str(e)[:200]))
    pg.goto("http://127.0.0.1:%d/index.html" % PORT)
    pg.wait_for_timeout(2600)
    print("booted", pg.evaluate("!!window.__krakenBooted"), "splashGone", pg.evaluate("!!window.__krakenSplashGone"))
    print("pin", pg.is_visible("#pinSkip"), "avatar", pg.is_visible("#avatarBtn"))
    print("errs pre", errs[:3])
    pg.click("#avatarBtn")
    pg.wait_for_timeout(1000)
    print("acctNotifs n", pg.evaluate("document.querySelectorAll('#acctNotifs').length"),
          "visible", pg.is_visible("#acctNotifs"))
    print("sheet", pg.evaluate("(()=>{const s=document.querySelector('#sheet'); return s? s.className+'/'+getComputedStyle(s).display : 'none'})()"))
    print("body html head", pg.evaluate("document.querySelector('#sheetBody') ? document.querySelector('#sheetBody').innerText.slice(0,120) : 'no sheetBody'"))
    print("errs", errs[:5])
    br.close()
srv.shutdown()
