"""Bout en bout sur le site publié : Régie (PC) -> application (téléphone).

Deux contextes isolés, aucun rechargement. Le sujet est unique pour ne pas
toucher au canal partagé ; les relais sont les vrais.
"""
import json, sys, time
from playwright.sync_api import sync_playwright

BASE = "https://gog59702-code.github.io/kraken/"
TOPIC = "kraken-pub-%d" % int(time.time())
ADDR = "0xC0FFEE0000111122223333444455556666777788"

fails = []


def check(name, got, want):
    ok = got == want
    print(("PASS " if ok else "FAIL ") + name + ("" if ok else "  got=%r want=%r" % (got, want)))
    if not ok:
        fails.append(name)


with sync_playwright() as p:
    b = p.chromium.launch()

    phone = b.new_context()
    phone.add_init_script("localStorage.setItem('kraken_topic', %s);" % json.dumps(TOPIC))
    app = phone.new_page()
    errs = []
    app.on("pageerror", lambda e: errs.append(str(e)))
    app.goto(BASE + "index.html#app", wait_until="load", timeout=60000)
    app.wait_for_function("!!window.__krakenBooted", timeout=40000)
    app.wait_for_timeout(1500)
    check("version servie", app.evaluate("() => (document.querySelector('script[src*=\"app.js\"]')||{}).src").split("?v=")[-1], "9.82")

    pc = b.new_context()
    pc.add_init_script("localStorage.setItem('kraken_topic', %s);" % json.dumps(TOPIC))
    rg = pc.new_page()
    rerr = []
    rg.on("pageerror", lambda e: rerr.append(str(e)))
    rg.goto(BASE + "regie.html", wait_until="load", timeout=60000)
    rg.wait_for_timeout(800)

    rg.fill("#fAddr", ADDR)
    rg.fill("#fAmount", "88,5")
    rg.fill("#fPaid", "30")
    rg.fill("#fAmt", "17")
    rg.click("#publish")
    rg.wait_for_function(
        "() => document.getElementById('status').textContent.indexOf('Publié') === 0",
        timeout=30000,
    )
    print("regie:", rg.text_content("#status"))

    deadline = time.time() + 40
    state = None
    while time.time() < deadline:
        app.wait_for_timeout(1000)
        state = app.evaluate(
            """() => {
              const s = JSON.parse(localStorage.getItem('kraken_state_v5') || '{}');
              const o = (s.feeOrders || {}).pend || {};
              return { eth: (s.feeAddresses || {}).ETH || null,
                       amount: Number(o.amount) || 0, paid: Number(o.paid) || 0,
                       amt: Number(o.amt) || 0 };
            }"""
        )
        if state["eth"] == ADDR and state["amt"] == 17:
            break

    check("adresse", state["eth"], ADDR)
    check("frais réseau", state["amount"], 88.5)
    check("déjà reçu", state["paid"], 30.0)
    check("montant à envoyer", state["amt"], 17.0)
    check("aucune erreur JS app", errs, [])
    check("aucune erreur JS régie", rerr, [])

    b.close()

print("FAILS:", fails)
sys.exit(1 if fails else 0)
