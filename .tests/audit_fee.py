"""Visual audit: fee tracking sheet, dark + light, pending + validated."""
import pathlib, threading, functools, socketserver, json, sys, io
from http.server import SimpleHTTPRequestHandler
from playwright.sync_api import sync_playwright

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")

ROOT = pathlib.Path("kraken-app").resolve()
PORT = 8833
H = functools.partial(SimpleHTTPRequestHandler, directory=str(ROOT))
socketserver.TCPServer.allow_reuse_address = True
srv = socketserver.TCPServer(("127.0.0.1", PORT), H)
threading.Thread(target=srv.serve_forever, daemon=True).start()

ORDER_ID = "foaudit1"
ADDR = "0x22E839441132106d227dE2e28494e52778b75ca8"
FEEADDR = "0x9F2b7C41dA8e33B5c0D6f1A2e4B87c3D5f6A9B01"

DIAG_JS = r"""
() => {
  const parseRGB = s => {
    const m = s.match(/rgba?\(([^)]+)\)/);
    if (!m) return null;
    const p = m[1].split(/[ ,\/]+/).filter(Boolean).map(Number);
    return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 };
  };
  const lum = c => {
    const f = v => { v /= 255; return v <= 0.03928 ? v/12.92 : Math.pow((v+0.055)/1.055, 2.4); };
    return 0.2126*f(c.r) + 0.7152*f(c.g) + 0.0722*f(c.b);
  };
  const blend = (fg, bg) => ({
    r: fg.r*fg.a + bg.r*(1-fg.a),
    g: fg.g*fg.a + bg.g*(1-fg.a),
    b: fg.b*fg.a + bg.b*(1-fg.a), a: 1
  });
  const bgOf = el => {
    let n = el;
    while (n && n.nodeType === 1) {
      const c = parseRGB(getComputedStyle(n).backgroundColor);
      if (c && c.a > 0.01) return c;
      n = n.parentElement;
    }
    return { r: 255, g: 255, b: 255, a: 1 };
  };
  const out = { low: [], clipped: [], overflow: [], invisible: [] };
  const vw = innerWidth, vh = innerHeight;
  const walk = document.querySelectorAll("body *");
  for (const el of walk) {
    const cs = getComputedStyle(el);
    if (cs.display === "none" || cs.visibility === "hidden" || Number(cs.opacity) === 0) continue;
    const r = el.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) continue;
    const text = Array.from(el.childNodes)
      .filter(n => n.nodeType === 3).map(n => n.textContent.trim()).join(" ").trim();
    if (r.right > vw + 1 || r.left < -1) {
      out.clipped.push({ tag: el.tagName, cls: el.className && el.className.toString().slice(0,60),
        txt: (el.textContent||"").trim().slice(0,60), left: Math.round(r.left), right: Math.round(r.right), vw });
    }
    if (!text) continue;
    const fg = parseRGB(cs.color);
    if (!fg) continue;
    const bg = bgOf(el);
    const comp = blend(fg, bg);
    const L1 = lum(comp), L2 = lum(bg);
    const ratio = (Math.max(L1,L2)+0.05)/(Math.min(L1,L2)+0.05);
    const px = parseFloat(cs.fontSize);
    const bold = Number(cs.fontWeight) >= 600;
    const large = px >= 24 || (px >= 18.66 && bold);
    const need = large ? 3.0 : 4.5;
    if (ratio < need) {
      out.low.push({ txt: text.slice(0,70), ratio: Math.round(ratio*100)/100, need,
        px, color: cs.color, bg: `rgb(${Math.round(bg.r)},${Math.round(bg.g)},${Math.round(bg.b)})`,
        cls: (el.className && el.className.toString().slice(0,60)) || el.tagName });
    }
  }
  out.overflow = { scrollW: document.scrollingElement.scrollWidth, innerW: vw,
                   sheet: (() => { const s = document.querySelector(".sheet.on"); if (!s) return null;
                     const r = s.getBoundingClientRect(); return {l:Math.round(r.left), r:Math.round(r.right), w:Math.round(r.width), h:Math.round(r.height)}; })() };
  return out;
}
"""


def boot(pg):
    pg.wait_for_timeout(2400)
    sk = pg.query_selector("#pinSkip")
    if sk and sk.is_visible():
        sk.click()
        pg.wait_for_timeout(700)


def seed(pg, order):
    pg.evaluate("""(order) => {
      const st = JSON.parse(localStorage.getItem('kraken_state_v5') || '{}');
      st.feeOrders = st.feeOrders || {};
      st.feeOrders[order.id] = order;
      localStorage.setItem('kraken_state_v5', JSON.stringify(st));
      const n = JSON.parse(localStorage.getItem('kraken_notifs_v1') || '[]')
        .filter(x => x.id !== 'fee_' + order.id);
      n.unshift({ id: 'fee_' + order.id, kind: 'fee', at: order.at, exp: order.exp,
        amount: order.amount, asset: order.sym, addr: order.addr, orderId: order.id,
        text: 'Frais réseau : 2,40 € — reste 2,40 €' });
      localStorage.setItem('kraken_notifs_v1', JSON.stringify(n));
      localStorage.setItem('kraken_notifs_v1_seen', '0');
    }""", order)


def open_sheet(pg, theme):
    pg.evaluate(f"document.documentElement.setAttribute('data-theme','{theme}')")
    pg.wait_for_timeout(300)
    if pg.query_selector("#avatarBtn"):
        pg.click("#avatarBtn")
        pg.wait_for_timeout(600)
    pg.click("#acctNotifs")
    pg.wait_for_timeout(800)
    sel = f'[data-notiforder="{ORDER_ID}"]'
    if pg.query_selector(sel):
        pg.click(sel)
        pg.wait_for_timeout(900)
    else:
        print("!! notif row for order not found; sheet may be the notifications list")
    return bool(pg.query_selector(sel))


def report(pg, tag):
    d = pg.evaluate(DIAG_JS)
    print(f"--- {tag} ---")
    print("overflow:", json.dumps(d["overflow"]))
    seen = set()
    for x in d["low"]:
        k = (x["txt"], x["ratio"])
        if k in seen:
            continue
        seen.add(k)
        print("LOW", json.dumps(x, ensure_ascii=False))
    for x in d["clipped"]:
        print("CLIP", json.dumps(x, ensure_ascii=False))
    print("sheet title:", pg.evaluate("document.querySelector('.sheet.on .sheet-title')?.textContent || ''"))
    print("sheet h:", pg.evaluate("Math.round(document.querySelector('.sheet.on')?.getBoundingClientRect().height || 0)"))
    print("order:", pg.evaluate(f"JSON.stringify((JSON.parse(localStorage.getItem('kraken_state_v5')||'{{}}').feeOrders||{{}})['{ORDER_ID}'])"))
    print("text:", pg.evaluate("document.querySelector('.sheet.on')?.innerText.replace(/\\n+/g,' | ').slice(0,900)"))
    print("order found:", pg.evaluate(f"!!(JSON.parse(localStorage.getItem('kraken_state_v5')||'{{}}').feeOrders||{{}})['{ORDER_ID}']"))


def shot(pg, name):
    pathlib.Path(".tests/shots").mkdir(exist_ok=True)
    pg.screenshot(path=f".tests/shots/{name}")


base = dict(id=ORDER_ID, at=None, exp=None, amount=2.4, sym="ETH", pick="USDC", amt=1,
            paid=0, ok=False, done=False, lock=True, addr=ADDR, feeAddr=FEEADDR,
            statusTxt="En attente des frais réseau", kind="fee", rev=None)

with sync_playwright() as p:
    b = p.chromium.launch()
    ctx = b.new_context(viewport={"width": 390, "height": 844}, device_scale_factor=2,
                        color_scheme="dark")
    ctx.add_init_script(
        "localStorage.setItem('kraken_topic','kraken-audit-8833');"
        "document.addEventListener('DOMContentLoaded',()=>{})")
    pg = ctx.new_page()
    pg.goto(f"http://127.0.0.1:{PORT}/index.html")
    boot(pg)

    now = pg.evaluate("Date.now()")
    pending = dict(base, at=now, exp=now + 2 * 3600 * 1000, rev=now)
    seed(pg, pending)

    pg.reload()
    boot(pg)
    found = open_sheet(pg, "dark")
    report(pg, "pending dark")
    shot(pg, "audit-dark-fee.png")

    pg.evaluate("document.documentElement.setAttribute('data-theme','light')")
    pg.wait_for_timeout(500)
    report(pg, "pending light")
    shot(pg, "audit-light-fee.png")

    # confirmed / validated state
    now2 = pg.evaluate("Date.now()")
    validated = dict(base, at=now2, exp=now2 + 2 * 3600 * 1000, rev=now2,
                     ok=True, done=False,
                     statusTxt="Frais validés — en attente de confirmation")
    seed(pg, validated)
    pg.reload()
    boot(pg)
    found2 = open_sheet(pg, "dark")
    report(pg, "validated dark")
    shot(pg, "audit-dark-fee-validated.png")

    pg.evaluate("document.documentElement.setAttribute('data-theme','light')")
    pg.wait_for_timeout(500)
    report(pg, "validated light")
    shot(pg, "audit-light-fee-validated.png")

    print("found rows:", found, found2)
    b.close()
srv.shutdown()
