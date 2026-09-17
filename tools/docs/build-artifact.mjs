#!/usr/bin/env node
// build-artifact.mjs — сглобява от `agents-dashboard/` ЕДИН самостоятелен файл за Artifact.
//
// ЗАЩО СЪЩЕСТВУВА. Живото табло е ПАПКА (`index.html` + `docs.js` + 28 маскота + `agents.json`),
// а Artifact-ът е ЕДИН файл зад строг CSP: относителен път не се тегли, външен хост е блокиран.
// Досега този билд се правеше на ръка в scratchpad-а — и scratchpad-ът се изтрива. Затова, когато
// потрябва пресна галактика, работата се правеше НАНОВО, вместо с една команда. Тук е командата.
//
//   node tools/docs/build-artifact.mjs                 # → galaxy-artifact.html
//   node tools/docs/build-artifact.mjs <изход.html>
//
// След това публикувай изхода като Artifact на СЪЩИЯ адрес (нов път = нов артифакт).
//
// Какво прави:
//   1) маха обвивката `<!doctype>/<html>/<head>/<body>` — публикуването си я слага само;
//   2) вгражда `docs.js` на мястото на `<script src="./docs.js">`;
//   3) вгражда 28-те маскот-икони като `data:` URI и пренасочва `<img src>` към картата;
//   4) `fetch("./agents.json")` СЕ ОСТАВЯ — той пада тихо и кодът минава на вградения FALLBACK,
//      който `sync-dashboard.mjs` държи изравнен с `_memory` (гейтът `dashboard-sync` го пази).
//      Тоест числата в артифакта са верни БЕЗ нито една мрежова заявка.

import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const DASH = join(ROOT, "agents-dashboard");

const DOCS_TAG = '<script src="./docs.js"></script>';
const IMG_SRC = 'src="./mascots/${encodeURIComponent(id)}-icon.svg"';
const IMG_SRC_INLINE = "src=\"${MASCOT_ICONS[id] || ''}\"";
const WRAPPER_TAGS = ["<!doctype", "<html", "<head>", "</head>", "<body", "</body>", "</html>"];

/** Само съдържанието на `<head>` + `<body>`, слепено — публикуването слага обвивката. */
export function stripDocumentWrapper(src) {
  const h0 = src.indexOf("<head>"), h1 = src.indexOf("</head>");
  const open = /<body[^>]*>/.exec(src), close = src.lastIndexOf("</body>");
  if (h0 === -1 || h1 === -1 || !open || close === -1) throw new Error("index.html не е цял документ (липсва head/body)");
  return `${src.slice(h0 + "<head>".length, h1).trim()}\n${src.slice(open.index + open[0].length, close).trim()}\n`;
}

/** Картата id → `data:` URI за маскот-иконите. */
export function mascotDataUris(dir) {
  const icons = {};
  for (const f of readdirSync(dir)) {
    if (!f.endsWith("-icon.svg")) continue;
    // Едноредово: по-малък файл, а и по-лесно се сравнява при разлика.
    const svg = readFileSync(join(dir, f), "utf8").replace(/\s*\n\s*/g, " ").trim();
    // `encodeURIComponent`, не base64 — SVG-то остава четимо в изходния код, компресира се
    // по-добре, а кавичките са закодирани, значи не чупят атрибута.
    icons[f.replace(/-icon\.svg$/, "")] = `data:image/svg+xml,${encodeURIComponent(svg)}`;
  }
  return icons;
}

/**
 * Проверява, че резултатът е ГОДЕН за публикуване. Гледа САМО разметката.
 *
 * Първата версия сканираше целия файл за „<html“ и падна върху ПРОЗА: `docs.js` съдържа
 * CLAUDE.md текст, в който е споменат `<html>`. Това е низ в JavaScript, който никога не се
 * чете като таг — детектор, който чете текст вместо структура (същият клас грешка, който този
 * репо вече е ловил на няколко места). Затова тук съдържанието на `<script>`/`<style>` се
 * изрязва, преди да се търси обвивка.
 *
 * Отделно се пази РЕАЛНАТА опасност при вграждане: `</script>` вътре във вгражданото затваря
 * блока по-рано и чупи всичко след него.
 */
export function assertPublishable(html, embedded = {}) {
  const markup = html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "<script></script>")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, "<style></style>");
  for (const tag of WRAPPER_TAGS)
    if (markup.toLowerCase().includes(tag)) throw new Error(`остана обвиващ таг: ${tag}`);
  for (const [what, text] of Object.entries(embedded))
    if (/<\/script/i.test(String(text))) throw new Error(`${what} съдържа "</script>" — ще затвори блока по-рано`);
  return true;
}

/** Целият билд. Връща готовия за публикуване текст + числата за доклада. */
export function build(dash = DASH) {
  let html = stripDocumentWrapper(readFileSync(join(dash, "index.html"), "utf8"));

  const docs = readFileSync(join(dash, "docs.js"), "utf8").trim();
  if (!html.includes(DOCS_TAG)) throw new Error(`не намирам ${DOCS_TAG} — таблото е сменено`);
  html = html.replace(DOCS_TAG, `<script>\n${docs}\n</script>`);

  const icons = mascotDataUris(join(dash, "mascots"));
  if (!html.includes(IMG_SRC)) throw new Error("не намирам <img src> към mascots/ — таблото е сменено");
  html = html.replace(IMG_SRC, IMG_SRC_INLINE);

  // Картата се обявява ПРЕДИ главния скрипт: top-level `const` е видим за следващите блокове.
  // Ръчният билд я слагаше СЛЕД употребата — работеше, но само защото функцията се вика по-късно.
  const first = html.indexOf("<script>");
  if (first === -1) throw new Error("няма скрипт блок");
  html = `${html.slice(0, first)}<script>const MASCOT_ICONS = ${JSON.stringify(icons)};</script>\n${html.slice(first)}`;

  assertPublishable(html, { "docs.js": docs, "маскоти": JSON.stringify(icons) });

  const lessons = [...html.matchAll(/"lessons":\s*(\d+)/g)].map((m) => Number(m[1]));
  return { html, icons: Object.keys(icons).length, agents: lessons.length, lessons: lessons.reduce((a, b) => a + b, 0) };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const out = process.argv[2] || join(ROOT, "galaxy-artifact.html");
  const r = build();
  writeFileSync(out, r.html);
  console.log(`\x1b[32m✓\x1b[0m ${out} · ${(r.html.length / 1024 / 1024).toFixed(2)} MB · ${r.icons} маскота вградени`);
  console.log(`  агенти: ${r.agents} · сума проверени поуки: ${r.lessons}`);
  console.log("  публикувай го на СЪЩИЯ адрес на артифакта — нов път значи нов артифакт.");
}
