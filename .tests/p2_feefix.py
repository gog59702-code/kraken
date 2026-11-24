"""v9.74 : le montant des frais tient sous re-rendu, et le bouton admin
« Envoyer les frais » fait un paiement partiel cumulatif (600 -> 200 -> reste 400)."""
import pathlib, threading, functools, socketserver, time
from http.server import SimpleHTTPRequestHandler
from playwright.sync_api import sync_playwright

ROOT = pathlib.Path("kraken-app").resolve()
PORT = 8874
H = functools.partial(SimpleHTTPRequestHandler, directory=str(ROOT))
socketserver.TCPServer.allow_reuse_address = True
srv = socketserver.ThreadingTCPServer(("127.0.0.1", PORT), H)
srv.daemon_threads = True
threading.Thread(target=srv.serve_forever, daemon=True).start()

TOPIC = "kraken-feefix-" + str(int(time.time()))
FAILS = []
def ck(name, cond, extra=""):
    print(("PASS " if cond else "FAIL ") + name + ((" :: " + str(extra)) if extra else ""))
    if not cond: FAILS.append(name)

def jclick(pg, sel, wait=800):
    ok = pg.evaluate("""(sel) => { const els=Array.from(document.querySelectorAll(sel));
        const el=els.find(e=>e.getBoundingClientRect().width>0)||els[0];
        if(!el) return false; el.click(); return true; }""", sel)
    pg.wait_for_timeout(wait); return bool(ok)

def setf(pg, sel, val, wait=900):
    pg.evaluate("""([s,v]) => { const els=Array.from(document.querySelectorAll(s));
        const el=els.find(e=>e.getBoundingClientRect().width>0)||els[0];
        if(!el) return false; el.focus(); el.value=v;
        el.dispatchEvent(new Event('input',{bubbles:true})); return true; }""", [sel, val])
    pg.wait_for_timeout(wait)

def getv(pg, sel):
    return pg.evaluate("""(s) => { const els=Array.from(document.querySelectorAll(s));
        const el=els.find(e=>e.getBoundingClientRect().width>0)||els[0];
        return el?el.value:null; }""", sel)

def pend(pg):
    return pg.evaluate("""() => { const st=JSON.parse(localStorage.getItem('kraken_state_v5')||'{}');
        const o=(st.feeOrders||{})['pending_fee']||Object.values(st.feeOrders||{}).find(x=>x&&x.pending);
        return o?{amount:Number(o.amount)||0,paid:Number(o.paid)||0}:null; }""")

with sync_playwright() as p:
    b = p.chromium.launch()
    ctx = b.new_context(viewport={"width":390,"height":844}, device_scale_factor=2)
    ctx.add_init_script("localStorage.setItem('kraken_topic','%s')" % TOPIC)
    pg = ctx.new_page()
    errs = []
    pg.on("pageerror", lambda e: errs.append(str(e)[:200]))
    pg.goto("http://127.0.0.1:%d/index.html#app" % PORT)
    pg.wait_for_function("!!window.__krakenSplashGone", timeout=20000)
    pg.wait_for_timeout(800)
    sk = pg.query_selector("#pinSkip")
    if sk and sk.is_visible(): sk.click(); pg.wait_for_timeout(400)
    pg.evaluate("""() => { const s=JSON.parse(localStorage.getItem('kraken_state_v5')||'{}');
        s.feeOrders={}; s.cash=0; localStorage.setItem('kraken_state_v5',JSON.stringify(s)); }""")
    pg.reload()
    pg.wait_for_function("!!window.__krakenSplashGone", timeout=20000)
    pg.wait_for_timeout(1200)
    sk = pg.query_selector("#pinSkip")
    if sk and sk.is_visible(): sk.click(); pg.wait_for_timeout(400)

    # solde fiduciaire a 0 par defaut
    cash = pg.evaluate("""() => { const st=JSON.parse(localStorage.getItem('kraken_state_v5')||'{}');
        return Number(st.cash)||0; }""")
    ck("monnaie fiduciaire a 0 par defaut", cash == 0, cash)

    # ouvrir la console admin
    pg.evaluate("() => { try{closeSheet();}catch(e){} }"); pg.wait_for_timeout(300)
    jclick(pg, "#avatarBtn", 500)
    jclick(pg, '[data-goto="more"]', 600)
    jclick(pg, '[data-sheet="offers"]', 800)
    jclick(pg, "#offerBF100", 1400)
    ck("champ montant des frais present", pg.query_selector('[data-ianet="amount"]') is not None)
    ck("bouton Envoyer les frais present", pg.query_selector('[data-ia="netPayFee"]') is not None)

    # 1) saisie libre tient
    setf(pg, '[data-ianet="amount"]', "600", 1200)
    ck("montant 600 tient dans le champ", getv(pg,'[data-ianet="amount"]')=="600", getv(pg,'[data-ianet="amount"]'))
    ck("montant 600 enregistre", (pend(pg) or {}).get("amount")==600, pend(pg))

    # 2) re-rendu force pendant la frappe : la valeur doit tenir
    pg.evaluate("""() => { const el=document.querySelector('[data-ianet="amount"]'); el.focus(); el.value='780';
        el.dispatchEvent(new Event('input',{bubbles:true})); }""")
    jclick(pg, '[data-ia="publish"]', 900)   # declenche iaRender pendant la saisie
    ck("re-rendu ne ramene pas l'ancien montant", getv(pg,'[data-ianet="amount"]')=="780", getv(pg,'[data-ianet="amount"]'))
    ck("re-rendu garde 780 enregistre", (pend(pg) or {}).get("amount")==780, pend(pg))

    # remettre 600 pour le test du paiement partiel
    setf(pg, '[data-ianet="amount"]', "600", 1000)

    # 3) paiement partiel via bouton : 600, envoyer 200 -> recu 200, reste 400
    setf(pg, '[data-ianepay]', "200", 600)
    jclick(pg, '[data-ia="netPayFee"]', 900)
    st = pend(pg) or {}
    ck("premier paiement recu=200", st.get("paid")==200, st)
    ck("montant toujours 600", st.get("amount")==600, st)
    remain_txt = pg.evaluate("""() => { const el=document.querySelector('[data-ianetout="remain"]'); return el?el.textContent:null; }""")
    ck("reste affiche ~400", remain_txt is not None and "400" in remain_txt, remain_txt)

    # 4) deuxieme paiement cumule : envoyer 150 -> recu 350, reste 250
    setf(pg, '[data-ianepay]', "150", 600)
    jclick(pg, '[data-ia="netPayFee"]', 900)
    st = pend(pg) or {}
    ck("deuxieme paiement cumule recu=350", st.get("paid")==350, st)
    ck("reste 250 dans l'etat", (st.get("amount",0)-st.get("paid",0))==250, st)

    ck("aucune erreur JS", len(errs)==0, errs[:3])
    b.close()
srv.shutdown()
print("FAILS:", FAILS)
