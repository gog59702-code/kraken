import pathlib, threading, functools, socketserver, json
from http.server import SimpleHTTPRequestHandler
from playwright.sync_api import sync_playwright

ROOT = pathlib.Path("kraken-app").resolve()
PORT = 8794
H = functools.partial(SimpleHTTPRequestHandler, directory=str(ROOT))
socketserver.TCPServer.allow_reuse_address = True
srv = socketserver.TCPServer(("127.0.0.1", PORT), H)
threading.Thread(target=srv.serve_forever, daemon=True).start()

with sync_playwright() as p:
    b = p.chromium.launch()
    pg = b.new_page(viewport={"width": 430, "height": 932})
    pg.goto(f"http://127.0.0.1:{PORT}/index.html")
    pg.wait_for_timeout(2600)
    info = pg.evaluate("""() => {
      const out = [];
      document.querySelectorAll('[data-sheet]').forEach(e => {
        const r = e.getBoundingClientRect();
        out.push([e.dataset.sheet, Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height),
                  getComputedStyle(e).display, (e.closest('.view')||{}).dataset ? e.closest('.view').dataset.view : '?']);
      });
      return out;
    }""")
    for row in info:
        print(row)
    b.close()
