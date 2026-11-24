"""Affiche le dernier message assistant généré (modèle, durée, texte, erreur)."""

import json
import os
import sqlite3
import sys
import time

sys.stdout.reconfigure(encoding="utf-8")
DB = os.path.expanduser(r"~\.local\share\opencode\opencode.db")

con = sqlite3.connect(f"file:{DB}?mode=ro", uri=True, timeout=5)
row = con.execute(
    "select session_id, time_created, time_updated, data from session_message "
    "where type='assistant' order by time_created desc limit 1"
).fetchone()

if not row:
    print("aucun message assistant en base")
    raise SystemExit(1)

sid, tc, tu, data = row
d = json.loads(data)
model = d.get("model") or {}
tok = d.get("tokens") or {}
text = "".join(p.get("text", "") for p in (d.get("content") or []) if p.get("type") == "text")
tools = [p.get("name") for p in (d.get("content") or []) if p.get("type") == "tool"]
err = d.get("error")

print(f"session : {sid}")
print(f"heure   : {time.strftime('%H:%M:%S', time.localtime(tc/1000))}")
print(f"duree   : {(tu - tc)/1000:.1f}s")
print(f"modele  : {model.get('providerID')}/{model.get('id') or model.get('modelID')}")
print(f"tokens  : in={tok.get('input')} out={tok.get('output')}")
print(f"outils  : {tools or 'aucun'}")
print(f"erreur  : {json.dumps(err, ensure_ascii=False) if err else 'aucune'}")
print(f"texte   : {text[:500]!r}")
