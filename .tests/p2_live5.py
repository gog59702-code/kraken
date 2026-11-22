"""Deux appareils, une seule action admin : le panneau de la console modifie un
ordre de frais, l'autre appareil (fiche de suivi ouverte) se reprixe en direct,
puis la suppression depuis la console ferme la fiche.

Chemin teste de bout en bout : iaFeeApply -> iaPublish({type:"feeOrder"}) ->
ntfy/SSE -> ingestLive -> mergeFeeOrder -> liveFeeRefresh.
"""
import functools
import http.server
import json
import pathlib
import socketserver
import threading
import time

from playwright.sync_api import sync_playwright

ROOT = pathlib.Path(__file__).parent.parent / "kraken-app"
PORT = 8852
TOPIC = "kraken-live5-%d" % int(time.time())
OID = "folive5%d" % int(time.time())
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
notifs = [{"id": "fee_" + OID, "kind": "fee", "orderId": OID,
           "text": "Frais réseau à régler", "at": NOW - 60000}]

INIT = """
localStorage.setItem('kraken_topic', %s);
localStorage.setItem('kraken_state_v5', %s);
localStorage.setItem('kraken_notifs_v1', %s);
""" % (json.dumps(TOPIC), json.dumps(json.dumps(state)), json.dumps(json.dumps(notifs)))

Handler = functools.partial(http.server.SimpleHTTPRequestHandler, directory=str(ROOT))
socketserver.TCPServer.allow_reuse_address = True
httpd = socketserver.TCPServer(("127.0.0.1", PORT), Handler)
threading.Thread(target=httpd.serve_forever, daemon=True).start()
time.sleep(0.4)
BASE = "http://127.0.0.1:%d/index.html" % PORT


def boot(pg):
    # Route directe : pas de splash a attendre, le drapeau est leve au boot.
    for attempt in (1, 2):
        pg.goto(BASE + "#app")
        try:
            pg.wait_for_function("!!window.__krakenSplashGone", timeout=20000)
            break
        except Exception:
            if attempt == 2:
                raise
    pg.wait_for_timeout(500)
    if pg.is_visible("#pinSkip"):
        pg.click("#pinSkip")
        pg.wait_for_timeout(500)
    if pg.is_visible("#pinSkip"):
        pg.click("#pinSkip")
        pg.wait_for_timeout(500)


with sync_playwright() as p:
    br = p.chromium.launch()

    # ── appareil client : fiche de suivi ouverte ────────────────────────
    cb = br.new_context(viewport={"width": 390, "height": 844}, device_scale_factor=2)
    cb.add_init_script(INIT)
    client = cb.new_page()
    cerr = []
    client.on("pageerror", lambda e: cerr.append(str(e)[:160]))
    net = []
    netlog = lambda r: net.append((r.request.method, r.url.split("?")[0][-24:], r.status))
    client.on("response", netlog)
    client.on("requestfailed", lambda r: net.append(("FAIL", r.url.split("?")[0][-24:], r.failure)))
    client.on("console", lambda m: net.append(("CONSOLE", m.text[:80], m.type)))
    boot(client)
    client.click("#avatarBtn")
    client.wait_for_selector("#acctNotifs", state="visible", timeout=10000)
    client.click("#acctNotifs")
    client.wait_for_selector('[data-notiforder="%s"]' % OID, state="visible", timeout=10000)
    client.click('[data-notiforder="%s"]' % OID)
    client.wait_for_timeout(700)
    check("client: fiche ouverte", client.evaluate("window.__feeOpen") == OID,
          client.evaluate("window.__feeOpen"))
    before = client.inner_text("#feeRemain2")
    check("client: montant initial 2,40", "2,40" in before, before)
    client.evaluate("window.__marker = 1")

    # ── appareil admin : console ouverte sur l'ordre ────────────────────
    ab = br.new_context(viewport={"width": 390, "height": 844}, device_scale_factor=2)
    ab.add_init_script(INIT)
    admin = ab.new_page()
    aerr = []
    admin.on("pageerror", lambda e: aerr.append(str(e)[:160]))
    published = []
    admin.on("request", lambda r: published.append(r.post_data)
             if "ntfy.sh/" + TOPIC in r.url and r.method == "POST" else None)
    net = []
    netlog = lambda r: net.append((r.request.method, r.url.split("?")[0][-24:], r.status))
    admin.on("response", netlog)
    boot(admin)
    admin.click('[data-goto="more"]')
    admin.wait_for_timeout(500)
    admin.click('[data-sheet="offers"]')
    admin.wait_for_timeout(600)
    admin.click("#offerBF100")
    admin.wait_for_timeout(1000)
    check("admin: panneau ouvert", admin.query_selector("#iaPanel") is not None)
    admin.click('[data-ia="feeEditOpen"][data-id="%s"]' % OID)
    admin.wait_for_timeout(500)
    check("admin: éditeur ouvert", admin.is_visible('[data-fe="amount"]'))
    admin.fill('[data-fe="amount"]', "15")
    t0 = time.time()
    admin.click('[data-ia="feeEditApply"]')

    after, waited = before, 0
    while time.time() - t0 < 45:
        after = client.inner_text("#feeRemain2")
        if "15,00" in after:
            waited = round(time.time() - t0, 1)
            break
        client.wait_for_timeout(400)

    check("client: reprixé à 15 EUR", "15,00" in after, after)
    check("client: sans rechargement", client.evaluate("window.__marker") == 1)
    print("LATENCE", waited, "s")
    print("NET", [n for n in net if "/sse" in str(n) or "/json" in str(n) or "POST" in str(n) or "FAIL" in str(n) or "CONSOLE" in str(n)][:24])
    msgs = [json.loads(m) for m in published if m]
    # Une reprise après 429 renvoie le meme corps : on deduit par contenu.
    uniq = []
    for m in msgs:
        if m not in uniq:
            uniq.append(m)
    msgs = uniq
    fee_msgs = [m for m in msgs if m.get("type") == "feeOrder"]
    check("admin: un seul delta feeOrder", len(fee_msgs) == 1, msgs[:4])
    check("admin: aucun état complet publié", not any(m.get("type") == "state" for m in msgs), msgs[:4])
    check("admin: montant 15 dans le delta",
          bool(fee_msgs) and abs(float(fee_msgs[0]["order"]["amount"]) - 15) < 0.01,
          fee_msgs[0]["order"]["amount"] if fee_msgs else None)

    # ── suppression depuis la console : la fiche du client se ferme ─────
    admin.click('[data-ia="feeEditDel"]')
    t0 = time.time()
    closed = False
    while time.time() - t0 < 20:
        if client.evaluate("window.__feeOpen") in (None, ""):
            closed = True
            break
        client.wait_for_timeout(300)
    check("client: fiche fermée après suppression", closed, client.evaluate("window.__feeOpen"))
    del_msgs = list({json.dumps(json.loads(m), sort_keys=True): json.loads(m) for m in published if m}.values())
    check("admin: un seul delta feeDel",
          len([m for m in del_msgs if m.get("type") == "feeDel"]) == 1,
          [m.get("type") for m in del_msgs])
    check("client: suppression enterrée", OID in json.loads(
        client.evaluate("localStorage.getItem('kraken_state_v5') || '{}'")).get("delFees", []))
    check("aucune erreur JS client", not cerr, cerr[:3])
    check("aucune erreur JS admin", not aerr, aerr[:3])
    print("NET", [x for x in net if "ntfy" in str(x) or x[0] in ("FAIL", "CONSOLE")][:20])
    br.close()
httpd.shutdown()
print("FAILS:", fails)
