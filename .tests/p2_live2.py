"""Deux contextes = deux appareils. L'admin modifie un ordre de frais,
le client doit le voir bouger sans recharger (SSE ntfy, topic isole)."""
import functools
import http.server
import json
import socketserver
import threading
import time

from playwright.sync_api import sync_playwright

ROOT = r"C:\Users\User\ia\kraken-app"
PORT = 8831
TOPIC = "kraken-live2-%d" % int(time.time())
ADDR = "0x22E839441132106d227dE2e28494e52778b75ca8"

fails, passes = [], []
NET = []


def check(name, cond, detail=""):
    if cond:
        passes.append(name)
        print("PASS", name)
    else:
        fails.append(name + (" :: " + detail if detail else ""))
        print("FAIL", name, "::", detail)


def log_req(tag, kind, info, url):
    if "ntfy.sh" in url:
        NET.append((tag, kind, info, url[:100]))


class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *a, **k):
        super().__init__(*a, directory=ROOT, **k)

    def log_message(self, *a):
        pass


class Q(socketserver.TCPServer):
    allow_reuse_address = True


srv = Q(("127.0.0.1", PORT), Handler)
threading.Thread(target=srv.serve_forever, daemon=True).start()
time.sleep(0.4)

INIT = "localStorage.setItem('kraken_topic', %s);" % json.dumps(TOPIC)


def boot(ctx, tag):
    pg = ctx.new_page()
    errs = []
    pg.on("pageerror", lambda e: errs.append("pageerror " + str(e)[:200]))
    pg.on("request", lambda r: log_req(tag, "REQ", r.method, r.url))
    pg.on("response", lambda r: log_req(tag, "RES", r.status, r.url))
    pg.on("requestfailed", lambda r: log_req(tag, "FAIL", str(r.failure)[:60], r.url))
    pg.goto("http://127.0.0.1:%d/index.html" % PORT)
    pg.wait_for_timeout(2400)
    if pg.is_visible("#pinSkip"):
        pg.click("#pinSkip")
        pg.wait_for_timeout(700)
    # attendre la fin du splash avant de toucher la navigation
    for _ in range(30):
        if pg.evaluate("!!window.__krakenSplashGone"):
            break
        pg.wait_for_timeout(200)
    pg.wait_for_timeout(500)
    return pg, errs


def wait_val(pg, sel, limit=25):
    t0 = time.time()
    last = ""
    while time.time() - t0 < limit:
        try:
            last = pg.inner_text(sel)
        except Exception:
            last = ""
        if last:
            return last, round(time.time() - t0, 1)
        time.sleep(0.5)
    return last, limit


with sync_playwright() as p:
    br = p.chromium.launch()

    def mk():
        c = br.new_context(viewport={"width": 390, "height": 844}, device_scale_factor=2)
        c.add_init_script(INIT)
        return c

    ca, cb = mk(), mk()
    pa, ea = boot(ca, "A")
    pb, eb = boot(cb, "B")
    check("aucune erreur JS au chargement", not ea and not eb, str(ea + eb)[:300])
    check("SSE ouvert sur les deux appareils",
          any(n[0] == "B" and "sse" in n[3] for n in NET)
          and any(n[0] == "A" and "sse" in n[3] for n in NET), str(NET[:6]))

    # client : envoi reel -> la fiche de suivi s'ouvre sur son ordre
    pb.click('[data-goto="portfolio"]')
    pb.wait_for_selector('[data-sheet="send"]', state="visible", timeout=15000)
    pb.wait_for_timeout(400)
    pb.click('[data-sheet="send"]')
    pb.wait_for_timeout(500)
    pb.click("#sdPick")
    pb.wait_for_timeout(300)
    pb.click('[data-pick="USDC"]')
    pb.fill("#sdAddr", ADDR)
    pb.fill("#sdAmt", "1")
    pb.click("#sdGo")
    pb.wait_for_timeout(400)
    pb.click("#sdConfirm")
    pb.wait_for_timeout(9000)
    oid = pb.evaluate("window.__feeOpen")
    check("fiche de suivi ouverte", bool(oid), str(oid))
    before = pb.inner_text("#feeRemain2") if pb.is_visible("#feeRemain2") else pb.inner_text("#feeAmount")
    pb.evaluate("window.__marker = 1")

    # admin : editer le montant de cet ordre
    pa.click('[data-goto="more"]')
    pa.wait_for_timeout(400)
    pa.click('[data-sheet="offers"]')
    pa.wait_for_timeout(600)
    pa.click("#offerBF100")
    pa.wait_for_timeout(1200)
    sel = '[data-ia="feeEditOpen"][data-id="%s"]' % oid
    pa.eval_on_selector(sel, "el => el.scrollIntoView({block:'center'})")
    pa.click(sel)
    pa.wait_for_timeout(600)
    pa.fill('[data-fe="amount"]', "12")
    pa.click('[data-ia="feeEditApply"]')
    t_apply = time.time()

    # client : attendre le changement, sans toucher a la page
    after, waited = before, 0
    while time.time() - t_apply < 25:
        try:
            after = pb.inner_text("#feeRemain2") if pb.is_visible("#feeRemain2") else pb.inner_text("#feeAmount")
        except Exception:
            after = ""
        if after and after != before:
            waited = round(time.time() - t_apply, 1)
            break
        time.sleep(0.5)

    check("mise a jour sans reload", after != before, "avant=%r apres=%r" % (before, after))
    check("nouveau montant en unites de chaine", "ETH" in after and "Offerts" not in after, after)
    check("equivalent 12 EUR", "12,00" in after or "12" in after, after)
    check("aucun rechargement", pb.evaluate("window.__marker") == 1)

    st = json.loads(pb.evaluate("localStorage.getItem('kraken_state_v5') || '{}'"))
    o = (st.get("feeOrders") or {}).get(oid or "", {})
    check("ordre client reprixe (12 EUR)", abs(float(o.get("amount") or 0) - 12) < 0.01,
          str(o.get("amount")))
    print("LATENCE", waited, "s")
    print("POSTS", [n for n in NET if n[1] == "REQ" and "POST" in n[2]])

    br.close()
srv.shutdown()
print("FAILS:", fails)
