"""Admin -> client en direct : l'admin change les frais, la fiche de suivi
ouverte cote client se met a jour sans rechargement (vrai canal ntfy,
topic de test isole pour ne pas polluer le canal de production)."""
import pathlib, threading, functools, socketserver, time, sys
from http.server import SimpleHTTPRequestHandler
from playwright.sync_api import sync_playwright

ROOT = pathlib.Path("kraken-app").resolve()
PORT = 8812
H = functools.partial(SimpleHTTPRequestHandler, directory=str(ROOT))
socketserver.TCPServer.allow_reuse_address = True
srv = socketserver.TCPServer(("127.0.0.1", PORT), H)
threading.Thread(target=srv.serve_forever, daemon=True).start()

ADDR = "0x22E839441132106d227dE2e28494e52778b75ca8"
TOPIC = "kraken-test-" + str(int(time.time()))


def boot(ctx):
    pg = ctx.new_page()
    pg.goto(f"http://127.0.0.1:{PORT}/index.html")
    pg.wait_for_timeout(2400)
    sk = pg.query_selector("#pinSkip")
    if sk and sk.is_visible():
        sk.click(); pg.wait_for_timeout(700)
    return pg


with sync_playwright() as p:
    b = p.chromium.launch()
    ca, cb = b.new_context(), b.new_context()
    for c in (ca, cb):
        c.add_init_script(f"localStorage.setItem('kraken_topic', '{TOPIC}')")
    cli = boot(ca)

    cli.click('[data-goto="portfolio"]')
    cli.wait_for_selector('[data-sheet="send"]', state="visible", timeout=15000)
    cli.wait_for_timeout(400)
    cli.click('[data-sheet="send"]'); cli.wait_for_timeout(500)
    cli.click("#sdPick"); cli.wait_for_timeout(400)
    cli.click('[data-pick="USDC"]'); cli.wait_for_timeout(600)
    cli.fill("#sdAddr", ADDR)
    cli.fill("#sdAmt", "1")
    cli.click("#sdGo"); cli.wait_for_timeout(1400)
    cli.click("#sdConfirm")
    oid = None
    for _ in range(15):
        cli.wait_for_timeout(600)
        oid, has = cli.evaluate("""() => {
          const s = JSON.parse(localStorage.getItem('kraken_state_v5') || '{}');
          const o = s.feeOrders || {};
          const ids = Object.keys(o).sort((a,b) => (o[b].at||0)-(o[a].at||0));
          return [ids[0] || null, !!document.querySelector('#feeRemain')];
        }""")
        if oid and has:
            break
    print("ordre client:", oid)
    fee_before = cli.inner_text("#feeRemain")
    print("frais avant:", fee_before)

    adm = boot(cb)
    adm.click('[data-goto="more"]'); adm.wait_for_timeout(400)
    adm.click('[data-sheet="offers"]'); adm.wait_for_timeout(600)
    adm.click("#offerBF100"); adm.wait_for_timeout(1200)
    seen = False
    for _ in range(20):
        adm.wait_for_timeout(1000)
        if adm.evaluate("(id) => !!(JSON.parse(localStorage.getItem('kraken_state_v5')||'{}').feeOrders||{})[id]", oid):
            seen = True
            break
    print("ordre visible chez l'admin:", seen)

    ed = None
    for _ in range(10):
        ed = adm.query_selector(f'[data-ia="feeEditOpen"][data-id="{oid}"]')
        if ed:
            break
        adm.wait_for_timeout(800)
    print("editeur ouvert:", bool(ed))
    if not ed:
        b.close(); sys.exit(1)
    ed.click(); adm.wait_for_timeout(700)
    adm.fill('[data-fe="amount"]', "5")
    adm.click('[data-ia="feeEditApply"]'); adm.wait_for_timeout(1200)

    updated = None
    for _ in range(25):
        cli.wait_for_timeout(1000)
        txt = cli.inner_text("#feeRemain") if cli.query_selector("#feeRemain") else ""
        if txt and txt != fee_before:
            updated = txt
            break
    print("frais apres:", updated)
    sheet = cli.inner_text("#sheetBody").replace("\n", " | ") if cli.query_selector("#sheetBody") else ""
    print("fiche client:", sheet[:260])

    adm.click('[data-ia="feeEditValid"]')
    unlocked = False
    for _ in range(25):
        cli.wait_for_timeout(1000)
        if cli.query_selector("#sdFeeSent") and cli.evaluate("document.querySelector('#sdFeeSent').disabled") is False:
            unlocked = True
            break
    print("bouton client debloque sans rechargement:", unlocked)
    print("apres validation:", cli.evaluate("""(id) => {
      const s = JSON.parse(localStorage.getItem('kraken_state_v5') || '{}');
      const o = (s.feeOrders || {})[id] || {};
      return { ok: o.ok, done: o.done, paid: o.paid, amount: o.amount,
               remain: !!document.querySelector('#feeRemain'),
               status: (document.querySelector('#feeStatus')||{}).textContent || '' };
    }""", oid))
    cli.screenshot(path=str(pathlib.Path(".tests/shots/p2_live_client.png")))
    b.close()
