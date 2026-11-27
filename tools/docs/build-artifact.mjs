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
// Тайните в билда — по единствения списък (същият като secret-scan/куките), в отделен модул.
import { findSecretsIn } from "./artifact-secrets.mjs";
import { isMain } from "../lib/is-main.mjs";
import { buildAppData, embedJson } from "./agents-app.mjs";
export { findSecretsIn };

const ROOT = process.env.CLAUDE_PROJECT_DIR || join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const DASH = join(ROOT, "agents-dashboard");
// Единственият артефакт на флота — обновява се НА МЯСТО (нов адрес = нов, осиротял артефакт).
export const ARTIFACT_URL = "https://claude.ai/artifact/1ToqsPWwyCedwzLuVaaN3w";
export const MEMORY_REFS = ["refs/heads/agents/memory", "refs/remotes/origin/agents/memory"];

const git = (args, cwd = ROOT) => {
  const r = spawnSync("git", args, { cwd, encoding: "utf8", maxBuffer: 1 << 28 });
  return r.status === 0 ? r.stdout : null;
};
const LOCAL_MEMORY = MEMORY_REFS[0];
const refSha = (ref, cwd) => (git(["rev-parse", "-q", "--verify", `${ref}^{commit}`], cwd) || "").trim() || null;
/** `a` е строг предшественик на `b` (всичко от `a` е и в `b`, а `b` има още). */
const strictlyBehind = (a, b, cwd) => a !== b && spawnSync("git", ["merge-base", "--is-ancestor", a, b], { cwd }).status === 0;

/** Най-пресният връх на паметта (sha) или null. Никога не хвърля.
 *  Локалният клон печели, освен ако е ИЗЦЯЛО зад отдалечения (нищо непуснато) — тогава отдалеченият е
 *  по-пресен. Иначе застоял локален клон (27.11.2026: b70dc760 от 04.11 срещу caf797a4) показва флота три
 *  седмици назад. Разклонени — локалният: там може да има непуснато учене. */
export function memoryTip(cwd = ROOT) {
  const local = refSha(LOCAL_MEMORY, cwd), remote = refSha(MEMORY_REFS[1], cwd);
  if (local && remote && strictlyBehind(local, remote, cwd)) return remote;
  return local || remote;
}

/**
 * След публикуване: изостаналият локален `agents/memory` се премества напред до публикувания връх.
 * Куката artifact-sync (.claude/hooks) гледа САМО локалния клон — иначе след публикуване на отдалечения
 * връх тя сравнява стария локален и иска публикуване завинаги. Мести само при строго изоставане (нищо
 * локално не се губи), атомарно (update-ref със старата стойност) и никога клон, изваден в работно дърво.
 * Връща какво е направено: "moved" | "same" | "skip:<защо>".
 */
export function fastForwardLocalMemory(sha, cwd = ROOT) {
  const local = refSha(LOCAL_MEMORY, cwd);
  if (!local) return "skip:няма локален клон";
  if (local === sha) return "same";
  if (!strictlyBehind(local, sha, cwd)) return "skip:локалният не е изцяло зад публикувания";
  const trees = git(["worktree", "list", "--porcelain"], cwd) || "";
  if (trees.split("\n").includes(`branch ${LOCAL_MEMORY}`)) return "skip:клонът е изваден в работно дърво";
  const r = spawnSync("git", ["update-ref", "-m", "artifact: публикуван връх", LOCAL_MEMORY, sha, local], { cwd });
  return r.status === 0 ? "moved" : "skip:update-ref отказа";
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
    readBuf: (p) => readFileSync(join(cwd, "agents-dashboard", p)),
    list: (d) => readdirSync(join(cwd, "agents-dashboard", d)),
  };
  return {
    source: `${ref.slice(0, 8)} (agents/memory)`,
    read: (p) => { const r = git(["show", `${ref}:agents-dashboard/${p}`], cwd); if (r == null) throw new Error(`няма agents-dashboard/${p} в ${ref}`); return r; },
    readBuf: (p) => { const r = spawnSync("git", ["show", `${ref}:agents-dashboard/${p}`], { cwd, maxBuffer: 1 << 28 }); if (r.status !== 0) throw new Error(`няма agents-dashboard/${p} в ${ref}`); return r.stdout; },
    list: (d) => (git(["ls-tree", "--name-only", `${ref}:agents-dashboard/${d}`], cwd) || "").split("\n").filter(Boolean),
  };
}

/** Четец на РЕПОТО (пътища от корена) — дефинициите, екипите и уменията за страницата „Агентите“. */
export function repoReader(ref = null, cwd = ROOT) {
  if (!ref) return {
    read: (p) => readFileSync(join(cwd, p), "utf8"),
    list: (d) => readdirSync(join(cwd, d)),
  };
  return {
    read: (p) => { const r = git(["show", `${ref}:${p}`], cwd); if (r == null) throw new Error(`няма ${p} в ${ref}`); return r; },
    list: (d) => (git(["ls-tree", "--name-only", `${ref}:${d}`], cwd) || "").split("\n").filter(Boolean),
  };
}

const DOCS_TAG = '<script src="./docs.js"></script>';
// Кинематографичният галактически рендер (agents-dashboard/galaxy/, бъндвано от galaxy/build.mjs)
// се вгражда точно като docs.js — по-стари върхове на паметта (преди 2026-09-25) нямат тага, значи
// вграждането е УСЛОВНО (виж build(), огледално на m3d по-долу), за да не чупи стар артифакт-билд.
const GALAXY_TAG = '<script src="./galaxy.js"></script>';
// „Чака теб“ (23.11.2026): данните на панела, вградени като docs.js; условно — стари върхове нямат тага.
const WAITING_TAG = '<script src="./waiting.js"></script>';
const IMG_SRC = 'src="./mascots/${encodeURIComponent(id)}-icon3d.webp"';
const IMG_SRC_INLINE = "src=\"${MASCOT_ICONS[id] || ''}\"";
// 3D кадърът-резерв в профила (startMascot) — като иконите: data: URI вместо относителен път.
const PORTRAIT_SRC = "`./mascots/${encodeURIComponent(agent.id)}-portrait3d.webp`";
const PORTRAIT_SRC_INLINE = "(MASCOT_PORTRAITS[agent.id] || \"\")";
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

/** Картата id → `data:` URI за 3D портретите в профила (`<id>-portrait3d.webp`). */
export function mascotPortraitUris(dir, reader = null) {
  const out = {};
  for (const f of reader ? reader.list("mascots") : readdirSync(dir)) {
    if (!f.endsWith("-portrait3d.webp")) continue;
    const buf = reader ? reader.readBuf(`mascots/${f}`) : readFileSync(join(dir, f));
    out[f.replace(/-portrait3d\.webp$/, "")] = `data:image/webp;base64,${buf.toString("base64")}`;
  }
  return out;
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
  // 3D кадърът (tools/agents/mascot-icons3d.mjs) има предимство; SVG-то остава за агент без кадър.
  // (портретите `-portrait3d.webp` са отделна карта — mascotPortraitUris)
  for (const f of reader ? reader.list("mascots") : readdirSync(dir)) {
    if (!f.endsWith("-icon3d.webp")) continue;
    const buf = reader ? reader.readBuf(`mascots/${f}`) : readFileSync(join(dir, f));
    icons[f.replace(/-icon3d\.webp$/, "")] = `data:image/webp;base64,${buf.toString("base64")}`;
  }
  return icons;
}

/**
 * Проверява, че резултатът е ГОДЕН за публикуване. Гледа разметката + тайни (findSecretsIn).
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
  // 2026-10-06: артефактът е ПУБЛИЧЕН — вход за админ (имейл/парола) от поука стигна до FALLBACK-а и
  // оттам до артефакта, защото гардът гледаше само разметката. Fail closed по ЦЕЛИЯ набор (ALL, вкл.
  // COMMIT_ONLY: публичен артефакт е изход като commit); съобщението носи шаблон и място, НЕ стойността.
  const leaks = findSecretsIn(html);
  if (leaks.length)
    throw new Error(`билдът съдържа шаблон за тайна — НЕ публикувай (махни я от източника: _memory → sync-dashboard):\n  ${
      leaks.map((l) => `${l.name} · ред ${l.line}, кол. ${l.col}${l.agent ? ` · агент ${l.agent}` : ""}`).join("\n  ")}`);
  // Първо вграденото: `</script>` в него затваря блока по-рано и оголва остатъка като разметка. Ако
  // проверката за обвивка върви преди тази, съобщението сочи „<html“ от оголената проза, не причината
  // (2026-11-13: docs.js с `</script>` от FiveM/CLAUDE.md се докладваше като „остана обвиващ таг“).
  for (const [what, text] of Object.entries(embedded))
    if (/<\/script/i.test(String(text))) throw new Error(`${what} съдържа "</script>" — ще затвори блока по-рано`);
  const markup = html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "<script></script>")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, "<style></style>");
  for (const tag of WRAPPER_TAGS)
    if (markup.toLowerCase().includes(tag)) throw new Error(`остана обвиващ таг: ${tag}`);
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

// ── Страницата „Агентите“ (26.11.2026): карти по екипи, профили, чат. Главна страница на артефакта;
// галактиката отива до нея като `galaxy.html` (страница в `files` — цял документ, без обвивка от публикуването).
const APP_DATA_RE = /<script type="application\/json" id="app-data">[\s\S]*?<\/script>/;
const APP_MASCOTS_RE = /<script type="application\/json" id="app-mascots">[\s\S]*?<\/script>/;

/** app.html + данните от репото (repo) + маскотите (dash). Връща текста за публикуване, portraits.json и числата.
 *  Портретите (~0,9 MB) не са в главната страница: тя ги взима при първия профил (преглед на PR #498). */
export function buildApp(dash = DASH, reader = null, repo = repoReader(null)) {
  // Шаблонът е КОД — от работното дърво (в паметта още може да го няма); данните и маскотите — от reader/repo.
  let html = stripDocumentWrapper(readFileSync(join(dash, "app.html"), "utf8"));
  if (!APP_DATA_RE.test(html) || !APP_MASCOTS_RE.test(html)) throw new Error("app.html няма местата за данни (app-data/app-mascots) — страницата е сменена");
  const data = buildAppData(repo);
  // Само растерни кадри: правилото „никога SVG“ (страницата и без това приема само webp/png/jpeg).
  const raster = (m) => Object.fromEntries(Object.entries(m).filter(([, u]) => /^data:image\/(webp|png|jpeg);base64,/.test(u)));
  const mascots = { icons: raster(mascotDataUris(join(dash, "mascots"), reader)), portraits: {} };
  const portraitsJson = JSON.stringify(raster(mascotPortraitUris(join(dash, "mascots"), reader)));
  const dataJson = embedJson(data), mascotsJson = embedJson(mascots);
  html = html.replace(APP_DATA_RE, () => `<script type="application/json" id="app-data">${dataJson}</script>`);
  html = html.replace(APP_MASCOTS_RE, () => `<script type="application/json" id="app-mascots">${mascotsJson}</script>`);
  assertPublishable(html, { "данните на агентите": dataJson, "маскотите": mascotsJson });
  const leaks = findSecretsIn(portraitsJson); // публикува се до страницата — същата проверка за тайни
  if (leaks.length) throw new Error(`portraits.json съдържа шаблон за тайна (${leaks.map((l) => l.name).join(", ")}) — НЕ публикувай`);
  return { html, portraitsJson, agents: data.agents.length, teams: data.teams.length };
}

/** Галактиката като самостоятелна страница (`galaxy.html` в `files`): цял документ + връщане към агентите. */
export function galaxyDocument(inner) {
  const back = '<a href="index.html" onclick="if(history.length>1){history.back();return false}" '
    + 'style="position:fixed;z-index:9999;left:12px;bottom:calc(12px + env(safe-area-inset-bottom,0px));padding:8px 14px;border-radius:999px;'
    + 'background:rgba(15,18,40,.82);color:#fff;font:600 14px/1.2 system-ui,sans-serif;text-decoration:none;border:1px solid rgba(255,255,255,.2)">← Агентите</a>';
  return `<!doctype html>\n<html lang="bg"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"></head><body>\n${back}\n${inner}</body></html>\n`;
}

/** Целият билд. Връща готовия за публикуване текст + числата за доклада. */
export function build(dash = DASH, reader = null) {
  const rd = reader || { read: (p) => readFileSync(join(dash, p), "utf8") };
  let html = stripDocumentWrapper(rd.read("index.html"));

  const docs = rd.read("docs.js").trim();
  if (!html.includes(DOCS_TAG)) throw new Error(`не намирам ${DOCS_TAG} — таблото е сменено`);
  // Замяна с ФУНКЦИЯ, не с низ: в низа `$`` / `$'` / `$&` са шаблони — „(`$`)“ в rilievi/CLAUDE.md
  // вмъкна цялото начало на страницата втори път (31.10.2026, 58 агента вместо 29).
  html = html.replace(DOCS_TAG, () => `<script>\n${docs}\n</script>`);

  if (html.includes(WAITING_TAG)) {
    let waiting = "window.WAITING = null;";
    try { waiting = rd.read("waiting.js").trim(); } catch { /* няма снимка — панелът не се показва */ }
    html = html.replace(WAITING_TAG, () => `<script>\n${waiting}\n</script>`);
  }

  // Галактиката: условно (виж бележката при GALAXY_TAG) — по-стари върхове на паметта я нямат.
  let galaxy = "";
  if (html.includes(GALAXY_TAG)) {
    galaxy = rd.read("galaxy.js").trim();
    html = html.replace(GALAXY_TAG, () => `<script>\n${galaxy}\n</script>`);
  }

  const icons = mascotDataUris(join(dash, "mascots"), reader);
  if (!html.includes(IMG_SRC)) throw new Error("не намирам <img src> към mascots/ — таблото е сменено");
  html = html.replace(IMG_SRC, () => IMG_SRC_INLINE);

  // Картата се обявява ПРЕДИ главния скрипт: top-level `const` е видим за следващите блокове.
  // Ръчният билд я слагаше СЛЕД употребата — работеше, но само защото функцията се вика по-късно.
  const first = html.indexOf("<script>");
  if (first === -1) throw new Error("няма скрипт блок");
  const portraits = mascotPortraitUris(join(dash, "mascots"), reader);
  if (html.includes(PORTRAIT_SRC)) html = html.split(PORTRAIT_SRC).join(PORTRAIT_SRC_INLINE);
  html = `${html.slice(0, first)}<script>const MASCOT_ICONS = ${JSON.stringify(icons)};\nconst MASCOT_PORTRAITS = ${JSON.stringify(portraits)};</script>\n${html.slice(first)}`;

  // 3D маскотът: само ако таблото го зарежда (по-стари върхове на паметта нямат import-а).
  let m3d = "";
  if (html.includes(MASCOT3D_IMPORT)) {
    m3d = rd.read("mascot3d.js");
    const at = html.indexOf("<script>");
    html = `${html.slice(0, at)}${mascot3dLoader(m3d)}\n${html.slice(at)}`.split(MASCOT3D_IMPORT).join(MASCOT3D_IMPORT_INLINE);
  }

  assertPublishable(html, { "docs.js": docs, "galaxy.js": galaxy, "маскоти": JSON.stringify(icons) });

  const lessons = [...html.matchAll(/"lessons":\s*(\d+)/g)].map((m) => Number(m[1]));
  return { html, icons: Object.keys(icons).length, agents: lessons.length, lessons: lessons.reduce((a, b) => a + b, 0) };
}

if (isMain(import.meta.url)) {
  const argv = process.argv.slice(2);
  const flag = (k) => { const i = argv.indexOf(k); return i === -1 ? null : (argv[i + 1] || ""); };
  const mark = flag("--mark-published");
  if (mark !== null) {
    const sha = mark || memoryTip();
    if (!sha) { console.error("✗ няма връх на паметта за отбелязване"); process.exit(1); }
    writeFileSync(statePath(), JSON.stringify({ published: sha, url: ARTIFACT_URL, at: new Date().toISOString() }, null, 2) + "\n");
    console.log(`✓ артефактът е отбелязан като публикуван от ${sha.slice(0, 8)}`);
    const ff = fastForwardLocalMemory(sha);
    if (ff === "moved") console.log(`✓ локалният agents/memory е преместен напред до ${sha.slice(0, 8)} (беше изцяло зад него)`);
    process.exit(0);
  }
  const out = argv.find((a, i) => !a.startsWith("--") && argv[i - 1] !== "--ref") || join(ROOT, "galaxy-artifact.html");
  const ref = flag("--ref") ?? memoryTip();
  const reader = dashReader(ref);
  let r;
  try { r = build(DASH, ref ? reader : null); } catch (e) { // чисто съобщение, без стек; изход 1 = не публикувай
    console.error(`\x1b[31m✗ ${e.message}\x1b[0m`);
    process.exit(1);
  }
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
  // Главната страница = „Агентите“ (карти, профили, чат); галактиката — до нея като galaxy.html.
  let app;
  try { app = buildApp(DASH, ref ? reader : null, repoReader(ref)); } catch (e) {
    console.error(`\x1b[31m✗ страницата „Агентите“: ${e.message}\x1b[0m`);
    process.exit(1);
  }
  const galaxyOut = join(dirname(out), "galaxy.html"), portraitsOut = join(dirname(out), "portraits.json");
  writeFileSync(out, app.html);
  writeFileSync(galaxyOut, galaxyDocument(r.html));
  writeFileSync(portraitsOut, app.portraitsJson);
  console.log(`\x1b[32m✓\x1b[0m ${out} · ${(app.html.length / 1024 / 1024).toFixed(2)} MB · ${app.agents} агента в ${app.teams} екипа`);
  console.log(`\x1b[32m✓\x1b[0m ${galaxyOut} · ${(r.html.length / 1024 / 1024).toFixed(2)} MB · ${r.icons} маскота вградени`);
  console.log(`  източник: ${reader.source} · агенти: ${r.agents} · сума проверени поуки: ${r.lessons}`);
  console.log(`  публикувай на СЪЩИЯ адрес: ${ARTIFACT_URL}`);
  console.log(`    file_path: ${out}`);
  console.log(`    files: { "galaxy.html": "${galaxyOut}", "portraits.json": "${portraitsOut}" }`);
  console.log("    capabilities (само при първото публикуване на новата страница): { sample: {}, db: {}, user: {} }");
  if (ref) console.log(`  после: node tools/docs/build-artifact.mjs --mark-published ${ref}`);
}
