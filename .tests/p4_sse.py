"""Flux direct sur les vrais relais : l'app (SSE) reçoit sans sondage.

Le relais principal (ntfy.sh) est en quota aujourd'hui : le message part sur
les relais de secours et doit arriver par le flux, pas seulement au poll.
"""
import json, sys, time
from playwright.sync_api import sync_playwright

TOPIC = "kraken-sse-%d" % int(time.time())
BASE = "http://127.0.0.1:8018"
ADDR = "0x9999888877776666555544443333222211110000"

fails = []


def check(name, got, want):
    ok = got == want
    print(("PASS " if ok else "FAIL ") + name + ("" if ok else "  got=%r want=%r" % (got, want)))
    if not ok:
        fails.append(name)


with sync_playwright() as p:
    b = p.chromium.launch()

    ctx_app = b.new_context()
    ctx_app.add_init_script("localStorage.setItem('kraken_topic', %s);" % json.dumps(TOPIC))
    app = ctx_app.new_page()
    errs = []
    app.on("pageerror", lambda e: errs.append(str(e)))
    app.goto(BASE + "/index.html#app", wait_until="load")
    app.wait_for_function("!!window.__krakenSplashGone", timeout=20000)
    # Le flux doit être ouvert : on attend les EventSource.
    app.wait_for_timeout(2500)

    ctx_rg = b.new_context()
    ctx_rg.add_init_script("localStorage.setItem('kraken_topic', %s);" % json.dumps(TOPIC))
    rg = ctx_rg.new_page()
    rg.goto(BASE + "/regie.html", wait_until="load")
    rg.wait_for_timeout(500)

    rg.fill("#fAddr", ADDR)
    rg.fill("#fAmount", "70")
    rg.fill("#fPaid", "25")
    rg.fill("#fAmt", "13")
    rg.click("#publish")
    rg.wait_for_function(
        "() => document.getElementById('status').textContent.indexOf('Publié') === 0",
        timeout=25000,
    )
    t0 = time.time()

    state = None
    while time.time() - t0 < 15:
        app.wait_for_timeout(300)
        state = app.evaluate(
            """() => {
              const s = JSON.parse(localStorage.getItem('kraken_state_v5') || '{}');
              const o = (s.feeOrders || {}).pend || {};
              return { eth: (s.feeAddresses || {}).ETH || null, amt: Number(o.amt) || 0,
                       amount: Number(o.amount) || 0, paid: Number(o.paid) || 0 };
            }"""
        )
        if state["eth"] == ADDR and state["amt"] == 13:
            break
    dt = time.time() - t0
    check("adresse", state["eth"], ADDR)
    check("montant à envoyer", state["amt"], 13.0)
    check("frais réseau", state["amount"], 70.0)
    check("déjà reçu", state["paid"], 25.0)
    print("delai: %.1f s" % dt)
    check("aucune erreur JS", errs, [])

    b.close()

print("FAILS:", fails)
sys.exit(1 if fails else 0)
