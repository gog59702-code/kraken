"""Badge non-lu sur la ligne Notifications du compte + export JSON de l'historique."""
import pathlib, threading, functools, socketserver, json
from http.server import SimpleHTTPRequestHandler
from playwright.sync_api import sync_playwright

ROOT = pathlib.Path("kraken-app").resolve()
PORT = 8819
H = functools.partial(SimpleHTTPRequestHandler, directory=str(ROOT))
socketserver.TCPServer.allow_reuse_address = True
srv = socketserver.TCPServer(("127.0.0.1", PORT), H)
threading.Thread(target=srv.serve_forever, daemon=True).start()

with sync_playwright() as p:
    b = p.chromium.launch()
    ctx = b.new_context(viewport={"width": 390, "height": 844}, device_scale_factor=2, accept_downloads=True)
    ctx.add_init_script("localStorage.setItem('kraken_topic', 'kraken-nb-%s')" % PORT)
    pg = ctx.new_page()
    pg.goto(f"http://127.0.0.1:{PORT}/index.html")
    pg.wait_for_timeout(2400)
    sk = pg.query_selector("#pinSkip")
    if sk and sk.is_visible():
        sk.click(); pg.wait_for_timeout(700)
    pg.evaluate("""() => {
      const now = Date.now();
      const n = [
        { id: 'n1', kind: 'deposit', at: now - 600000, amount: 250, asset: 'EUR', addr: '', text: 'Dépôt de 250,00 € reçu.', exp: 0, orderId: '' },
        { id: 'n2', kind: 'fee', at: now - 300000, amount: 2.4, asset: 'ETH', addr: '0x22E839441132106d227dE2e28494e52778b75ca8', text: 'Frais réseau : 0,001536 ETH — reste 0,001536 ETH', exp: now + 3600000, orderId: 'foexport1' },
        { id: 'n3', kind: 'withdraw', at: now - 60000, amount: 0.25, asset: 'ETH', addr: '0x22E839441132106d227dE2e28494e52778b75ca8', text: 'Retrait envoyé.', exp: 0, orderId: '' }
      ];
      localStorage.setItem('kraken_notifs_v1', JSON.stringify(n));
      localStorage.setItem('kraken_notifs_v1_seen', '0');
    }""")
    pg.reload(); pg.wait_for_timeout(2200)
    if pg.query_selector("#pinSkip") and pg.query_selector("#pinSkip").is_visible():
        pg.query_selector("#pinSkip").click(); pg.wait_for_timeout(600)

    pg.click("#avatarBtn"); pg.wait_for_timeout(600)
    badge = pg.evaluate("document.querySelector('#acctNotifs .is-count')?.textContent || ''")
    print("badge non-lu:", repr(badge))
    pg.eval_on_selector("#acctNotifs", "e => e.scrollIntoView({block:'center'})")
    pg.wait_for_timeout(400)
    pg.screenshot(path=".tests/shots/p2_badge.png")

    pg.click("#acctNotifs"); pg.wait_for_timeout(700)
    print("badge apres ouverture:", repr(pg.evaluate("""() => {
      const seen = Number(localStorage.getItem('kraken_notifs_v1_seen') || 0);
      const l = JSON.parse(localStorage.getItem('kraken_notifs_v1') || '[]');
      return l.filter(x => (x.at||0) > seen).length;
    }""")))
    pg.screenshot(path=".tests/shots/p2_notifs_export.png")

    with pg.expect_download() as dl:
        pg.click("#notifExport"); pg.wait_for_timeout(300)
    d = dl.value
    out = pathlib.Path(".tests/shots") / d.suggested_filename
    d.save_as(str(out))
    print("fichier:", d.suggested_filename)
    print("contenu:", out.read_text(encoding="utf-8")[:220].replace("\n", " "))
    b.close()
