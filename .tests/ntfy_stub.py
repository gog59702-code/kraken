"""Mini serveur ntfy local pour les tests (POST, /json?poll=1, /sse).

Ne remplace pas ntfy.sh en production : il sert uniquement à vérifier la
chaîne Régie -> app sans consommer le quota du service public.
Lancer : python .tests/ntfy_stub.py 8019
"""
import json
import sys
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlparse, parse_qs

LOCK = threading.Condition()
TOPICS = {}  # topic -> list[dict]
COUNTER = [0]


def add_message(topic, body):
    with LOCK:
        COUNTER[0] += 1
        msg = {
            "id": "stub-%d-%d" % (int(time.time() * 1000), COUNTER[0]),
            "time": int(time.time()),
            "event": "message",
            "topic": topic,
            "message": body,
        }
        TOPICS.setdefault(topic, []).append(msg)
        LOCK.notify_all()
        return msg


class Handler(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

    def log_message(self, fmt, *args):
        pass

    def _cors(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.send_header("Access-Control-Allow-Methods", "POST, GET, OPTIONS")

    def do_OPTIONS(self):
        self.send_response(204)
        self._cors()
        self.send_header("Content-Length", "0")
        self.end_headers()

    def do_POST(self):
        u = urlparse(self.path)
        topic = u.path.strip("/").split("/")[0]
        n = int(self.headers.get("Content-Length") or 0)
        body = self.rfile.read(n).decode("utf-8", "replace") if n else ""
        msg = add_message(topic, body)
        out = json.dumps(msg).encode()
        self.send_response(200)
        self._cors()
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(out)))
        self.end_headers()
        self.wfile.write(out)

    def do_GET(self):
        u = urlparse(self.path)
        parts = [p for p in u.path.strip("/").split("/") if p]
        if len(parts) < 2:
            self.send_error(404)
            return
        topic, kind = parts[0], parts[1]
        if kind == "json":
            q = parse_qs(u.query)
            since = (q.get("since") or ["all"])[0]
            with LOCK:
                items = list(TOPICS.get(topic, []))
            if since not in ("all", "12h", ""):
                try:
                    t = int(float(since))
                    items = [m for m in items if m["time"] >= t]
                except ValueError:
                    pass
            body = "\n".join(json.dumps(m) for m in items)
            out = (body + ("\n" if body else "")).encode()
            self.send_response(200)
            self._cors()
            self.send_header("Content-Type", "application/x-ndjson")
            self.send_header("Content-Length", str(len(out)))
            self.end_headers()
            self.wfile.write(out)
            return
        if kind == "sse":
            self.send_response(200)
            self._cors()
            self.send_header("Content-Type", "text/event-stream")
            self.send_header("Cache-Control", "no-cache")
            self.send_header("Connection", "keep-alive")
            self.end_headers()
            with LOCK:
                seen = len(TOPICS.get(topic, []))
            try:
                while True:
                    with LOCK:
                        LOCK.wait(timeout=10)
                        items = TOPICS.get(topic, [])
                        new = items[seen:]
                        seen = len(items)
                    if not new:
                        self.wfile.write(b": keep-alive\n\n")
                        self.wfile.flush()
                        continue
                    for m in new:
                        self.wfile.write(("data: " + json.dumps(m) + "\n\n").encode())
                        self.wfile.flush()
            except (BrokenPipeError, ConnectionResetError):
                return
            return
        self.send_error(404)


if __name__ == "__main__":
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8019
    srv = ThreadingHTTPServer(("127.0.0.1", port), Handler)
    print("ntfy stub on", port, flush=True)
    srv.serve_forever()
