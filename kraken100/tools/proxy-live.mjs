/**
 * proxy-live.mjs — reverse proxy that serves the real Kraken web client under your
 * own origin, with the framing headers stripped. Zero dependencies.
 *
 *   node proxy-live.mjs
 *   http://localhost:8787
 *
 * Env:
 *   TARGET=https://pro.kraken.com
 *   PORT=8787
 *   HOST=0.0.0.0
 */
import http from "node:http";
import https from "node:https";
import net from "node:net";
import { URL } from "node:url";

const TARGET = process.env.TARGET || "https://pro.kraken.com";
const PORT = Number(process.env.PORT || 8787);
const HOST = process.env.HOST || "0.0.0.0";
const target = new URL(TARGET);

const DROP = new Set([
  "x-frame-options",
  "content-security-policy",
  "content-security-policy-report-only",
  "strict-transport-security",
  "cross-origin-opener-policy",
  "cross-origin-embedder-policy",
  "cross-origin-resource-policy",
  "permissions-policy",
  "report-to",
  "nel",
]);

function sanitizeHeaders(headers) {
  const out = {};
  for (const [k, v] of Object.entries(headers)) {
    if (DROP.has(k.toLowerCase())) continue;
    if (k.toLowerCase() === "set-cookie") {
      out[k] = v.map(c => c.replace(/;\s*domain=[^;]+/gi, "").replace(/;\s*secure/gi, ""));
      continue;
    }
    if (k.toLowerCase() === "location" && typeof v === "string") {
      out[k] = v.replace(target.origin, `http://localhost:${PORT}`);
      continue;
    }
    out[k] = v;
  }
  return out;
}

const server = http.createServer((req, res) => {
  const proxyReq = https.request(
    {
      hostname: target.hostname,
      port: 443,
      path: req.url,
      method: req.method,
      headers: {
        ...req.headers,
        host: target.host,
        origin: target.origin,
        referer: target.origin + "/",
      },
    },
    proxyRes => {
      res.writeHead(proxyRes.statusCode || 502, sanitizeHeaders(proxyRes.headers));
      proxyRes.pipe(res);
    }
  );
  proxyReq.on("error", err => {
    res.writeHead(502, { "content-type": "text/plain" });
    res.end("upstream error: " + err.message);
  });
  req.pipe(proxyReq);
});

// websocket / h2 upgrade passthrough (price streams keep working)
server.on("upgrade", (req, socket, head) => {
  const p = net.connect(443, target.hostname, () => {
    let raw = `${req.method} ${req.url} HTTP/1.1\r\n`;
    for (let i = 0; i < req.rawHeaders.length; i += 2) {
      const k = req.rawHeaders[i], v = req.rawHeaders[i + 1];
      raw += `${k.toLowerCase() === "host" ? `Host: ${target.host}` : `${k}: ${v}`}\r\n`;
    }
    raw += "\r\n";
    socket.write(raw);
    if (head?.length) socket.write(head);
    p.pipe(socket);
    socket.pipe(p);
  });
  p.on("error", () => socket.destroy());
  socket.on("error", () => p.destroy());
});

server.listen(PORT, HOST, () => {
  console.log(`[+] ${TARGET}  ->  http://${HOST === "0.0.0.0" ? "localhost" : HOST}:${PORT}`);
  console.log("[+] framing + CSP stripped, cookies de-domained, websockets bridged");
});
