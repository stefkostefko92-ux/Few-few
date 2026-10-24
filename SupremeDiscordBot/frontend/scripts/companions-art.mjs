#!/usr/bin/env node
// frontend/scripts/companions-art.mjs — растеризира спътниците (v50, етап 2).
//
// Вход: каталогът backend/src/lib/game/companions.js (един източник) + маскотът
// на Carbon Stealth (mascot/svg/expressions/*.svg + jelly-mascot-full.svg).
// Пребоядисване САМО през токените `--jm-*` (mascot/README.md: никакви CSS
// филтри), изражение по форма (1 neutral · 2 happy · 3 celebrate), пръстен по
// редкост. Изход: public/game/companions/<id>-<stage>.jpg (256×256, JPEG 88 —
// фонът е плътно черен, прозрачност не трябва; PNG беше 54 KB, JPEG е ~12 KB).
//
// Discord embed-ите не рендерират SVG, затова PNG-тата се генерират тук и се
// КОМИТВАТ; генераторът е детерминистичен — при промяна на каталога се пуска
// пак: node scripts/companions-art.mjs. Иска Chromium (както mobile-proof).
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { COMPANIONS, STAGE_EXPRESSION, rarityMeta, MAX_STAGE } from "../../backend/src/lib/game/companions.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const MASCOT = join(ROOT, "..", "..", "mascot", "svg");
const OUT = join(ROOT, "public", "game", "companions");
mkdirSync(OUT, { recursive: true });

const SIZE = 256;
const only = process.argv[2]; // по избор: един id за бърза проверка

function mascotSvg(expression) {
  const f = expression === "neutral" ? join(MASCOT, "jelly-mascot-full.svg") : join(MASCOT, "expressions", `${expression}.svg`);
  return readFileSync(f, "utf8");
}

/** Обвивка: пръстен по редкост + пребоядисаният маскот, центриран. */
function compose(c, stage) {
  const inner = mascotSvg(STAGE_EXPRESSION[stage])
    .replace(/<\?xml[^>]*\?>/, "")
    // Оригиналните width/height (512) се махат — иначе HTML парсерът пази ПЪРВИЯ
    // атрибут и вложеният svg остава 512 px (маскотът излиза от кадъра).
    .replace(/<svg([^>]*)>/, (_m, attrs) => `<svg${attrs.replace(/\s(?:width|height)="[^"]*"/g, "")} width="${SIZE * 0.8}" height="${SIZE * 0.8}" x="${SIZE * 0.1}" y="${SIZE * 0.08}">`);
  const p = c.palette;
  const ring = rarityMeta(c.rarity).ring;
  const glow = stage === 3 ? 0.55 : stage === 2 ? 0.35 : 0.2;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}" viewBox="0 0 ${SIZE} ${SIZE}">
  <style>svg{--jm-pale:${p.pale};--jm-olive:${p.olive};--jm-neon:${p.neon};--jm-bottle:${p.bottle};--jm-deep:${p.deep};--jm-bg:#050706;}</style>
  <defs>
    <radialGradient id="cg" cx="50%" cy="60%" r="50%">
      <stop offset="0" stop-color="${p.olive}" stop-opacity="${glow}"/>
      <stop offset="1" stop-color="${p.olive}" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="${SIZE}" height="${SIZE}" rx="28" fill="#050706"/>
  <circle cx="${SIZE / 2}" cy="${SIZE * 0.58}" r="${SIZE * 0.42}" fill="url(#cg)"/>
  <circle cx="${SIZE / 2}" cy="${SIZE / 2}" r="${SIZE / 2 - 6}" fill="none" stroke="${ring}" stroke-width="${stage === 3 ? 8 : stage === 2 ? 6 : 4}" opacity="0.9"/>
  ${inner}
</svg>`;
}

const { chromium } = await import("playwright-core");
const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROMIUM_BIN || "/opt/pw-browsers/chromium", args: ["--no-sandbox"] });
const page = await browser.newPage({ viewport: { width: SIZE, height: SIZE }, deviceScaleFactor: 1 });
let n = 0;
for (const c of COMPANIONS) {
  if (only && c.id !== only) continue;
  for (let stage = 1; stage <= MAX_STAGE; stage++) {
    const file = join(OUT, `${c.id}-${stage}.jpg`);
    const svg = compose(c, stage);
    await page.setContent(`<!doctype html><html><body style="margin:0;background:#050706">${svg}</body></html>`, { waitUntil: "load" });
    const buf = await page.locator("svg").first().screenshot({ omitBackground: false, type: "jpeg", quality: 88 });
    writeFileSync(file, buf);
    n++;
  }
}
await browser.close();
console.log(`✓ ${n} картинки в ${OUT}`);
if (!existsSync(join(OUT, `${COMPANIONS[0].id}-1.jpg`))) process.exit(1);
