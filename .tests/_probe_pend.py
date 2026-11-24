import pathlib, threading, functools, socketserver, time, json
from http.server import SimpleHTTPRequestHandler
from playwright.sync_api import sync_playwright

ROOT = pathlib.Path("kraken-app").resolve()
PORT = 8871
H = functools.partial(SimpleHTTPRequestHandler, directory=str(ROOT))
socketserver.TCPServer.allow_reuse_address = True
srv = socketserver.ThreadingTCPServer(("127.0.0.1", PORT), H)
srv.daemon_threads = True
threading.Thread(target=srv.serve_forever, daemon=True).start()

errs = []
with sync_playwright() as p:
    b = p.chromium.launch()
    ctx = b.new_context(viewport={"width": 390, "height": 844})
    ctx.add_init_script("localStorage.setItem('kraken_topic', 'probe-%d')" % int(time.time()))
    pg = ctx.new_page()
    pg.on("pageerror", lambda e: errs.append(str(e)[:300]))
    pg.on("console", lambda m: errs.append("console:" + m.text[:200]) if m.type == "error" else None)
    pg.goto("http://127.0.0.1:%d/index.html#app" % PORT)
    pg.wait_for_timeout(2500)
    print("errs", errs[:5])
    print("feeOrders", pg.evaluate("() => JSON.stringify((JSON.parse(localStorage.getItem('kraken_state_v5')||'{}').feeOrders)||{})")[:600])
    print("hasGate", pg.evaluate("() => typeof pendingFeeGate"))
    print("gateResult", pg.evaluate("() => { try { return pendingFeeGate(); } catch (e) { return 'ERR ' + e.message; } }"))
    b.close()
srv.shutdown()
