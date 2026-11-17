// Extrait les pathData des VectorDrawable AXML compilés -> SVG.
import fs from "node:fs";
import path from "node:path";

const SRC = process.argv[2] || "C:/Users/User/ia/kraken100/extracted/base/res/drawable";
const OUT = process.argv[3] || "C:/Users/User/ia/kraken-app/assets/img";
const names = process.argv.slice(4);

fs.mkdirSync(OUT, { recursive: true });

function pathDataFrom(buf) {
  const src = buf.toString("utf8");
  const out = [];
  const re = /M[0-9][0-9.,\-\sCLHVQSTAZclhvqstaz]*/g;
  let m;
  while ((m = re.exec(src))) {
    const d = m[0].replace(/\s+/g, " ").trim();
    if (d.length > 6 && !out.includes(d)) out.push(d);
  }
  return out;
}

for (const n of names) {
  const src = path.basename(n).endsWith(".xml") ? n : n + ".xml";
  const p = path.join(SRC, src);
  if (!fs.existsSync(p)) { console.log("MISS", p); continue; }
  const buf = fs.readFileSync(p);
  const txt = buf.toString("utf8");
  if (!/viewportWidth/.test(txt)) { console.log("PAS UN VECTOR", src); continue; }
  const paths = pathDataFrom(buf);
  if (!paths.length) { console.log("VIDE", src); continue; }
  const vb = /viewportWidth\W+(\d+(?:\.\d+)?)\W+viewportHeight\W+(\d+(?:\.\d+)?)/.exec(txt);
  const w = vb ? +vb[1] : 24, h = vb ? +vb[2] : 24;
  const stroked = /strokeColor/.test(txt) && !/fillColor/.test(txt);
  const style = stroked
    ? 'fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"'
    : 'fill="currentColor"';
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}">` +
    paths.map(d => `<path d="${d}" ${style}/>`).join("") + `</svg>`;
  const file = path.join(OUT, src.replace(/^kds_(consumer_)?/, "").replace(/\.xml$/, "") + ".svg");
  fs.writeFileSync(file, svg);
  console.log("OK", path.basename(file), paths.length + "p", stroked ? "stroke" : "fill");
}
