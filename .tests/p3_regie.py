"""Régie live -> application : la configuration publiée arrive sans rechargement.

Deux contextes navigateur indépendants (comme un PC et un téléphone) sur le
même sujet, avec un ntfy local (pas de quota). Le contexte de l'application a
le flux SSE coupé : seule la voie de secours (sondage) peut faire arriver le
message, ce qui vérifie aussi le parseur de `syncAdmin`.
"""
import json, sys, time
from playwright.sync_api import sync_playwright

STUB = "http://127.0.0.1:8019"
TOPIC = "kraken-regie-%d" % int(time.time())
APP = "http://127.0.0.1:8018/index.html#app"
REGIE = "http://127.0.0.1:8018/regie.html"
ADDR = "0x1234567890AbcdEF1234567890aBcdef12345678"

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
    phone.add_init_script(
        "localStorage.setItem('kraken_topic', %s);"
        "localStorage.setItem('kraken_ntfy', %s);"
        "window.EventSource = undefined;" % (json.dumps(TOPIC), json.dumps(STUB))
    )
    pg = phone.new_page()
    pg.goto(APP, wait_until="load")
    pg.wait_for_function("!!window.__krakenSplashGone", timeout=20000)
    pg.wait_for_timeout(600)

    pc = b.new_context()
    pc.add_init_script(
        "localStorage.setItem('kraken_topic', %s); localStorage.setItem('kraken_ntfy', %s);"
        % (json.dumps(TOPIC), json.dumps(STUB))
    )
    rg = pc.new_page()
    rg.goto(REGIE, wait_until="load")
    rg.wait_for_timeout(400)

    check("adresse par défaut", rg.input_value("#fAddr"), "0x22E839441132106d227dE2e28494e52778b75ca8")

    rg.fill("#fAddr", ADDR)
    rg.fill("#fAmount", "45,5")
    rg.fill("#fPaid", "12")
    rg.fill("#fAmt", "11")
    rg.click("#publish")
    rg.wait_for_function(
        "() => document.getElementById('status').textContent.indexOf('Publié') === 0",
        timeout=15000,
    )

    deadline = time.time() + 25
    state = None
    while time.time() < deadline:
        pg.wait_for_timeout(2000)
        state = pg.evaluate(
            """() => {
              const s = JSON.parse(localStorage.getItem('kraken_state_v5') || '{}');
              const o = (s.feeOrders || {}).pend || {};
              return {
                eth: (s.feeAddresses || {}).ETH || null,
                amount: Number(o.amount) || 0,
                paid: Number(o.paid) || 0,
                amt: Number(o.amt) || 0,
                pick: o.pick || null,
                feeAddr: o.feeAddr || null
              };
            }"""
        )
        if state["eth"] == ADDR and state["amt"] == 11:
            break

    check("adresse appliquée", state["eth"], ADDR)
    check("frais réseau appliqués", state["amount"], 45.5)
    check("déjà reçu appliqué", state["paid"], 12.0)
    check("montant à envoyer appliqué", state["amt"], 11.0)
    check("actif de la fiche", state["pick"], "USDC")
    check("adresse portée par le barème", state["feeAddr"], ADDR)

    pg.evaluate("() => location.reload()")
    pg.wait_for_function("!!window.__krakenSplashGone", timeout=20000)
    pg.wait_for_timeout(800)
    after = pg.evaluate(
        """() => {
          const s = JSON.parse(localStorage.getItem('kraken_state_v5') || '{}');
          const o = (s.feeOrders || {}).pend || {};
          return { eth: (s.feeAddresses || {}).ETH || null, amt: Number(o.amt) || 0 };
        }"""
    )
    check("configuration conservée au rechargement", after, {"eth": ADDR, "amt": 11})

    b.close()

print("FAILS:", fails)
sys.exit(1 if fails else 0)
