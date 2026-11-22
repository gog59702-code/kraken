"""p2_feedel — une suppression d'ordre de frais faite dans la console admin
disparait en direct sur l'autre appareil, ne revient pas au rechargement, et
un etat plus ancien rejoue sur ntfy ne la ressuscite pas.

Deux contextes navigateur, un seul canal ntfy. A = client, B = admin.
"""
import functools
import json
import pathlib
import threading
import time
import urllib.request
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

from playwright.sync_api import sync_playwright

ROOT = pathlib.Path("kraken-app").resolve()
PORT = 8832
BASE = "http://127.0.0.1:%d/index.html" % PORT
ADDR = "0x22E839441132106d227dE2e28494e52778b75ca8"
TOPIC = "kraken-feedel-%d" % int(time.time())

H = functools.partial(SimpleHTTPRequestHandler, directory=str(ROOT))
srv = ThreadingHTTPServer(("127.0.0.1", PORT), H)
threading.Thread(target=srv.serve_forever, daemon=True).start()

FAILS = []


def check(name, ok, detail=""):
    if ok:
        print("PASS " + name)
    else:
        print("FAIL " + name + "  :: " + str(detail))
        FAILS.append(name)


def boot(pg):
    pg.goto(BASE, wait_until="load")
    pg.wait_for_timeout(2400)
    skip = pg.query_selector("#pinSkip")
    if skip and skip.is_visible():
        skip.click()
        pg.wait_for_timeout(700)


def nudge(pg):
    """Force le passage de synchro comme un retour d'onglet au premier plan."""
    try:
        pg.evaluate("document.dispatchEvent(new Event('visibilitychange'))")
    except Exception:
        pass


READ = """(id) => {
  const s = JSON.parse(localStorage.getItem('kraken_state_v5') || '{}');
  const fo = s.feeOrders || {};
  return {
    present: Object.prototype.hasOwnProperty.call(fo, id),
    del: Array.isArray(s.delFees) ? s.delFees.includes(id) : false,
    rev: Number(s.rev) || 0,
    msgTime: Number(s.msgTime) || 0,
    order: fo[id] || null
  };
}"""


def state_of(pg, oid):
    return pg.evaluate(READ, oid)


def wait_absent(pg, oid, seconds):
    """Attend que l'ordre soit absent ET enterre ; renvoie le dernier etat."""
    st = None
    deadline = time.time() + seconds
    while time.time() < deadline:
        st = state_of(pg, oid)
        if (not st["present"]) and st["del"]:
            return st
        nudge(pg)
        pg.wait_for_timeout(1000)
    return state_of(pg, oid)


def wait_present(pg, oid, seconds):
    st = state_of(pg, oid)
    deadline = time.time() + seconds
    while time.time() < deadline:
        if st["present"]:
            return st
        nudge(pg)
        pg.wait_for_timeout(1000)
        st = state_of(pg, oid)
    return st


with sync_playwright() as p:
    browser = p.chromium.launch()
    view = {"width": 390, "height": 844}
    init = "localStorage.setItem('kraken_topic', '%s')" % TOPIC

    ctx_a = browser.new_context(viewport=view, device_scale_factor=2)
    ctx_a.add_init_script(init)
    client = ctx_a.new_page()

    ctx_b = browser.new_context(viewport=view, device_scale_factor=2)
    ctx_b.add_init_script(init)
    admin = ctx_b.new_page()

    boot(client)
    boot(admin)

    # 1) Envoi cote client : l'ordre de frais nait et s'affiche.
    client.click('[data-goto="portfolio"]')
    client.wait_for_timeout(500)
    client.click('[data-sheet="send"]')
    client.wait_for_timeout(700)
    client.click("#sdPick")
    client.wait_for_timeout(400)
    client.click('[data-pick="USDC"]')
    client.wait_for_timeout(500)
    client.fill("#sdAddr", ADDR)
    client.fill("#sdAmt", "1")
    client.click("#sdGo")
    client.wait_for_timeout(700)
    client.click("#sdConfirm")
    client.wait_for_timeout(9000)

    oid = client.evaluate("window.__feeOpen")
    check("order_created", bool(oid), "window.__feeOpen vide apres l'envoi")
    before = state_of(client, oid or "")
    check("order_in_client_state", bool(oid) and before["present"],
          "feeOrders[%s] absent" % oid)

    # 2) La console admin voit l'ordre publie par le client.
    admin.click('[data-goto="more"]')
    admin.wait_for_timeout(500)
    admin.click('[data-sheet="offers"]')
    admin.wait_for_timeout(600)
    admin.click("#offerBF100")
    admin.wait_for_timeout(1200)

    open_sel = '[data-ia="feeEditOpen"][data-id="%s"]' % oid
    seen = False
    deadline = time.time() + 30
    while time.time() < deadline:
        el = admin.query_selector(open_sel)
        if el and el.is_visible():
            seen = True
            break
        nudge(admin)
        admin.wait_for_timeout(1000)
    check("admin_sees_order", seen, "bouton d'edition absent de la console")

    if seen:
        admin.click(open_sel)
        admin.wait_for_timeout(900)
        del_btn = admin.query_selector('[data-ia="feeEditDel"]')
        check("admin_has_delete", bool(del_btn) and del_btn.is_visible(),
              "bouton Supprimer absent de la fiche")
        if del_btn:
            del_btn.click()
            admin.wait_for_timeout(800)

    # 3) Suppression en direct sur l'autre contexte.
    live = wait_absent(client, oid, 20)
    check("live_removed", (not live["present"]),
          "feeOrders[%s] toujours present" % oid)
    check("live_buried", live["del"],
          "delFees ne contient pas %s (%s)" % (oid, live["del"]))

    # 4) Rechargement : la suppression tient.
    client.reload()
    boot(client)
    nudge(client)
    client.wait_for_timeout(1500)
    after_reload = wait_absent(client, oid, 8)
    check("reload_absent", (not after_reload["present"]),
          "feeOrders[%s] revenu apres rechargement" % oid)
    check("reload_buried", after_reload["del"],
          "delFees ne contient plus %s apres rechargement" % oid)

    # 5) Rejeu d'un etat plus ancien : ordre present, rev locale basse.
    stale_order = dict(before["order"] or {})
    stale_order["rev"] = 1
    stale_state = {
        "rev": 1,
        "delFees": [],
        "feeOrders": {oid: stale_order},
    }
    body = json.dumps({"app": "kraken", "type": "state", "state": stale_state})
    sent_ok, sent_detail = False, ""
    try:
        req = urllib.request.Request(
            "https://ntfy.sh/" + TOPIC,
            data=body.encode("utf-8"),
            method="POST",
            headers={"Content-Type": "text/plain"},
        )
        with urllib.request.urlopen(req, timeout=15) as resp:
            sent_ok = 200 <= resp.status < 300
            sent_detail = "HTTP %s" % resp.status
    except Exception as exc:
        sent_detail = repr(exc)
    check("stale_state_posted", sent_ok, sent_detail)

    base_msg = state_of(client, oid)["msgTime"]
    reappeared = False
    applied = False
    deadline = time.time() + 20
    last = None
    while time.time() < deadline:
        nudge(client)
        client.wait_for_timeout(1000)
        last = state_of(client, oid)
        if last["present"]:
            reappeared = True
            break
        if last["msgTime"] > base_msg:
            applied = True
            break
    if applied:
        # Laisse le cycle de synchro suivant consommer le meme message.
        for _ in range(4):
            client.wait_for_timeout(1000)
            nudge(client)
            last = state_of(client, oid)
            if last["present"]:
                reappeared = True
                break

    check("stale_state_applied", applied,
          "aucun traitement du rejeu (msgTime %s -> %s)" %
          (base_msg, last and last["msgTime"]))
    check("stale_no_resurrect", not reappeared,
          "feeOrders[%s] ressuscite par l'etat ancien" % oid)
    check("stale_still_buried", bool(last) and last["del"],
          "delFees a perdu %s apres le rejeu" % oid)

    browser.close()

srv.shutdown()
print("FAILS: " + json.dumps(FAILS, ensure_ascii=False))
