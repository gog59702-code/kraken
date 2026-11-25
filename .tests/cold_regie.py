"""Vérification à froid du site publié : app 9.81 et page Régie."""
from playwright.sync_api import sync_playwright

BASE = "https://gog59702-code.github.io/kraken/"
errs = []

with sync_playwright() as p:
    b = p.chromium.launch()
    ctx = b.new_context()
    pg = ctx.new_page()
    pg.on("pageerror", lambda e: errs.append("app: " + str(e)))
    pg.goto(BASE + "index.html#app", wait_until="load", timeout=60000)
    pg.wait_for_function("!!window.__krakenBooted", timeout=30000)
    pg.wait_for_timeout(1500)
    print("app booted:", pg.evaluate("() => window.__krakenBooted"))
    print("version:", pg.evaluate("() => (document.querySelector('script[src*=\"app.js\"]')||{}).src"))

    rg = ctx.new_page()
    rg.on("pageerror", lambda e: errs.append("regie: " + str(e)))
    rg.goto(BASE + "regie.html", wait_until="load", timeout=60000)
    rg.wait_for_timeout(1200)
    print("regie title:", rg.title())
    print("regie addr:", rg.input_value("#fAddr"))
    print("regie status:", rg.text_content("#status"))
    print("errors:", errs)
    b.close()
