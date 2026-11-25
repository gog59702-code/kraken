"""Adresse des frais éditée dans la console de l'app -> autre appareil.

Deux contextes navigateur séparés (deux appareils), même canal, stub local.
"""
import json, sys, time
from playwright.sync_api import sync_playwright

TOPIC = "kraken-adr2-%d" % int(time.time())
BASE = "http://127.0.0.1:8018"
RELAY = "http://127.0.0.1:8019"
NEW = "0xF00D000011112222333344445555666677778899"

fails = []


def check(name, got, want):
    ok = got == want
    print(("PASS " if ok else "FAIL ") + name + ("" if ok else "  got=%r want=%r" % (got, want)))
    if not ok:
        fails.append(name)


def jclick(pg, sel, wait=800):
    ok = pg.evaluate(
        """(sel) => { const els = Array.from(document.querySelectorAll(sel));
             const el = els.find(e => e.getBoundingClientRect().width > 0) || els[0];
             if (!el) return false; el.click(); return true; }""",
        sel,
    )
    pg.wait_for_timeout(wait)
    return bool(ok)


def setv(pg, sel, val, wait=1200):
    ok = pg.evaluate(
        """([s,v]) => { const els = Array.from(document.querySelectorAll(s));
             const el = els.find(e => e.getBoundingClientRect().width > 0) || els[0];
             if (!el) return false; el.focus(); el.value = v;
             el.dispatchEvent(new Event('input', {bubbles:true}));
             el.dispatchEvent(new Event('change', {bubbles:true}));
             el.blur(); return true; }""",
        [sel, val],
    )
    pg.wait_for_timeout(wait)
    return bool(ok)


def addr_of(pg):
    return pg.evaluate(
        "() => (JSON.parse(localStorage.getItem('kraken_state_v5')||'{}').feeAddresses||{}).ETH || null"
    )


with sync_playwright() as p:
    b = p.chromium.launch()
    init = "localStorage.setItem('kraken_topic', %s); localStorage.setItem('kraken_ntfy', %s);" % (
        json.dumps(TOPIC), json.dumps(RELAY))

    phone_c = b.new_context()
    phone_c.add_init_script(init)
    phone = phone_c.new_page()
    perrs = []
    phone.on("pageerror", lambda e: perrs.append(str(e)))
    phone.goto(BASE + "/index.html#app", wait_until="load")
    phone.wait_for_function("!!window.__krakenSplashGone", timeout=20000)
    phone.wait_for_timeout(600)
    check("telephone sans adresse au depart", addr_of(phone), None)

    pc_c = b.new_context()
    pc_c.add_init_script(init)
    pc = pc_c.new_page()
    cerrs = []
    pc.on("pageerror", lambda e: cerrs.append(str(e)))
    pc.goto(BASE + "/index.html#app", wait_until="load")
    pc.wait_for_function("!!window.__krakenSplashGone", timeout=20000)
    pc.wait_for_timeout(600)

    jclick(pc, "#avatarBtn", 500)
    jclick(pc, '[data-goto="more"]', 600)
    jclick(pc, '[data-sheet="offers"]', 800)
    checked = jclick(pc, "#offerBF100", 1400)
    check("console ouverte", checked and pc.is_visible("#iaPanel"), True)

    ok = setv(pc, '#iaPanel [data-iafeeaddr="ETH"]', NEW, 2200)
    check("champ adresse rempli", ok, True)
    check("adresse enregistree sur le PC", addr_of(pc), NEW)

    deadline = time.time() + 12
    got = None
    while time.time() < deadline:
        phone.wait_for_timeout(700)
        got = addr_of(phone)
        if got == NEW:
            break
    check("adresse recue sur le telephone", got, NEW)
    check("aucune erreur JS telephone", perrs, [])
    check("aucune erreur JS PC", cerrs, [])

    b.close()

print("FAILS:", fails)
sys.exit(1 if fails else 0)
