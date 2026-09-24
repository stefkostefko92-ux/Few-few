#!/usr/bin/env node
// build-artifact.mjs — сглобява от `agents-dashboard/` ЕДИН самостоятелен файл за Artifact.
//
// ЗАЩО СЪЩЕСТВУВА. Живото табло е ПАПКА (`index.html` + `docs.js` + 28 маскота + `agents.json`),
// а Artifact-ът е ЕДИН файл зад строг CSP: относителен път не се тегли, външен хост е блокиран.
// Досега този билд се правеше на ръка в scratchpad-а — и scratchpad-ът се изтрива. Затова, когато
// потрябва пресна галактика, работата се правеше НАНОВО, вместо с една команда. Тук е командата.
//
//   node tools/docs/build-artifact.mjs                 # → galaxy-artifact.html
//   node tools/docs/build-artifact.mjs <изход.html> [--ref <ref>]
//   node tools/docs/build-artifact.mjs --mark-published <sha>   # СЛЕД успешно публикуване
//
// След това публикувай изхода като Artifact на СЪЩИЯ адрес (нов път = нов артифакт):
// ARTIFACT_URL по-долу. Куката artifact-sync (Stop) връща сесията, докато това не е направено.
//
// ОТКЪДЕ ЧЕТЕ (2026-09-23). Ученето вече живее в клона `agents/memory`, не в работното дърво — ако
// билдът четеше работното дърво, артефактът нямаше да показва нищо научено след последния merge.
// По подразбиране чете ДЪРВОТО на най-пресния връх на паметта (локален → отдалечен `agents/memory`),
// тоест main + всичко научено; без клон на паметта — работното дърво, както преди.
//
// Какво прави:
//   1) маха обвивката `<!doctype>/<html>/<head>/<body>` — публикуването си я слага само;
//   2) вгражда `docs.js` на мястото на `<script src="./docs.js">`;
//   3) вгражда 28-те маскот-икони като `data:` URI и пренасочва `<img src>` към картата;
//   4) `fetch("./agents.json")` СЕ ОСТАВЯ — той пада тихо и кодът минава на вградения FALLBACK,
//      който `sync-dashboard.mjs` държи изравнен с `_memory` (гейтът `dashboard-sync` го пази).
//      Тоест числата в артифакта са верни БЕЗ нито една мрежова заявка.

import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { dirname, join, isAbsolute } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const ROOT = process.env.CLAUDE_PROJECT_DIR || join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const DASH = join(ROOT, "agents-dashboard");
// Единственият артефакт на флота — обновява се НА МЯСТО (нов адрес = нов, осиротял артефакт).
export const ARTIFACT_URL = "https://claude.ai/artifact/1ToqsPWwyCedwzLuVaaN3w";
export const MEMORY_REFS = ["refs/heads/agents/memory", "refs/remotes/origin/agents/memory"];

const git = (args, cwd = ROOT) => {
  const r = spawnSync("git", args, { cwd, encoding: "utf8", maxBuffer: 1 << 28 });
  return r.status === 0 ? r.stdout : null;
};
/** Най-пресният връх на паметта (sha) или null. Никога не хвърля. */
export function memoryTip(cwd = ROOT) {
  for (const ref of MEMORY_REFS) { const r = git(["rev-parse", "-q", "--verify", `${ref}^{commit}`], cwd); if (r) return r.trim(); }
  return null;
}
/** Файл, в който се помни кой връх на паметта е ПУБЛИКУВАН в артефакта (в .git — не се комитва). */
export function statePath(cwd = ROOT) {
  const p = git(["rev-parse", "--git-path", "agents-artifact.json"], cwd);
  if (!p) return null;
  return isAbsolute(p.trim()) ? p.trim() : join(cwd, p.trim());
}
export function publishedTip(cwd = ROOT) {
  try { return JSON.parse(readFileSync(statePath(cwd), "utf8")).published || null; } catch { return null; }
}
/** Четец на таблото: от git дърво (ref) или от папка. */
export function dashReader(ref = null, cwd = ROOT) {
  if (!ref) return {
    source: "работното дърво",
    read: (p) => readFileSync(join(cwd, "agents-dashboard", p), "utf8"),
    list: (d) => readdirSync(join(cwd, "agents-dashboard", d)),
  };
  return {
    source: `${ref.slice(0, 8)} (agents/memory)`,
    read: (p) => { const r = git(["show", `${ref}:agents-dashboard/${p}`], cwd); if (r == null) throw new Error(`няма agents-dashboard/${p} в ${ref}`); return r; },
    list: (d) => (git(["ls-tree", "--name-only", `${ref}:agents-dashboard/${d}`], cwd) || "").split("\n").filter(Boolean),
  };
}

const DOCS_TAG = '<script src="./docs.js"></script>';
const IMG_SRC = 'src="./mascots/${encodeURIComponent(id)}-icon.svg"';
const IMG_SRC_INLINE = "src=\"${MASCOT_ICONS[id] || ''}\"";
// 3D навсякъде (собственика, 2026-09-24): `mascot3d.js` е external-three ESM зареждан лениво с
// `import("./mascot3d.js")` (agents-dashboard/index.html#startMascot) — в артифакта относителен
// път е блокиран от CSP, точно като docs.js/mascots/. Внасяме го като `data:` URI и пренасочваме
// самия specifier — `three`/`three/addons/` вече идват от jsdelivr през importmap-а в <head>
// (пренесен непокътнат от stripDocumentWrapper, CSP на артифакта го разрешава изрично).
// Не `data:`/`blob:` импорт — CSP на артифакта може да ги реже. Бъндълът се вгражда като JSON низ и
// при нужда се пуска като ВГРАДЕН `<script type="module">` (импортите на three минават през
// importmap-а); крайният `export { … }` става `window.__MASCOT3D__ = { … }`. Не тръгне ли (CSP,
// мрежа) — таймаут → `catch` в startMascot → SVG резервът остава.
const MASCOT3D_IMPORT = 'import("./mascot3d.js")';
const MASCOT3D_IMPORT_INLINE = "loadMascot3D()";

/** Бъндълът като класически глобал: крайният `export { a, b }` → `window.__MASCOT3D__ = { a, b };`. */
export function mascot3dAsGlobal(src) {
  const m = /export\s*\{([^}]*)\}\s*;?\s*$/.exec(src);
  if (!m) throw new Error("mascot3d.js не завършва с `export { … }` — бъндълът е сменен");
  return `${src.slice(0, m.index)}window.__MASCOT3D__ = {${m[1]}};\n`;
}

/** Вграденият зареждач: кешира обещанието, пуска модула веднъж, таймаут 30 s. */
export function mascot3dLoader(src) {
  const body = JSON.stringify(mascot3dAsGlobal(src) + "\nwindow.dispatchEvent(new Event('mascot3d-ready'));\n").replace(/<\//g, "<\\/");
  return `<script>
const MASCOT3D_SRC = ${body};
let mascot3dP = null;
function loadMascot3D() {
  if (window.__MASCOT3D__) return Promise.resolve(window.__MASCOT3D__);
  return mascot3dP || (mascot3dP = new Promise((res, rej) => {
    addEventListener("mascot3d-ready", () => res(window.__MASCOT3D__), { once: true });
    setTimeout(() => { if (!window.__MASCOT3D__) { mascot3dP = null; rej(new Error("mascot3d timeout")); } }, 30000);
    const s = document.createElement("script"); s.type = "module"; s.textContent = MASCOT3D_SRC;
    document.head.appendChild(s);
  }));
}
</script>`;
}
const WRAPPER_TAGS = ["<!doctype", "<html", "<head>", "</head>", "<body", "</body>", "</html>"];

/** Само съдържанието на `<head>` + `<body>`, слепено — публикуването слага обвивката. */
export function stripDocumentWrapper(src) {
  const h0 = src.indexOf("<head>"), h1 = src.indexOf("</head>");
  const open = /<body[^>]*>/.exec(src), close = src.lastIndexOf("</body>");
  if (h0 === -1 || h1 === -1 || !open || close === -1) throw new Error("index.html не е цял документ (липсва head/body)");
  return `${src.slice(h0 + "<head>".length, h1).trim()}\n${src.slice(open.index + open[0].length, close).trim()}\n`;
}

/** Картата id → `data:` URI за маскот-иконите. */
export function mascotDataUris(dir, reader = null) {
  const icons = {};
  for (const f of reader ? reader.list("mascots") : readdirSync(dir)) {
    if (!f.endsWith("-icon.svg")) continue;
    // Едноредово: по-малък файл, а и по-лесно се сравнява при разлика.
    const svg = (reader ? reader.read(`mascots/${f}`) : readFileSync(join(dir, f), "utf8")).replace(/\s*\n\s*/g, " ").trim();
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

/**
 * Агенти, чиято последна версия в билда е ПОД тази в паметта (или липсват). Празен списък = наред.
 * Инцидент 2026-09-24: композитен билд взе вградения FALLBACK от работния клон (v15 срещу v21 в
 * паметта); сумата поуки съвпадаше, затова нищо не падна — артефактът показа флота 6 версии назад.
 */
export function versionRegressions(html, mem) {
  const num = (v) => parseFloat(v);
  const start = Math.max(0, html.indexOf("const FALLBACK"));
  const ids = (mem.agents || mem).map((a) => a.id);
  const pos = ids.map((id) => [id, html.slice(start).search(new RegExp(`"id":\\s*"${id}"`))]).filter(([, p]) => p >= 0).sort((a, b) => a[1] - b[1]);
  const shown = {};
  pos.forEach(([id, p], i) => {
    const seg = html.slice(start + p, i + 1 < pos.length ? start + pos[i + 1][1] : undefined);
    const vs = [...seg.matchAll(/"version":\s*"([0-9.]+)"/g)].map((m) => num(m[1]));
    if (vs.length) shown[id] = Math.max(...vs);
  });
  const out = [];
  for (const a of mem.agents || mem) {
    const real = Math.max(0, ...(a.evolution || []).map((e) => num(e.version)));
    if (!(a.id in shown)) out.push(`${a.id}: липсва в билда (паметта: ${real})`);
    else if (shown[a.id] < real) out.push(`${a.id}: ${shown[a.id]} < ${real}`);
  }
  return out;
}

/** Целият билд. Връща готовия за публикуване текст + числата за доклада. */
export function build(dash = DASH, reader = null) {
  const rd = reader || { read: (p) => readFileSync(join(dash, p), "utf8") };
  let html = stripDocumentWrapper(rd.read("index.html"));

  const docs = rd.read("docs.js").trim();
  if (!html.includes(DOCS_TAG)) throw new Error(`не намирам ${DOCS_TAG} — таблото е сменено`);
  html = html.replace(DOCS_TAG, `<script>\n${docs}\n</script>`);

  const icons = mascotDataUris(join(dash, "mascots"), reader);
  if (!html.includes(IMG_SRC)) throw new Error("не намирам <img src> към mascots/ — таблото е сменено");
  html = html.replace(IMG_SRC, IMG_SRC_INLINE);

  // Картата се обявява ПРЕДИ главния скрипт: top-level `const` е видим за следващите блокове.
  // Ръчният билд я слагаше СЛЕД употребата — работеше, но само защото функцията се вика по-късно.
  const first = html.indexOf("<script>");
  if (first === -1) throw new Error("няма скрипт блок");
  html = `${html.slice(0, first)}<script>const MASCOT_ICONS = ${JSON.stringify(icons)};</script>\n${html.slice(first)}`;

  // 3D маскотът: само ако таблото го зарежда (по-стари върхове на паметта нямат import-а).
  let m3d = "";
  if (html.includes(MASCOT3D_IMPORT)) {
    m3d = rd.read("mascot3d.js");
    const at = html.indexOf("<script>");
    html = `${html.slice(0, at)}${mascot3dLoader(m3d)}\n${html.slice(at)}`.split(MASCOT3D_IMPORT).join(MASCOT3D_IMPORT_INLINE);
  }

  assertPublishable(html, { "docs.js": docs, "маскоти": JSON.stringify(icons) });

  const lessons = [...html.matchAll(/"lessons":\s*(\d+)/g)].map((m) => Number(m[1]));
  return { html, icons: Object.keys(icons).length, agents: lessons.length, lessons: lessons.reduce((a, b) => a + b, 0) };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const argv = process.argv.slice(2);
  const flag = (k) => { const i = argv.indexOf(k); return i === -1 ? null : (argv[i + 1] || ""); };
  const mark = flag("--mark-published");
  if (mark !== null) {
    const sha = mark || memoryTip();
    if (!sha) { console.error("✗ няма връх на паметта за отбелязване"); process.exit(1); }
    writeFileSync(statePath(), JSON.stringify({ published: sha, url: ARTIFACT_URL, at: new Date().toISOString() }, null, 2) + "\n");
    console.log(`✓ артефактът е отбелязан като публикуван от ${sha.slice(0, 8)}`);
    process.exit(0);
  }
  const out = argv.find((a, i) => !a.startsWith("--") && argv[i - 1] !== "--ref") || join(ROOT, "galaxy-artifact.html");
  const ref = flag("--ref") ?? memoryTip();
  const reader = dashReader(ref);
  const r = build(DASH, ref ? reader : null);
  // Пазач: независимо откъде чете билдът, версиите не могат да са под върха на паметта.
  const tip = memoryTip();
  if (tip) {
    const memJson = git(["show", `${tip}:agents-dashboard/agents.json`]);
    const bad = memJson ? versionRegressions(r.html, JSON.parse(memJson)) : [];
    if (bad.length) {
      console.error(`\x1b[31m✗ билдът показва агентите ПОД паметта (${tip.slice(0, 8)}) — не публикувай:\x1b[0m\n  ${bad.join("\n  ")}`);
      console.error("  Вграденият FALLBACK е застоял — вземи го от agents/memory (index.html), после билдни пак.");
      process.exit(1);
    }
  }
  writeFileSync(out, r.html);
  console.log(`\x1b[32m✓\x1b[0m ${out} · ${(r.html.length / 1024 / 1024).toFixed(2)} MB · ${r.icons} маскота вградени`);
  console.log(`  източник: ${reader.source} · агенти: ${r.agents} · сума проверени поуки: ${r.lessons}`);
  console.log(`  публикувай на СЪЩИЯ адрес: ${ARTIFACT_URL}`);
  if (ref) console.log(`  после: node tools/docs/build-artifact.mjs --mark-published ${ref}`);
}
