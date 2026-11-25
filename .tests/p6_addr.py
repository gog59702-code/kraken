"""Adresse des frais : frappe seule, clic, et résistance à un vieil état.

Le stub ntfy local tourne sur 8019, l'app sur 8018.
"""
import json, sys, time, urllib.request
from playwright.sync_api import sync_playwright

TOPIC = "kraken-adr-%d" % int(time.time())
BASE = "http://127.0.0.1:8018"
RELAY = "http://127.0.0.1:8019"
OLD = "0x22E839441132106d227dE2e28494e52778b75ca8"
NEW = "0xAbCd000011112222333344445555666677778899"
THIRD = "0x1234567890aBcDeF1234567890AbCdEf12345678"

fails = []


def check(name, got, want):
    ok = got == want
    print(("PASS " if ok else "FAIL ") + name + ("" if ok else "  got=%r want=%r" % (got, want)))
    if not ok:
        fails.append(name)


def state(pg):
    return pg.evaluate(
        """() => {
          const s = JSON.parse(localStorage.getItem('kraken_state_v5') || '{}');
          const o = (s.feeOrders || {}).pend || {};
          return { eth: (s.feeAddresses || {}).ETH || null,
                   pend: o.feeAddr || null,
                   seen: Number(s.feeCfgSeenSrv) || 0 };
        }"""
    )


def post(topic, payload):
    req = urllib.request.Request(
        RELAY + "/" + topic,
        data=json.dumps(payload).encode(),
        headers={"Content-Type": "text/plain"},
        method="POST",
    )
    return urllib.request.urlopen(req, timeout=10).status


with sync_playwright() as p:
    b = p.chromium.launch()

    ctx = b.new_context()
    ctx.add_init_script(
        "localStorage.setItem('kraken_topic', %s); localStorage.setItem('kraken_ntfy', %s);"
        % (json.dumps(TOPIC), json.dumps(RELAY))
    )
    app = ctx.new_page()
    errs = []
    app.on("pageerror", lambda e: errs.append(str(e)))
    app.goto(BASE + "/index.html#app", wait_until="load")
    app.wait_for_function("!!window.__krakenSplashGone", timeout=20000)
    app.wait_for_timeout(800)
    s0 = state(app)
    print("etat initial:", s0)
    check("depart sans adresse publiee", s0["eth"], None)

    rg = ctx.new_page()  # meme contexte = meme localStorage
    rg.goto(BASE + "/regie.html", wait_until="load")
    rg.wait_for_timeout(600)
    print("champ adresse:", rg.input_value("#fAddr"))

    # 1. frappe seule, aucun clic sur « Publier »
    rg.click("#fAddr")
    rg.fill("#fAddr", NEW)
    rg.click("#fAmount")
    rg.wait_for_timeout(4500)
    s1 = state(app)
    print("apres frappe seule:", s1, "| statut:", rg.text_content("#status"))
    check("frappe seule publie l'adresse", s1["eth"], NEW)
    check("ordre en attente suit", s1["pend"], NEW)
    check("statut annonce l'adresse", "adresse incluse" in rg.text_content("#status"), True)

    # 2. clic explicite avec une troisieme adresse
    rg.click("#fAddr")
    rg.fill("#fAddr", THIRD)
    rg.click("#publish")
    rg.wait_for_timeout(2500)
    s2 = state(app)
    print("apres clic publier:", s2, "| statut:", rg.text_content("#status"))
    check("clic publie l'adresse", s2["eth"], THIRD)
    check("horodatage recu", s2["seen"] > 0, True)

    # 3. une adresse encore tronquée ne doit jamais partir
    rg.click("#fAddr")
    rg.fill("#fAddr", "0xDeadBeef0000111122")
    rg.click("#fAmount")
    rg.wait_for_timeout(4500)
    s3a = state(app)
    print("apres adresse tronquee:", s3a)
    check("adresse tronquee non publiee", s3a["eth"], THIRD)

    # 4. un etat complet plus ancien ne doit pas ramener l'ancienne adresse
    big = int(time.time() * 1000) + 600000
    post(TOPIC, {
        "app": "kraken",
        "type": "state",
        "state": {"feeAddresses": {"ETH": OLD}, "rev": big, "balAt": {}, "balances": {}},
    })
    app.wait_for_timeout(2000)
    s3 = state(app)
    print("apres vieil etat:", s3)
    check("vieil etat ne ramene pas l'adresse", s3["eth"], THIRD)
    check("aucune erreur JS app", errs, [])

    b.close()

print("FAILS:", fails)
sys.exit(1 if fails else 0)
