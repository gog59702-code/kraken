#!/usr/bin/env node
// MCP connectivity probe: real initialize + tools/list over stdio or Streamable HTTP.
// Usage:
//   node probe.mjs http <url> [headerName:headerValue ...]
//   node probe.mjs stdio <command> [args...]
// Exits 0 and prints JSON when the server answers tools/list.

import { spawn } from "node:child_process";

const mode = process.argv[2];
if (!mode) {
  console.error("usage: probe.mjs http <url> [H:V ...] | stdio <cmd> [args...]");
  process.exit(2);
}

const TIMEOUT_MS = Number(process.env.MCP_PROBE_TIMEOUT ?? 45000);

function rpc(id, method, params = {}) {
  return { jsonrpc: "2.0", id, method, params };
}

function summarize(toolsResult) {
  const tools = toolsResult?.tools ?? [];
  return {
    count: tools.length,
    names: tools.slice(0, 12).map((t) => t.name),
  };
}

async function httpProbe(url, headerPairs) {
  const headers = {
    "content-type": "application/json",
    accept: "application/json, text/event-stream",
  };
  for (const pair of headerPairs) {
    const i = pair.indexOf(":");
    if (i > 0) headers[pair.slice(0, i).trim()] = pair.slice(i + 1).trim();
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  let sessionId;

  async function post(body) {
    const h = { ...headers };
    if (sessionId) h["mcp-session-id"] = sessionId;
    const res = await fetch(url, {
      method: "POST",
      headers: h,
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    sessionId = res.headers.get("mcp-session-id") ?? sessionId;
    const text = await res.text();
    if (!res.ok) {
      throw new Error(`HTTP ${res.status} ${res.statusText}: ${text.slice(0, 300)}`);
    }
    if (!text.trim()) return null; // notifications get 202/204 with no body
    const ct = res.headers.get("content-type") ?? "";
    if (ct.includes("text/event-stream")) {
      const events = text
        .split(/\r?\n\r?\n/)
        .map((chunk) => chunk.split(/\r?\n/).filter((l) => l.startsWith("data:")).map((l) => l.slice(5).trim()).join(""))
        .filter(Boolean);
      const match = events.map((e) => { try { return JSON.parse(e); } catch { return null; } }).find((m) => m && m.id === body.id);
      if (!match) throw new Error(`no JSON-RPC response in SSE stream: ${text.slice(0, 300)}`);
      return match;
    }
    return JSON.parse(text);
  }

  const init = await post(rpc(1, "initialize", {
    protocolVersion: "2025-06-18",
    capabilities: {},
    clientInfo: { name: "probe", version: "1.0.0" },
  }));
  if (init.error) throw new Error(`initialize error: ${JSON.stringify(init.error)}`);

  await post({ jsonrpc: "2.0", method: "notifications/initialized" });
  const list = await post(rpc(2, "tools/list", {}));
  if (list.error) throw new Error(`tools/list error: ${JSON.stringify(list.error)}`);

  clearTimeout(timer);
  return {
    transport: "http",
    url,
    server: init.result?.serverInfo,
    protocolVersion: init.result?.protocolVersion,
    tools: summarize(list.result),
  };
}

function stdioProbe(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: ["pipe", "pipe", "pipe"],
      shell: process.platform === "win32",
      env: { ...process.env },
    });
    let buf = "";
    let stderr = "";
    let stage = 0;
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error(`timeout after ${TIMEOUT_MS}ms; stderr: ${stderr.slice(-500)}`));
    }, TIMEOUT_MS);

    const send = (obj) => child.stdin.write(JSON.stringify(obj) + "\n");

    child.stdout.on("data", (chunk) => {
      buf += chunk.toString();
      let idx;
      while ((idx = buf.indexOf("\n")) >= 0) {
        const line = buf.slice(0, idx).trim();
        buf = buf.slice(idx + 1);
        if (!line) continue;
        let msg;
        try { msg = JSON.parse(line); } catch { continue; }
        if (stage === 0 && msg.id === 1) {
          if (msg.error) { clearTimeout(timer); child.kill(); reject(new Error(JSON.stringify(msg.error))); return; }
          stage = 1;
          send({ jsonrpc: "2.0", method: "notifications/initialized" });
          send(rpc(2, "tools/list", {}));
        } else if (stage === 1 && msg.id === 2) {
          clearTimeout(timer);
          child.kill();
          if (msg.error) { reject(new Error(JSON.stringify(msg.error))); return; }
          resolve({
            transport: "stdio",
            command: [command, ...args].join(" "),
            server: undefined,
            tools: summarize(msg.result),
          });
        }
      }
    });
    child.stderr.on("data", (d) => { stderr += d.toString(); });
    child.on("error", (e) => { clearTimeout(timer); reject(e); });
    child.on("exit", (code) => {
      if (stage < 1) { clearTimeout(timer); reject(new Error(`exited ${code}; stderr: ${stderr.slice(-800)}`)); }
    });

    send(rpc(1, "initialize", {
      protocolVersion: "2025-06-18",
      capabilities: {},
      clientInfo: { name: "probe", version: "1.0.0" },
    }));
  });
}

try {
  const result = mode === "http"
    ? await httpProbe(process.argv[3], process.argv.slice(4))
    : await stdioProbe(process.argv[3], process.argv.slice(4));
  console.log(JSON.stringify({ ok: true, ...result }, null, 2));
  process.exit(0);
} catch (err) {
  console.log(JSON.stringify({ ok: false, error: String(err?.message ?? err) }, null, 2));
  process.exit(1);
}
