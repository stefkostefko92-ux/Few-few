#!/usr/bin/env node
// previews.mjs — статични превюта на 10-те демота за картите в хъба (BG/EN/IT): headless Chromium снима
// 1440×900 (същия кадър, който преди показваше живият iframe), sharp → webp 960×600 в public/img/previews/.
// Пуска се РЪЧНО след промяна по демо (билд → snимки → commit); резултатът е проследен в git (асети).
// Живият iframe остава само при hover на картата (най-много 2 наведнъж) — 10 живи документа лагваха.
//   node build.mjs && node tools/previews.mjs [demoId]
import { spawn, execFileSync } from "node:child_process";
import { mkdirSync, rmSync, existsSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { DEMOS } from "../src/demos/index.mjs";
import { demoPath, LANGS } from "../src/lib/html.mjs";

const require = createRequire(import.meta.url);
const sharp = require("sharp");
const ROOT = fileURLToPath(new URL("..", import.meta.url));
const OUT = join(ROOT, "public", "img", "previews");
const TMP = join(ROOT, ".tmp-render");
const CHROME = process.env.CHROME_BIN || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
const PORT = 4181 + Math.floor(Math.random() * 100);
const only = process.argv[2];
if (!existsSync(join(ROOT, "dist", "bg", "index.html"))) throw new Error("първо node build.mjs");
mkdirSync(TMP, { recursive: true });

const server = spawn(process.execPath, [join(ROOT, "serve.mjs")], { env: { ...process.env, PORT: String(PORT) }, stdio: "ignore" });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
try {
  for (let i = 0; i < 40; i++) { try { await fetch(`http://127.0.0.1:${PORT}/bg/`); break; } catch { await sleep(150); } }
  for (const lang of LANGS) {
    mkdirSync(join(OUT, lang), { recursive: true });
    for (const d of DEMOS) {
      if (only && d.id !== only) continue;
      const url = `http://127.0.0.1:${PORT}${demoPath(lang, d)}`;
      const png = join(TMP, `${lang}-${d.id}.png`);
      // virtual-time-budget: докарва CSS анимациите (fade-up, reveal) до края, преди да снима.
      execFileSync(CHROME, ["--headless=new", "--no-sandbox", "--disable-gpu", "--hide-scrollbars", "--force-device-scale-factor=1", "--window-size=1440,900", "--virtual-time-budget=6000", `--screenshot=${png}`, url], { stdio: "ignore", timeout: 90000 });
      const out = join(OUT, lang, `${d.id}.webp`);
      const info = await sharp(png).resize(960, 600).webp({ quality: 80, effort: 6 }).toFile(out);
      console.log(`✓ img/previews/${lang}/${d.id}.webp (${Math.round(info.size / 1024)} KB)`);
    }
  }
} finally {
  server.kill();
  rmSync(TMP, { recursive: true, force: true });
}
