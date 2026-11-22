"""Le grand livre suit les envois : l'actif envoyé baisse à la diffusion,
les frais réseau baissent une seule fois à la validation admin."""
import pathlib, threading, functools, socketserver, time
from http.server import SimpleHTTPRequestHandler
from playwright.sync_api import sync_playwright

ROOT = pathlib.Path("kraken-app").resolve()
PORT = 8831
H = functools.partial(SimpleHTTPRequestHandler, directory=str(ROOT))
socketserver.TCPServer.allow_reuse_address = True
srv = socketserver.TCPServer(("127.0.0.1", PORT), H)
threading.Thread(target=srv.serve_forever, daemon=True).start()

ORD = "foledger1"
ADDR = "0x22E839441132106d227dE2e28494e52778b75ca8"
FEE_ADDR = "0x9F1e3A2b7C4d5E6f708192A3b4C5d6E7f8091a2b"

READ = """() => {
  const s = JSON.parse(localStorage.getItem('kraken_state_v5') || '{}');
  return { eth: Number((s.balances||{}).ETH || 0), usdc: Number((s.balances||{}).USDC || 0) };
}"""

with sync_playwright() as p:
    b = p.chromium.launch()
    ctx = b.new_context(viewport={"width": 390, "height": 844}, device_scale_factor=2)
    ctx.add_init_script("localStorage.setItem('kraken_topic', 'kraken-led-%s')" % int(time.time()))
    pg = ctx.new_page()
    pg.goto(f"http://127.0.0.1:{PORT}/index.html")
    pg.wait_for_timeout(2300)
    if pg.query_selector("#pinSkip") and pg.query_selector("#pinSkip").is_visible():
        pg.query_selector("#pinSkip").click(); pg.wait_for_timeout(600)

    # 0) Soldes connus : l'état est écrit explicitement, sinon rien n'est
    # encore persisté et la lecture localStorage renverrait des zéros.
    pg.evaluate("""() => {
      const s = JSON.parse(localStorage.getItem('kraken_state_v5') || '{}');
      s.balances = Object.assign({}, s.balances || {}, { ETH: 0.05, USDC: 10 });
      s.feeOrders = s.feeOrders || {};
      localStorage.setItem('kraken_state_v5', JSON.stringify(s));
    }""")
    pg.reload(); pg.wait_for_timeout(2300)
    if pg.query_selector("#pinSkip") and pg.query_selector("#pinSkip").is_visible():
        pg.query_selector("#pinSkip").click(); pg.wait_for_timeout(600)

    # 1) Envoi complet depuis l'app : l'actif envoyé doit baisser à la diffusion.
    start = pg.evaluate(READ)
    print("depart:", start)
    pg.click('[data-goto="portfolio"]'); pg.wait_for_timeout(500)
    pg.click('[data-sheet="send"]'); pg.wait_for_timeout(700)
    pg.click("#sdPick"); pg.wait_for_timeout(400)
    pg.click('[data-pick="USDC"]'); pg.wait_for_timeout(500)
    pg.fill("#sdAddr", ADDR)
    pg.fill("#sdAmt", "1")
    pg.click("#sdGo"); pg.wait_for_timeout(700)
    pg.click("#sdConfirm")
    pg.wait_for_timeout(13000)
    after_send = pg.evaluate(READ)
    print("apres diffusion:", after_send, "| usdc -1:", round(start["usdc"] - after_send["usdc"], 6))
    print("fiche:", pg.evaluate("document.querySelector('#sheetBody .sheet-title')?.textContent"))

    # ordre cree par cet envoi : on le force valide comme le ferait la console
    oid = pg.evaluate("window.__feeOpen")
    print("ordre:", oid)
    before_fee = pg.evaluate(READ)
    pg.evaluate("""(id) => {
      const s = JSON.parse(localStorage.getItem('kraken_state_v5') || '{}');
      const o = s.feeOrders[id];
      o.amount = 2.4; o.paid = 2.4; o.ok = true; o.rev = (o.rev||0) + 5;
      o.statusTxt = 'Frais réseaux réglés';
      localStorage.setItem('kraken_state_v5', JSON.stringify(s));
    }""", oid)
    pg.reload(); pg.wait_for_timeout(2300)
    if pg.query_selector("#pinSkip") and pg.query_selector("#pinSkip").is_visible():
        pg.query_selector("#pinSkip").click(); pg.wait_for_timeout(600)
    after_fee = pg.evaluate(READ)
    print("frais debites:", round(before_fee["eth"] - after_fee["eth"], 8), "attendu ~0.001536")

    # 2) Un second chargement ne doit pas debiter deux fois.
    pg.reload(); pg.wait_for_timeout(2300)
    if pg.query_selector("#pinSkip") and pg.query_selector("#pinSkip").is_visible():
        pg.query_selector("#pinSkip").click(); pg.wait_for_timeout(600)
    again = pg.evaluate(READ)
    print("pas de double debit:", abs(again["eth"] - after_fee["eth"]) < 1e-9, again["eth"])

    # 3) Validation depuis l'app : statut confirme, solde inchange.
    pg.click("#avatarBtn"); pg.wait_for_timeout(500)
    pg.eval_on_selector("#acctNotifs", "e => e.scrollIntoView({block:'center'})")
    pg.wait_for_timeout(300)
    pg.click("#acctNotifs"); pg.wait_for_timeout(700)
    pg.click(f'[data-notiforder="{oid}"]'); pg.wait_for_timeout(900)
    print("bouton actif:", pg.evaluate("!!document.querySelector('#sdFeeSent') && !document.querySelector('#sdFeeSent').disabled"))
    pg.click("#sdFeeSent"); pg.wait_for_timeout(1200)
    print("statut:", pg.evaluate("document.querySelector('#feeStatus')?.textContent"))
    end = pg.evaluate(READ)
    print("solde inchange a la validation:", abs(end["eth"] - again["eth"]) < 1e-9, end["eth"])
    b.close()
