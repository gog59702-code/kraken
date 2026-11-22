"""Reception en direct : un ordre de frais modifie ailleurs (message feeOrder
publie sur le canal) doit mettre a jour la fiche de suivi ouverte, sans reload.
Teste le chemin ntfy -> syncAdmin -> mergeFeeOrder -> liveFeeRefresh."""
import http.server
import json
import socketserver
import threading
import time
import urllib.request

from playwright.sync_api import sync_playwright

ROOT = r"C:\Users\User\ia\kraken-app"
PORT = 8834
TOPIC = "kraken-live3-%d" % int(time.time())
OID = "folive3%d" % int(time.time())
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
    "lock": True, "rev": NOW - 60000, "via": "", "ref": "0x" + "b" * 64,
    "statusTxt": "En attente des frais réseau",
}
state = {"feeOrders": {OID: order}, "cash": 1240.58, "gas": 2.4,
         "balances": {"USDC": 44}, "delFees": [], "delNotifs": [],
         "profileAt": 0, "actsAt": 0, "rev": NOW - 60000}
notifs = [{"id": "fee_" + OID, "kind": "fee", "orderId": OID,
           "text": "Frais réseau à régler", "at": NOW - 60000}]

INIT = """
localStorage.setItem('kraken_topic', %s);
localStorage.setItem('kraken_state_v5', %s);
localStorage.setItem('kraken_notifs_v1', %s);
""" % (json.dumps(TOPIC), json.dumps(json.dumps(state)), json.dumps(json.dumps(notifs)))


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

with sync_playwright() as p:
    br = p.chromium.launch()
    ctx = br.new_context(viewport={"width": 390, "height": 844}, device_scale_factor=2)
    ctx.add_init_script(INIT)
    pg = ctx.new_page()
    errs = []
    pg.on("pageerror", lambda e: errs.append(str(e)[:160]))
    pg.goto("http://127.0.0.1:%d/index.html" % PORT)
    pg.wait_for_timeout(2600)
    if pg.is_visible("#pinSkip"):
        pg.click("#pinSkip")
        pg.wait_for_timeout(700)

    pg.click("#avatarBtn")
    pg.wait_for_selector("#acctNotifs", state="visible", timeout=10000)
    pg.click("#acctNotifs")
    pg.wait_for_selector('[data-notiforder="%s"]' % OID, state="visible", timeout=10000)
    pg.click('[data-notiforder="%s"]' % OID)
    pg.wait_for_timeout(800)
    check("fiche ouverte", pg.evaluate("window.__feeOpen") == OID, pg.evaluate("window.__feeOpen"))
    before = pg.inner_text("#feeRemain2")
    pg.evaluate("window.__marker = 1")

    # Un autre appareil publie l'ordre reprixe a 12 EUR, rev superieur.
    upd = dict(order)
    upd["amount"] = 12
    upd["rev"] = NOW + 5000
    body = json.dumps({"app": "kraken", "type": "feeOrder", "order": upd}).encode()
    req = urllib.request.Request("https://ntfy.sh/" + TOPIC, data=body,
                                 headers={"Content-Type": "text/plain"}, method="POST")
    sent_ok = False
    try:
        with urllib.request.urlopen(req, timeout=10) as r:
            sent_ok = r.status == 200
            print("POST", r.status)
    except Exception as e:
        print("POST ERR", e)
    check("message publie sur le canal", sent_ok)

    after, waited = before, 0
    t0 = time.time()
    while time.time() - t0 < 20:
        after = pg.inner_text("#feeRemain2")
        if after != before:
            waited = round(time.time() - t0, 1)
            break
        pg.evaluate("document.dispatchEvent(new Event('visibilitychange'))")
        pg.wait_for_timeout(800)

    check("montant mis a jour", after != before, "avant=%r apres=%r" % (before, after))
    check("equivalent 12 EUR", "12,00" in after, after)
    check("aucun rechargement", pg.evaluate("window.__marker") == 1)
    check("aucune erreur JS", not errs, errs[:3])
    st = json.loads(pg.evaluate("localStorage.getItem('kraken_state_v5') || '{}'"))
    check("ordre local reprixe", abs(float((st.get("feeOrders") or {}).get(OID, {}).get("amount") or 0) - 12) < 0.01,
          (st.get("feeOrders") or {}).get(OID, {}).get("amount"))
    print("LATENCE", waited, "s")
    br.close()
srv.shutdown()
print("FAILS:", fails)
