/**
 * snapshot-web.mjs — capture pixel-perfect snapshots of the real Kraken web client.
 *
 *   npm i playwright && npx playwright install chromium
 *   node snapshot-web.mjs
 *   node snapshot-web.mjs --auth storage.json --routes /,/trade,/portfolio
 *
 * Each screen is written as a standalone HTML file with CSS inlined and images
 * embedded as data URIs, plus a PNG screenshot at iPhone 14 Pro resolution.
 */
import { chromium, devices } from "playwright";
import fs from "node:fs/promises";
import path from "node:path";

const args = process.argv.slice(2);
const argVal = (k, d) => {
  const i = args.indexOf(k);
  return i >= 0 && args[i + 1] ? args[i + 1] : d;
};
const BASE = argVal("--base", "https://pro.kraken.com");
const AUTH = argVal("--auth", "");
const OUT = path.resolve(argVal("--out", "snapshots"));
const ROUTES = (argVal("--routes", "/,/markets,/trade,/portfolio,/earn"))
  .split(",").map(s => s.trim()).filter(Boolean);
const MAX_IMG_BYTES = 1_500_000;

await fs.mkdir(OUT, { recursive: true });
await fs.mkdir(path.join(OUT, "assets"), { recursive: true });

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  ...devices["iPhone 14 Pro"],
  locale: "en-US",
  colorScheme: "dark",
  storageState: AUTH && (await fs.stat(AUTH).then(() => AUTH).catch(() => undefined)),
});

const page = await context.newPage();
const seen = new Set();

for (const [i, route] of ROUTES.entries()) {
  const url = BASE.replace(/\/$/, "") + (route === "/" ? "" : route);
  const slug = String(i + 1).padStart(2, "0") + "-" +
    (route.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "") || "home");

  process.stdout.write(`[*] ${url}\n`);
  try {
    await page.goto(url, { waitUntil: "networkidle", timeout: 45000 });
  } catch {
    process.stdout.write("    (networkidle timeout — on continue)\n");
  }
  await page.waitForTimeout(2500);

  // dismiss cookie / geo banners if present
  for (const sel of [
    'button:has-text("Accept")', 'button:has-text("Accept all")',
    'button:has-text("Agree")', '[aria-label="Close"]',
    'button:has-text("Got it")', 'button:has-text("Continue")',
  ]) {
    const el = page.locator(sel).first();
    if (await el.count().catch(() => 0)) {
      await el.click({ timeout: 1500 }).catch(() => {});
      await page.waitForTimeout(400);
    }
  }

  await page.screenshot({ path: path.join(OUT, slug + ".png"), fullPage: false });

  // ── collect stylesheet text via CSSOM ────────────────────────────────
  const css = await page.evaluate(() => {
    let out = "";
    for (const sheet of Array.from(document.styleSheets)) {
      try {
        out += Array.from(sheet.cssRules).map(r => r.cssText).join("\n") + "\n";
      } catch {
        if (sheet.href) out += `@import url("${sheet.href}");\n`;
      }
    }
    return out;
  });

  // ── collect image / font URLs ────────────────────────────────────────
  const urls = await page.evaluate(() => {
    const set = new Set();
    document.querySelectorAll("img[src]").forEach(i => set.add(i.src));
    document.querySelectorAll("source[srcset],img[srcset]").forEach(s =>
      s.getAttribute("srcset").split(",").forEach(p => set.add(p.trim().split(" ")[0])));
    document.querySelectorAll("link[rel=icon],link[rel=apple-touch-icon]").forEach(l => set.add(l.href));
    document.querySelectorAll("*").forEach(el => {
      const bg = getComputedStyle(el).backgroundImage;
      if (bg && bg !== "none") {
        const m = [...bg.matchAll(/url\(["']?([^"')]+)["']?\)/g)];
        m.forEach(x => set.add(new URL(x[1], location.href).href));
      }
    });
    return [...set].filter(u => u.startsWith("http"));
  }, []);

  // ── download assets through the browser context (keeps cookies) ──────
  const map = new Map();
  let n = 0;
  for (const u of urls) {
    if (seen.has(u)) { map.set(u, seen.get(u)); continue; }
    try {
      const res = await context.request.get(u, { timeout: 15000 });
      if (!res.ok()) continue;
      const buf = await res.body();
      if (buf.length > MAX_IMG_BYTES) continue;
      const ext = (u.split("?")[0].match(/\.(png|jpe?g|svg|webp|gif|woff2?|ttf)$/i) || [, "bin"])[1];
      const name = `a${++n}.${ext}`;
      await fs.writeFile(path.join(OUT, "assets", name), buf);
      const rel = `assets/${name}`;
      map.set(u, rel);
      seen.set(u, rel);
    } catch { /* skip unreachable */ }
  }

  // ── serialize DOM with inlined CSS + localized assets ────────────────
  const html = await page.evaluate(({ css, mapObj }) => {
    const clone = document.documentElement.cloneNode(true);
    clone.querySelectorAll("script").forEach(s => s.remove());
    clone.querySelectorAll("link[rel=stylesheet]").forEach(l => l.remove());

    const abs = new Map(Object.entries(mapObj));
    clone.querySelectorAll("img[src]").forEach(i => {
      if (abs.has(i.src)) i.setAttribute("src", abs.get(i.src));
    });
    clone.querySelectorAll("img[srcset]").forEach(i => i.removeAttribute("srcset"));
    clone.querySelectorAll("*").forEach(el => {
      const bg = el.getAttribute("style") || "";
      if (bg.includes("url(")) {
        el.setAttribute("style", bg.replace(/url\(["']?([^"')]+)["']?\)/g, (m0, u) => {
          try { return `url("${abs.get(new URL(u, location.href).href) || u}")`; }
          catch { return m0; }
        }));
      }
    });

    const style = document.createElement("style");
    style.textContent = css;
    clone.querySelector("head")?.appendChild(style);
    return "<!DOCTYPE html>\n" + clone.outerHTML;
  }, { css, mapObj: Object.fromEntries(map) });

  await fs.writeFile(path.join(OUT, slug + ".html"), html, "utf8");
  process.stdout.write(`    -> ${slug}.html / ${slug}.png\n`);
}

await browser.close();
process.stdout.write(`\n[+] ${ROUTES.length} écrans dans ${OUT}\n`);
