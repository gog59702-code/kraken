import http.server, socketserver, threading, time, json
from playwright.sync_api import sync_playwright
ROOT=r"C:\Users\User\ia\kraken-app"; PORT=8851
class H(http.server.SimpleHTTPRequestHandler):
    def __init__(self,*a,**k): super().__init__(*a,directory=ROOT,**k)
    def log_message(self,*a): pass
class Q(socketserver.TCPServer): allow_reuse_address=True
srv=Q(("127.0.0.1",PORT),H); threading.Thread(target=srv.serve_forever,daemon=True).start(); time.sleep(0.3)
with sync_playwright() as p:
    br=p.chromium.launch(); ctx=br.new_context(viewport={"width":390,"height":844},device_scale_factor=2)
    pg=ctx.new_page(); errs=[]
    pg.on("pageerror",lambda e: errs.append(str(e)[:200]))
    pg.on("console",lambda m: errs.append("CONSOLE "+m.type+": "+m.text[:160]) if m.type=="error" else None)
    pg.goto("http://127.0.0.1:%d/index.html"%PORT)
    pg.wait_for_timeout(2500)
    print("booted",pg.evaluate("window.__krakenBooted"),"splash",pg.evaluate("window.__krakenSplashGone"))
    print("avatar visible",pg.is_visible("#avatarBtn"))
    print("screen splash",pg.is_visible("#splash"),"pin",pg.is_visible("#pinSkip"))
    if pg.is_visible("#pinSkip"): pg.click("#pinSkip"); pg.wait_for_timeout(600)
    pg.click("#avatarBtn"); pg.wait_for_timeout(900)
    print("acctNotifs",pg.is_visible("#acctNotifs"), "acctPrefs", pg.is_visible("#acctPrefs"))
    print("ids", pg.evaluate("Array.from(document.querySelectorAll('#sheetBody [id], #sheet [id]')).map(e=>e.id).slice(0,30)"))
    print("errs",errs[:6])
    br.close()
srv.shutdown()
