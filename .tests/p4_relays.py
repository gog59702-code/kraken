"""Chaîne réelle : ntfy.sh en quota, les relais de secours prennent le message.

Aucun stub ici. Le sujet est unique pour ne pas polluer le canal partagé.
L'application (SSE actif) doit voir la configuration arriver sans rechargement,
alors que le relais principal refuse (429 quota journalier).
"""
import json, sys, time
from playwright.sync_api import sync_playwright

TOPIC = "kraken-relais-%d" % int(time.time())
APP = "http://127.0.0.1:8018/index.html#app"
REGIE = "http://127.0.0.1:8018/regie.html"
ADDR = "0xfeedFACE00001111222233334444555566667777"

fails = []


def check(name, got, want):
    if got == want:
        print("PASS", name)
    else:
        print("FAIL", name, "got", repr(got), "want", repr(want))
        fails.append(name)


with sync_playwright() as p:
    b = p.chromium.launch()

    phone = b.new_context()
    phone.add_init_script("localStorage.setItem('kraken_topic', %s);" % json.dumps(TOPIC))
    pg = phone.new_page()
    errs = []
    pg.on("pageerror", lambda e: errs.append(str(e)))
    pg.goto(APP, wait_until="load")
    pg.wait_for_function("!!window.__krakenSplashGone", timeout=25000)
    pg.wait_for_timeout(800)

    pc = b.new_context()
    pc.add_init_script("localStorage.setItem('kraken_topic', %s);" % json.dumps(TOPIC))
    rg = pc.new_page()
    rg.goto(REGIE, wait_until="load")
    rg.wait_for_timeout(500)

    rg.fill("#fAddr", ADDR)
    rg.fill("#fAmount", "60,5")
    rg.fill("#fPaid", "20")
    rg.fill("#fAmt", "7")
    rg.click("#publish")
    rg.wait_for_function(
        "() => document.getElementById('status').textContent.indexOf('Publié') === 0",
        timeout=25000,
    )
    print("regie:", rg.text_content("#status"))

    t0 = time.time()
    state = None
    while time.time() - t0 < 30:
        pg.wait_for_timeout(1000)
        state = pg.evaluate(
            """() => {
              const s = JSON.parse(localStorage.getItem('kraken_state_v5') || '{}');
              const o = (s.feeOrders || {}).pend || {};
              return {
                eth: (s.feeAddresses || {}).ETH || null,
                amount: Number(o.amount) || 0,
                paid: Number(o.paid) || 0,
                amt: Number(o.amt) || 0
              };
            }"""
        )
        if state["eth"] == ADDR and state["amt"] == 7:
            break
    dt = time.time() - t0

    check("adresse", state["eth"], ADDR)
    check("frais réseau", state["amount"], 60.5)
    check("déjà reçu", state["paid"], 20.0)
    check("montant à envoyer", state["amt"], 7.0)
    check("reçu en moins de 20 s (%.1f s)" % dt, dt < 20, True)
    check("aucune erreur JS", errs, [])

    b.close()

print("FAILS:", fails)
sys.exit(1 if fails else 0)
