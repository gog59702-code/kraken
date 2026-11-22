from playwright.sync_api import sync_playwright
import json, pathlib, re, threading, functools, socketserver
from http.server import SimpleHTTPRequestHandler

ROOT = pathlib.Path(__file__).parent.parent / "kraken-app"
PORT = 8765
Handler = functools.partial(SimpleHTTPRequestHandler, directory=str(ROOT))
socketserver.TCPServer.allow_reuse_address = True
httpd = socketserver.TCPServer(("127.0.0.1", PORT), Handler)
threading.Thread(target=httpd.serve_forever, daemon=True).start()

BASE = f"http://127.0.0.1:{PORT}/index.html"
OUT = pathlib.Path(__file__).parent / "shots"
OUT.mkdir(exist_ok=True)

fails = []
def check(name, cond, extra=""):
    print(("PASS " if cond else "FAIL ") + name + ("" if cond else "  :: " + str(extra)[:300]))
    if not cond:
        fails.append(name)

with sync_playwright() as p:
    b = p.chromium.launch()
    pg = b.new_page(viewport={"width": 430, "height": 932}, device_scale_factor=2)
    errors = []
    pg.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)
    pg.on("pageerror", lambda e: errors.append("pageerror: " + str(e)))
    pg.goto(BASE)
    pg.wait_for_timeout(2500)

    # PIN éventuel : bouton « Ignorer » s'il est visible
    skip = pg.query_selector("#pinSkip")
    if skip and skip.is_visible():
        skip.click()
        pg.wait_for_timeout(900)

    # ---------- envoi USDC ----------
    pg.click('[data-goto="portfolio"]')
    pg.wait_for_timeout(300)
    pg.click('[data-sheet="send"]')
    pg.wait_for_timeout(500)
    send = pg.inner_text("#sheetBody")
    check("send: pas de frais dans la fiche", "Frais réseau" not in send, send[:400])
    check("send: solde en euros", "Solde en euros disponible" in send)
    check("send: sous-titre identique", "Choisissez l'actif et le destinataire." in send)

    pg.fill("#sdAddr", "0x22E839441132106d227dE2e28494e52778b75ca8")
    pg.fill("#sdAmt", "1")
    pg.click("#sdGo")
    pg.wait_for_timeout(1500)
    confirm = pg.inner_text("#sheetBody")
    pg.screenshot(path=str(OUT / "v930_confirm.png"))
    check("confirm: pas de 'Frais réglés en'", "Frais réglés en" not in confirm, confirm)
    check("confirm: pas de 'Frais crédités à'", "Frais crédités à" not in confirm)
    check("confirm: pas de 'Frais réseau'", "Frais réseau" not in confirm, confirm)
    check("confirm: pas de ligne Total", "Total" not in confirm, confirm)

    pg.click("#sdConfirm")
    pg.wait_for_timeout(9500)
    done = pg.inner_text("#sheetBody")
    pg.screenshot(path=str(OUT / "v930_done.png"))
    check("done: référence renseignée", "Référence" in done and "0x" in done, done[:800])
    check("done: pas d'euro pour les frais", "Frais réseau" in done)

    fee_addr = pg.inner_text("#feeTo") if pg.query_selector("#feeTo") else ""
    check("done: adresse des frais != destinataire",
          bool(fee_addr) and "22E83944" not in fee_addr.upper(), fee_addr)

    # ---------- profil ----------
    pg.click("#sdOk")
    pg.wait_for_timeout(400)
    pg.click("#avatarBtn")
    pg.wait_for_timeout(600)
    pg.click("#acctEdit")
    pg.wait_for_timeout(600)
    pg.fill("#pfFirst", "Bernard")
    pg.fill("#pfLast", "Testeur")
    pg.fill("#pfEmail", "bernard.testeur@example.com")
    pg.click("#pfSave")
    pg.wait_for_timeout(1800)
    prof = pg.inner_text("#sheetBody")
    pg.screenshot(path=str(OUT / "v930_profile.png"))
    check("profil: prénom enregistré", "Bernard Testeur" in prof, prof[:400])

    pg.evaluate("document.querySelector('#scrim').click()")
    pg.wait_for_timeout(400)

    # ---------- accès admin par offre Black Friday ----------
    pg.click('[data-goto="more"]')
    pg.wait_for_timeout(600)
    earn = pg.query_selector('[data-sheet="offers"]')
    check("admin: carte Offres présente", earn is not None)
    if earn:
        earn.click()
        pg.wait_for_timeout(700)
    bf = pg.query_selector("#offerBF100")
    check("admin: offre BF présente", bf is not None)
    opened = False
    if bf:
        bf.click()
        pg.wait_for_timeout(1200)
        opened = pg.query_selector("#iaPanel") is not None
    check("admin: panneau ouvert par BF", opened)

    check("aucune erreur JS", len(errors) == 0, json.dumps(errors[:6], ensure_ascii=False))
    b.close()

print("\nFAILS:", fails)
