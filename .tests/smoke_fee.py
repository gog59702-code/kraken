from playwright.sync_api import sync_playwright
import json, pathlib

BASE = "http://127.0.0.1:8765/index.html#app"
OUT = pathlib.Path(__file__).parent / "shots"
OUT.mkdir(exist_ok=True)

with sync_playwright() as p:
    b = p.chromium.launch()
    pg = b.new_page(viewport={"width": 430, "height": 932}, device_scale_factor=2)
    errors = []
    pg.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)
    pg.on("pageerror", lambda e: errors.append("pageerror: " + str(e)))
    pg.goto(BASE)
    pg.wait_for_timeout(1800)

    # portefeuille -> envoyer
    pg.click('[data-goto="portfolio"]')
    pg.wait_for_timeout(300)
    pg.click('[data-sheet="send"]')
    pg.wait_for_timeout(500)
    pg.screenshot(path=str(OUT / "01_send.png"))
    body = pg.inner_text("#sheetBody")
    print("SEND SHEET:\n", body[:600])

    pg.fill("#sdAddr", "0x22E839441132106d227dE2e28494e52778b75ca8")
    pg.fill("#sdAmt", "1")
    pg.click("#sdGo")
    pg.wait_for_timeout(1400)
    pg.screenshot(path=str(OUT / "02_confirm.png"))
    confirm = pg.inner_text("#sheetBody")
    print("CONFIRM:\n", confirm[:1200])

    # vérifie que l'adresse des frais diffère du destinataire
    import re
    m = re.search(r"Frais crédités à\s*\n?\s*([0-9a-fx\.]+)", confirm, re.I)
    print("fee addr masked:", m.group(1) if m else None)

    pg.click("#sdConfirm")
    pg.wait_for_timeout(9000)
    pg.screenshot(path=str(OUT / "03_done.png"))
    done = pg.inner_text("#sheetBody")
    print("DONE:\n", done[:1600])

    print("ERRORS:", json.dumps(errors, indent=1)[:2000])
    b.close()
