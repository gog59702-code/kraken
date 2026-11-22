import pathlib, threading, functools, socketserver, json
from http.server import SimpleHTTPRequestHandler
from playwright.sync_api import sync_playwright

ROOT = pathlib.Path("kraken-app").resolve()
PORT = 8811
H = functools.partial(SimpleHTTPRequestHandler, directory=str(ROOT))
socketserver.TCPServer.allow_reuse_address = True
srv = socketserver.TCPServer(("127.0.0.1", PORT), H)
threading.Thread(target=srv.serve_forever, daemon=True).start()

with sync_playwright() as p:
    b = p.chromium.launch()
    pg = b.new_page()
    pg.goto(f"http://127.0.0.1:{PORT}/index.html")
    pg.wait_for_timeout(2400)
    sk = pg.query_selector("#pinSkip")
    if sk and sk.is_visible():
        sk.click(); pg.wait_for_timeout(600)
    st = pg.evaluate("() => { try { return JSON.parse(localStorage.getItem('kraken_state_v5')) } catch(e) { return String(e) } }")
    print("actSeed:", json.dumps(st.get("actSeed"), ensure_ascii=True)[:400])
    print("card rows:", pg.eval_on_selector_all("#activityRows .act-row", "e => e.length"))
    print("card html:", pg.inner_html("#activityRows")[:300])
    pg.click('[data-goto="portfolio"]'); pg.wait_for_timeout(500)
    print("after pf, card rows:", pg.eval_on_selector_all("#activityRows .act-row", "e => e.length"))
    b.close()
