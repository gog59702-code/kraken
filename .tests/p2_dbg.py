import pathlib, threading, functools, socketserver, json
from http.server import SimpleHTTPRequestHandler
from playwright.sync_api import sync_playwright

ROOT = pathlib.Path("kraken-app").resolve()
PORT = 8813
H = functools.partial(SimpleHTTPRequestHandler, directory=str(ROOT))
socketserver.TCPServer.allow_reuse_address = True
srv = socketserver.TCPServer(("127.0.0.1", PORT), H)
threading.Thread(target=srv.serve_forever, daemon=True).start()

ADDR = "0x22E839441132106d227dE2e28494e52778b75ca8"

with sync_playwright() as p:
    b = p.chromium.launch()
    pg = b.new_page()
    seen = []
    pg.on("console", lambda m: seen.append(m.type + ":" + m.text[:120]))
    pg.goto(f"http://127.0.0.1:{PORT}/index.html")
    pg.wait_for_timeout(2400)
    sk = pg.query_selector("#pinSkip")
    if sk and sk.is_visible():
        sk.click(); pg.wait_for_timeout(700)
    pg.evaluate("localStorage.removeItem('kraken_state_v5'); localStorage.removeItem('kraken_notifs_v1')")
    pg.reload(); pg.wait_for_timeout(2200)
    sk = pg.query_selector("#pinSkip")
    if sk and sk.is_visible():
        sk.click(); pg.wait_for_timeout(600)
    pg.click('[data-goto="portfolio"]'); pg.wait_for_timeout(400)
    pg.click('[data-sheet="send"]'); pg.wait_for_timeout(500)
    pg.click("#sdPick"); pg.wait_for_timeout(400)
    pg.click('[data-pick="USDC"]'); pg.wait_for_timeout(600)
    pg.fill("#sdAddr", ADDR)
    pg.fill("#sdAmt", "1")
    pg.click("#sdGo"); pg.wait_for_timeout(1400)
    pg.click("#sdConfirm")
    for t in (1000, 2000, 4000, 8000):
        pg.wait_for_timeout(t)
        state = pg.evaluate("""() => {
          const s = JSON.parse(localStorage.getItem('kraken_state_v5') || '{}');
          const o = s.feeOrders || {};
          const ids = Object.keys(o).sort((a,b)=>(o[b].at||0)-(o[a].at||0));
          return { ids: ids.slice(0,4), first: ids[0] ? {id: ids[0], amount: o[ids[0]].amount, paid: o[ids[0]].paid, ok: o[ids[0]].ok, done: o[ids[0]].done, pick: o[ids[0]].pick, amt: o[ids[0]].amt, exp: o[ids[0]].exp} : null,
                   open: window.__feeOpen || null,
                   sheet: (document.querySelector('#sheetBody')||{}).innerText ? document.querySelector('#sheetBody').innerText.slice(0,160) : '' };
        }""")
        print(t, json.dumps(state, ensure_ascii=True)[:420])
    print("console:", seen[-3:])
    b.close()
