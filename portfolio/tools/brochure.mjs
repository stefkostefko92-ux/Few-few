// tools/brochure.mjs — печата брошурата А5 (dist/<lang>/…/broshura/) в PDF през headless Chromium →
// public/broshura/carbon-stealth-portfolio-<lang>.pdf (проследени в git; линкът е в подножието на сайта).
// Иска dist/ (node build.mjs) и Chromium. Нула зависимости.
//
//   node tools/brochure.mjs            # трите езика
//   node tools/brochure.mjs bg         # само един
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { PATHS, LANGS, BROCHURE_PDF } from "../src/lib/html.mjs";
import { serveDist } from "./lib/serve-dist.mjs";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const CHROME = process.env.CHROME || ["/opt/pw-browsers/chromium-1194/chrome-linux/chrome", "/usr/bin/chromium", "/usr/bin/chromium-browser", "/usr/bin/google-chrome"].find(existsSync);
if (!CHROME) { console.error("✗ Няма Chromium (CHROME=/път/до/chrome)."); process.exit(2); }
if (!existsSync(join(ROOT, "dist"))) { console.error("✗ Няма dist/ — първо node build.mjs"); process.exit(2); }
const langs = process.argv.slice(2).filter((l) => LANGS.includes(l));
const todo = langs.length ? langs : LANGS;

const run = (args) => new Promise((resolve, reject) => { const ch = spawn(CHROME, args, { stdio: ["ignore", "ignore", "pipe"] }); let err = ""; ch.stderr.on("data", (d) => { err += d; }); ch.on("exit", (code) => (code === 0 ? resolve() : reject(new Error(`chrome exit ${code}: ${err.slice(-300)}`)))); });
const pagesIn = (pdf) => (pdf.match(/\/Type\s*\/Page(?!s)/g) || []).length;

const { srv, base } = await serveDist(join(ROOT, "dist"));
mkdirSync(join(ROOT, "public", "broshura"), { recursive: true });
let failed = 0;
try {
  for (const lang of todo) {
    const out = join(ROOT, "public", BROCHURE_PDF[lang]);
    const url = base + PATHS.brochure[lang];
    try {
      await run(["--headless=new", "--no-sandbox", "--disable-gpu", "--no-pdf-header-footer", "--virtual-time-budget=6000", "--run-all-compositor-stages-before-draw", `--print-to-pdf=${out}`, url]);
      const buf = readFileSync(out);
      const n = pagesIn(buf.toString("latin1"));
      const kb = Math.round(statSync(out).size / 1024);
      if (n !== 6) throw new Error(`${n} страници вместо 6`);
      console.log(`✓ ${lang}: ${BROCHURE_PDF[lang]} · ${n} стр. · ${kb} KB`);
    } catch (e) { failed++; console.error(`✗ ${lang}: ${e.message}`); }
  }
} finally { srv.close(); }
if (failed) process.exit(1);
