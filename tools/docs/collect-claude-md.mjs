#!/usr/bin/env node
// tools/docs/collect-claude-md.mjs — събира ВСИЧКИ CLAUDE.md файлове (root + per-product)
// в agents-dashboard/docs.js (`window.__DOCS__`), за да се виждат живи в таблото.
//
// Зарежда се през <script src="./docs.js"> — работи и по http, и по file:// (за разлика
// от fetch, който file:// блокира). Netlify го регенерира на всеки деплой (виж netlify.toml
// `command`), така че таблото никога не показва остаряло CLAUDE.md.
//
// Употреба:  node tools/docs/collect-claude-md.mjs
//            node tools/docs/collect-claude-md.mjs --check   # само проверка, без запис

import { readFileSync, writeFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { join, dirname, relative } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const OUT = join(ROOT, "agents-dashboard", "docs.js");
const CHECK = process.argv.includes("--check");

// Ред: root CLAUDE.md пръв, после product CLAUDE.md по азбучен ред (едно ниво навътре).
function collect() {
  const files = [];
  const rootMd = join(ROOT, "CLAUDE.md");
  if (existsSync(rootMd)) files.push(rootMd);
  for (const name of readdirSync(ROOT).sort((a, b) => a.localeCompare(b))) {
    if (name.startsWith(".")) continue;
    const dir = join(ROOT, name);
    let s;
    try { s = statSync(dir); } catch { continue; }
    if (!s.isDirectory()) continue;
    const md = join(dir, "CLAUDE.md");
    if (existsSync(md)) files.push(md);
  }
  return files;
}

function titleOf(content, path) {
  const m = content.split("\n").find((l) => /^#\s+/.test(l));
  return m ? m.replace(/^#\s+/, "").trim() : path;
}

const files = collect().map((abs) => {
  const content = readFileSync(abs, "utf8");
  const path = relative(ROOT, abs).split("\\").join("/");
  return {
    path,
    title: titleOf(content, path),
    lines: content.split("\n").length,
    bytes: Buffer.byteLength(content, "utf8"),
    content,
  };
});

// Дата: подаваема през GENERATED_DATE (за детерминизъм в CI); иначе днешна.
const generated = process.env.GENERATED_DATE || new Date().toISOString().slice(0, 10);
const payload = { generated, files };
const banner = "// АВТО-ГЕНЕРИРАН от tools/docs/collect-claude-md.mjs — не редактирай ръчно.\n";
// Таблото (index.html → renderDocs) чете ГЛОБАЛНАТА `docs`, а не `window.__DOCS__` — без този
// псевдоним проверката `typeof docs === "undefined"` винаги пада и Docs табът показва вечния
// плейсхолдър „Документите се зареждат от docs.js при деплой". Пишем и двете: `__DOCS__` е
// стабилното име за външни четци, `docs` е това, което рендерът реално ползва.
const body = banner + "window.__DOCS__ = " + JSON.stringify(payload, null, 2) + ";\nvar docs = window.__DOCS__;\n";

if (CHECK) {
  const cur = existsSync(OUT) ? readFileSync(OUT, "utf8") : "";
  // ДАТА-НЕЧУВСТВИТЕЛНО: сравняваме СЪДЪРЖАНИЕТО (files), не `generated` датата. Иначе gate-ът е
  // червен ВСЕКИ ден (днешна дата ≠ вградената) — точно затова проверката досега НЕ беше гейтвана и
  // реален дрейф на съдържанието (променен CLAUDE.md без регенерация) минаваше невидим. Взимаме
  // датата от съществуващия файл, за да остане само съдържанието като разлика.
  const curDate = (cur.match(/"generated":\s*"([^"]+)"/) || [])[1] || generated;
  const checkBody = banner + "window.__DOCS__ = " + JSON.stringify({ generated: curDate, files }, null, 2) + ";\nvar docs = window.__DOCS__;\n";
  if (cur !== checkBody) { console.error("docs.js е остарял (съдържание на CLAUDE.md се е променило) — пусни: node tools/docs/collect-claude-md.mjs"); process.exit(1); }
  console.log(`docs.js е актуален (${files.length} файла).`);
  process.exit(0);
}

writeFileSync(OUT, body);
console.log(`docs.js записан: ${files.length} CLAUDE.md файла (${files.map((f) => f.path).join(", ")}).`);
