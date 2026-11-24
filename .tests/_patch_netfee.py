import io, re, pathlib
p = pathlib.Path(".tests/p2_netfee.py")
t = io.open(p, encoding="utf-8").read()

helper = '''
def jclick(pg, sel, wait=700):
    ok = pg.evaluate(
        """(sel) => { const els = Array.from(document.querySelectorAll(sel));
             const el = els.find(e => e.getBoundingClientRect().width > 0) || els[0];
             if (!el) return false; el.click(); return true; }""",
        sel)
    pg.wait_for_timeout(wait)
    return bool(ok)

'''
t = t.replace("DEF = ", helper + "DEF = ", 1)

def repl(m):
    return "jclick(pg, %s)" % m.group(1)

t = re.sub(r"pg\.click\((\'[^\']*\'|\"[^\"]*\")\)", repl, t)
io.open(p, "w", encoding="utf-8").write(t)
print("patched", t.count("jclick(pg,"))
