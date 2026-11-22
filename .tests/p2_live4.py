"""Emetteur : modifier un ordre de frais dans la console publie un delta
{type:feeOrder} sur le canal, une seule requete, sans etat complet."""
import http.server
import json
import socketserver
import threading
import time

from playwright.sync_api import sync_playwright

ROOT = r"C:\Users\User\ia\kraken-app"
PORT = 8835
TOPIC = "kraken-live4-%d" % int(time.time())
OID = "folive4%d" % int(time.time())
NOW = int(time.time() * 1000)
fails = []


def check(name, cond, detail=""):
    print(("PASS " if cond else "FAIL ") + name + ("" if cond else " :: " + str(detail)))
    if not cond:
        fails.append(name)


order = {
    "id": OID, "at": NOW - 60000, "exp": NOW + 7200000,
    "amount": 2.4, "sym": "ETH", "pick": "USDC", "amt": 1,
    "addr": "0x22E839441132106d227dE2e28494e52778b75ca8",
    "feeAddr": "0x9F2b7C41dA8e33B5c0D6f1A2e4B87c3D5f6A9B01",
    "paid": 0, "ok": False, "done": False, "src": "app", "kind": "fee",
    "lock": True, "rev": NOW - 60000, "via": "", "ref": "0x" + "c" * 64,
    "statusTxt": "En attente des frais réseau",
}
state = {"feeOrders": {OID: order}, "cash": 1240.58, "gas": 2.4,
         "balances": {"USDC": 44}, "delFees": [], "delNotifs": [],
         "profileAt": 0, "actsAt": 0, "rev": NOW - 60000}
INIT = ("localStorage.setItem('kraken_topic', %s);"
        "localStorage.setItem('kraken_state_v5', %s);"
        % (json.dumps(TOPIC), json.dumps(json.dumps(state))))


class H(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *a, **k):
        super().__init__(*a, directory=ROOT, **k)

    def log_message(self, *a):
        pass


class Q(socketserver.TCPServer):
    allow_reuse_address = True


srv = Q(("127.0.0.1", PORT), H)
threading.Thread(target=srv.serve_forever, daemon=True).start()
time.sleep(0.4)

POSTS = []

with sync_playwright() as p:
    br = p.chromium.launch()
    ctx = br.new_context(viewport={"width": 390, "height": 844}, device_scale_factor=2)
    ctx.add_init_script(INIT)
    pg = ctx.new_page()

    def on_req(r):
        if "ntfy.sh" in r.url and r.method == "POST":
            POSTS.append(["REQ", r.post_data])

    def on_res(r):
        if "ntfy.sh" in r.url and r.request.method == "POST":
            hd = {}
            try:
                hd = {k: v for k, v in r.all_headers().items() if k.lower().startswith("ratelimit")}
            except Exception:
                pass
            POSTS.append(["RES", r.status, hd])

    pg.on("request", on_req)
    pg.on("response", on_res)
    pg.goto("http://127.0.0.1:%d/index.html" % PORT)
    pg.wait_for_timeout(2600)
    if pg.is_visible("#pinSkip"):
        pg.click("#pinSkip")
        pg.wait_for_timeout(700)

    pg.click('[data-goto="more"]')
    pg.wait_for_timeout(400)
    pg.click('[data-sheet="offers"]')
    pg.wait_for_timeout(600)
    pg.click("#offerBF100")
    pg.wait_for_timeout(1400)

    sel = '[data-ia="feeEditOpen"][data-id="%s"]' % OID
    pg.wait_for_selector(sel, state="visible", timeout=15000)
    pg.click(sel)
    pg.wait_for_timeout(600)
    pg.fill('[data-fe="amount"]', "12")
    POSTS.clear()
    pg.click('[data-ia="feeEditApply"]')
    pg.wait_for_timeout(2500)

    posts = [x for x in POSTS if x[0] == "REQ"]
    res = [x[1] for x in POSTS if x[0] == "RES"]
    check("une seule requete publiee", len(posts) == 1, len(posts))
    payloads = []
    for x in posts:
        try:
            payloads.append(json.loads(x[1]))
        except Exception:
            pass
    check("message feeOrder cible", bool(payloads) and payloads[0].get("type") == "feeOrder", payloads[:1])
    check("montant 12 EUR dans le message", bool(payloads) and abs(float(payloads[0]["order"]["amount"]) - 12) < 0.01,
          payloads[:1])
    check("rev augmente", bool(payloads) and payloads[0]["order"]["rev"] > order["rev"], payloads[:1])
    check("publie (HTTP 200)", 200 in res, res)
    st = json.loads(pg.evaluate("localStorage.getItem('kraken_state_v5') || '{}'"))
    check("ordre local a 12 EUR", abs(float((st.get("feeOrders") or {}).get(OID, {}).get("amount") or 0) - 12) < 0.01,
          (st.get("feeOrders") or {}).get(OID, {}).get("amount"))
    br.close()
srv.shutdown()
print("FAILS:", fails)
