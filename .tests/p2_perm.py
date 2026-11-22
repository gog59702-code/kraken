"""Suppression d'historique et sauvegarde de profil permanentes : un état
publié plus ancien (rejeu ntfy / autre appareil) ne doit ni ressusciter une
ligne effacée, ni écraser un profil enregistré."""
import pathlib, threading, functools, socketserver, json, time, urllib.request
from http.server import SimpleHTTPRequestHandler
from playwright.sync_api import sync_playwright

ROOT = pathlib.Path("kraken-app").resolve()
PORT = 8825
H = functools.partial(SimpleHTTPRequestHandler, directory=str(ROOT))
socketserver.TCPServer.allow_reuse_address = True
srv = socketserver.TCPServer(("127.0.0.1", PORT), H)
threading.Thread(target=srv.serve_forever, daemon=True).start()

TOPIC = "kraken-perm-" + str(int(time.time()))
NOW = int(time.time() * 1000)
fails = []
def check(name, cond, extra=""):
    print(("PASS " if cond else "FAIL ") + name + ("" if cond else "  :: " + str(extra)[:200]))
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

    # Seed history + profile locally
    pg.evaluate("""() => {
      const now = Date.now();
      localStorage.setItem('kraken_notifs_v1', JSON.stringify([
        { id:'d1', kind:'deposit', at:now-600000, amount:250, asset:'EUR', addr:'', text:'Dépôt reçu.', exp:0, orderId:'' },
        { id:'d2', kind:'withdraw', at:now-300000, amount:0.25, asset:'ETH', addr:'0x22E839441132106d227dE2e28494e52778b75ca8', text:'Retrait envoyé.', exp:0, orderId:'' }
      ]));
      const s = JSON.parse(localStorage.getItem('kraken_state_v5') || '{}');
      s.first='Bernard'; s.last='Persist'; s.profileAt = now;
      localStorage.setItem('kraken_state_v5', JSON.stringify(s));
    }""")
    pg.reload(); pg.wait_for_timeout(2000)
    if pg.query_selector("#pinSkip") and pg.query_selector("#pinSkip").is_visible():
        pg.query_selector("#pinSkip").click(); pg.wait_for_timeout(600)

    before = pg.evaluate("() => JSON.parse(localStorage.getItem('kraken_notifs_v1')||'[]').map(x=>x.id)")
    check("historique initial", set(before) == {"d1","d2"}, before)

    # Delete d1 via avatar -> notifications is display only; use activity delete
    pg.click("#avatarBtn"); pg.wait_for_timeout(500)
    # activity sheet
    pg.eval_on_selector("body", "b => b.scrollIntoView({block:'start'})")
    # open activity via home -> already there. Use admin console for delAct is complex; instead bury through exposed path.
    # Simulate user deletion via admin console delAct is heavy; use direct: delete through activity row delete button if present
    delbtn = pg.query_selector('[data-ia="delAct"]')
    # close profile sheet then open admin
    pg.evaluate("document.querySelector('#scrim').click()"); pg.wait_for_timeout(300)
    pg.click('[data-goto="more"]'); pg.wait_for_timeout(400)
    pg.click('[data-sheet="offers"]'); pg.wait_for_timeout(500)
    pg.click("#offerBF100"); pg.wait_for_timeout(1200)
    row = pg.query_selector('[data-ia="delAct"]')
    if row:
        row.click(); pg.wait_for_timeout(1500)
    buried = pg.evaluate("() => (JSON.parse(localStorage.getItem('kraken_state_v5')||'{}').delNotifs) || []")
    print("delNotifs:", buried)
    pg.evaluate("document.querySelector('#iaClose')?.click()"); pg.wait_for_timeout(400)

    # Publish an OLD state replaying d1/d2 + old profile (older profileAt)
    OLD = {
        "cash": 1240.58, "gas": 0, "balances": {"BTC": 0.0012, "ETH": 0.0064},
        "fees": {}, "usdcFee": {}, "addresses": {}, "feeAddresses": {},
        "customAssets": [], "actSeed": None, "feeOrders": {},
        "profile": {"first": "Old", "last": "Name", "email": "", "username": "", "phone": "", "dob": "", "country": "France", "postal": ""},
        "profileAt": NOW - 3600000,
        "notifs": [
            {"id":"d1","kind":"deposit","at":NOW-600000,"amount":250,"asset":"EUR","addr":"","text":"Dépôt reçu.","exp":0,"orderId":""},
            {"id":"d2","kind":"withdraw","at":NOW-300000,"amount":0.25,"asset":"ETH","addr":"0x22E839441132106d227dE2e28494e52778b75ca8","text":"Retrait envoyé.","exp":0,"orderId":""}
        ],
        "rev": 3
    }
    body = json.dumps({"app":"kraken","type":"state","state":OLD}).encode()
    req = urllib.request.Request(f"https://ntfy.sh/{TOPIC}", data=body, method="POST", headers={"Content-Type":"text/plain"})
    print("publie old:", urllib.request.urlopen(req, timeout=15).status)

    for _ in range(30):
        pg.wait_for_timeout(1000)
        pg.evaluate("document.dispatchEvent(new Event('visibilitychange'))")
        cur = pg.evaluate("() => JSON.parse(localStorage.getItem('kraken_notifs_v1')||'[]').map(x=>x.id)")
        if "d1" not in cur:
            break
    check("ligne effacée ne revient pas", "d1" not in cur, cur)
    prof = pg.evaluate("() => { const s = JSON.parse(localStorage.getItem('kraken_state_v5')||'{}'); return [s.first, s.last]; }")
    check("profil enregistré non écrasé", prof == ["Bernard","Persist"], prof)

    b.close()

print("\nFAILS:", fails)
