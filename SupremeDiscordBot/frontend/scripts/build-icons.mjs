// frontend/scripts/build-icons.mjs — растерните икони на таблото (атлас WebP).
//
// ЗАЩО: правилото на собственика „никога SVG“ (2026-11-04, и вече пуснатият SVG —
// 2026-11-27) иска иконите да са растер. Дотук таблото рисуваше 80+ SVG икони от
// lucide-react. Сега:
//   - този скрипт (само при разработка) рисува всяка нужна икона в клетка 48×48
//     на един WebP атлас (без загуби): public/icons/sprite.webp;
//   - src/components/icons/spriteMap.js пази къде е всяка (генериран);
//   - src/components/icons/index.js изнася компонент със СЪЩОТО име като в
//     lucide-react, който показва клетката като CSS маска с currentColor.
// lucide-react остава само devDependency — в бъндъла няма нито един SVG.
//
// Кои икони: всички имена, внесени от „components/icons“ (или още от
// „lucide-react“) навсякъде в src/, плюс вариантите в EXTRA.
//
// Употреба:  node scripts/build-icons.mjs        (след добавяне на нова икона)
// Проверка:  node scripts/build-icons.mjs --check (гейт: атласът покрива всичко)
import { readFileSync, writeFileSync, readdirSync, statSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SRC = join(ROOT, "src");
const OUT_IMG = join(ROOT, "public", "icons", "sprite.webp");
const OUT_MAP = join(SRC, "components", "icons", "spriteMap.js");
const CELL = 48; // 2× за икони до 24 px — колкото са почти всички в таблото
const STROKE = 2.25; // малко по-плътно от стандартните 2 — „гравирано“ в метал
// Варианти, които lucide рисува с пропс: „Star:fill“ = запълнена звезда (оценките).
const EXTRA = ["Star:fill"];
// Собствени едноцветни знаци, които lucide няма (логото на Discord — бутоните „Влез с Discord“).
const CUSTOM = {
  Discord: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="#ffffff"><path d="M20.317 4.369a19.79 19.79 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.211.375-.445.864-.608 1.249a18.365 18.365 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.036 19.736 19.736 0 0 0-4.885 1.515.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.058a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128c.126-.094.252-.192.371-.291a.074.074 0 0 1 .077-.01c3.927 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.009c.12.098.245.198.372.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.04.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.84 19.84 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z"/></svg>',
};
// Многоцветни картинки (не маски): плувката и кукичката от демото на стръвта (BaitShowcase).
// Рисуват се 2× за остър ръб; цветовете са тези от .bt-section в index.css.
const ART = [
  { file: "public/art/bait-bobber.png", w: 32, h: 54,
    svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 40"><line x1="12" y1="0" x2="12" y2="8" stroke="#cfd8cc" stroke-width="1.5"/><path d="M12 8c5 0 8 5 8 11H4c0-6 3-11 8-11z" fill="#e5483b"/><path d="M4 19h16c0 6-3 11-8 11s-8-5-8-11z" fill="#f4f1ea"/><line x1="12" y1="30" x2="12" y2="38" stroke="#cfd8cc" stroke-width="1.5"/></svg>' },
  { file: "public/art/bait-hook.png", w: 72, h: 152,
    svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 84" stroke="#cfd8cc"><path d="M32 2c5 6 7 11 7 15a7 7 0 0 1-14 0c0-4 2-9 7-15z" fill="#ff8a3d" stroke="#ffc08a" stroke-width="1.5"/><circle cx="32" cy="27" r="3.5" fill="none" stroke-width="3"/><path d="M32 31v32a12 12 0 0 1-24 0" fill="none" stroke-width="3.5" stroke-linecap="round"/><path d="M8 63l-5-8" fill="none" stroke-width="3.5" stroke-linecap="round"/></svg>' },
];

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) { if (name !== "__tests__") walk(p, out); }
    else if (/\.(jsx?|mjs)$/.test(name)) out.push(p);
  }
  return out;
}

export function collectIconNames(files = walk(SRC)) {
  const names = new Set();
  const re = /import\s*\{([^}]+)\}\s*from\s*["'](?:lucide-react|[./]*(?:components\/)?icons(?:\/index(?:\.js)?)?)["']/g;
  for (const f of files) {
    if (f.endsWith(join("components", "icons", "index.js")) || f.endsWith("spriteMap.js")) continue;
    const src = readFileSync(f, "utf8");
    for (const m of src.matchAll(re)) {
      for (const part of m[1].split(",")) {
        const name = part.trim().split(/\s+as\s+/)[0].trim();
        if (/^[A-Z][A-Za-z0-9]*$/.test(name)) names.add(name);
      }
    }
  }
  // Запълнени варианти: иконата се ползва с fill пропс или с клас fill-* (fill-current,
  // fill-cs-gold…) — SVG-то се запълваше, растерът трябва да има отделна клетка.
  const fillRe = /<([A-Z][A-Za-z0-9]*)\b[^>]*?(?:\sfill=(?!["']none["'])|className="[^"]*\bfill-(?!none\b))/g;
  for (const f of files) {
    for (const m of readFileSync(f, "utf8").matchAll(fillRe)) if (names.has(m[1])) names.add(`${m[1]}:fill`);
  }
  for (const e of EXTRA) names.add(e);
  return [...names].sort();
}

async function render(names) {
  const require = createRequire(import.meta.url);
  const React = require("react");
  const { renderToStaticMarkup } = require("react-dom/server");
  const L = require("lucide-react");
  const svgs = names.map((key) => {
    const [name, variant] = key.split(":");
    if (CUSTOM[name]) return CUSTOM[name];
    const Icon = L[name];
    if (!Icon) throw new Error(`lucide-react няма икона „${name}“`);
    return renderToStaticMarkup(React.createElement(Icon, {
      size: CELL, strokeWidth: STROKE, color: "#ffffff", fill: variant === "fill" ? "#ffffff" : "none",
    }));
  });
  const { chromium } = require("playwright");
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const cols = Math.ceil(Math.sqrt(names.length));
  const rows = Math.ceil(names.length / cols);
  const b64 = await page.evaluate(async ({ svgs, cols, rows, CELL }) => {
    const c = document.createElement("canvas");
    c.width = cols * CELL; c.height = rows * CELL;
    const ctx = c.getContext("2d");
    for (let i = 0; i < svgs.length; i++) {
      const img = new Image();
      img.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svgs[i]);
      await img.decode();
      ctx.drawImage(img, (i % cols) * CELL, Math.floor(i / cols) * CELL, CELL, CELL);
    }
    // WebP с качество 1 = без загуби (алфата съвпада до пиксел с PNG) и е ~2.3× по-малък.
    return c.toDataURL("image/webp", 1).split(",")[1];
  }, { svgs, cols, rows, CELL });
  const art = [];
  for (const a of ART) {
    const b = await page.evaluate(async ({ svg, w, h }) => {
      const c = document.createElement("canvas"); c.width = w; c.height = h;
      const img = new Image(); img.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
      await img.decode(); c.getContext("2d").drawImage(img, 0, 0, w, h);
      return c.toDataURL("image/png").split(",")[1];
    }, a);
    art.push({ file: a.file, buf: Buffer.from(b, "base64") });
  }
  await browser.close();
  return { png: Buffer.from(b64, "base64"), cols, rows, art };
}

function mapSource(names, cols, rows) {
  const entries = names.map((n, i) => `  ${JSON.stringify(n)}: ${i},`).join("\n");
  return `// frontend/src/components/icons/spriteMap.js — ГЕНЕРИРАН от scripts/build-icons.mjs. Не редактирай на ръка.
// Атласът: public/icons/sprite.webp, клетка ${CELL}×${CELL}, ${cols} колони × ${rows} реда.
export const COLS = ${cols};
export const ROWS = ${rows};
export const SPRITE = {
${entries}
};
`;
}

const OUT_INDEX = join(SRC, "components", "icons", "index.js");
function indexSource(names) {
  const plain = names.filter((n) => !n.includes(":"));
  return `// frontend/src/components/icons/index.js — ГЕНЕРИРАН от scripts/build-icons.mjs. Не редактирай на ръка.
// Същите имена като в lucide-react, но всяка икона е клетка от растерния атлас
// (правилото „никога SVG“). Нова икона: внеси я оттук и пусни node scripts/build-icons.mjs.
import { makeIcon } from "./RasterSprite.jsx";

${plain.map((n) => `export const ${n} = makeIcon(${JSON.stringify(n)});`).join("\n")}
`;
}

async function main() {
  const names = collectIconNames();
  if (process.argv.includes("--check")) {
    const { SPRITE } = await import(OUT_MAP + `?t=${Date.now()}`);
    const missing = names.filter((n) => !(n in SPRITE));
    if (missing.length) { console.error(`✗ икони без клетка в атласа: ${missing.join(", ")} — пусни node scripts/build-icons.mjs`); process.exit(1); }
    console.log(`✓ icons: атласът покрива всички ${names.length} икони`);
    return;
  }
  const { png, cols, rows, art } = await render(names);
  for (const a of art) { const f = join(ROOT, a.file); mkdirSync(dirname(f), { recursive: true }); writeFileSync(f, a.buf); }
  mkdirSync(dirname(OUT_IMG), { recursive: true });
  writeFileSync(OUT_IMG, png);
  writeFileSync(OUT_MAP, mapSource(names, cols, rows));
  writeFileSync(OUT_INDEX, indexSource(names));
  console.log(`✓ ${names.length} икони → public/icons/sprite.webp (${cols}×${rows}, ${(png.length / 1024).toFixed(1)} KB)`);
}

if (import.meta.url === `file://${process.argv[1]}`) main().catch((e) => { console.error(e); process.exit(1); });
