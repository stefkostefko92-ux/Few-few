#!/usr/bin/env node
// artifact-dir.mjs — артефактът на флота като ПАПКА (страница + файлове), не като един HTML.
//
// ЗАЩО. `build-artifact.mjs` вгражда всичко в един файл (~2.4 MB: таблото, FALLBACK с всички поуки,
// docs.js, галактиката, base64 маскоти), защото по-рано Artifact беше само ЕДИН файл. Сега Artifact
// публикува и съпътстващи файлове по относителен път. Публикуващият трябва да прочете ВСИЧКО, което
// публикува, а едната страница се сменя при всяка поука — значи всяко обновяване беше четене на
// 1.6 MB текст. Тук данните са ПО АГЕНТ: при нова поука се качват само файловете на агентите, които са
// се учили, + индексът; останалите стоят непокътнати на сървъра (Artifact пази непраснатите файлове).
//
//   node tools/docs/artifact-dir.mjs <папка> [--ref <ref>]       # строи; печата какво да се качи
//   node tools/docs/artifact-dir.mjs --mark-published <sha> <папка>   # СЛЕД успешно публикуване
//
// Какво прави спрямо таблото (agents-dashboard/):
//   1) страницата = index.html без обвивката; FALLBACK (огледало на agents.json) → само meta, а
//      `fetch("./agents.json")` → `fetchAgents()`, който сглобява същия обект от data/index.json +
//      data/agents/<id>.json — кодът на таблото не се пипа;
//   2) вградената галактика (base64 JPEG) → galaxy.jpg;
//   3) docs.js, galaxy.js, mascot3d.js, маскотите — както са, по същите относителни пътища.

import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { findSecretsIn } from "./artifact-secrets.mjs";
import {
  assertPublishable, ARTIFACT_URL, dashReader, memoryTip, statePath, stripDocumentWrapper,
} from "./build-artifact.mjs";
import { findFallbackBlock } from "../lib/dashboard-fallback.mjs";

const AGENTS_FETCH = 'fetch("./agents.json")';
const DATA_MARKER = "let DATA = FALLBACK;";
const GALAXY_RE = /const GALAXY_SRC = "data:image\/jpeg;base64,([A-Za-z0-9+/=]+)";/;
const MANIFEST = ".manifest.json";
/** Текстовите файлове, които таблото тегли по относителен път (ако ги има в този връх). */
const SCRIPTS = ["docs.js", "galaxy.js", "mascot3d.js"];

/** Сглобява agents.json от файловете по агент — същият обект, без да се пипа кодът на таблото. */
export const FETCH_AGENTS = `// Артефактът е папка: данните са по агент (качват се само променените) — tools/docs/artifact-dir.mjs.
function fetchAgents() {
  const get = (p) => fetch(p).then((r) => { if (!r.ok) throw 0; return r.json(); });
  return get("./data/index.json").then((ix) =>
    Promise.all(ix.agents.map((id) => get(\`./data/agents/\${encodeURIComponent(id)}.json\`))).then(
      (agents) => ({ ok: true, json: () => ({ ...ix, agents }) })));
}
`;

const sha = (buf) => createHash("sha256").update(buf).digest("hex");

/** Страницата: без обвивка, FALLBACK само с meta, данните през fetchAgents(). */
export function pageFrom(indexHtml) {
  let html = stripDocumentWrapper(indexHtml);
  const b = findFallbackBlock(html);
  if (!b) throw new Error("няма `const FALLBACK = {…}` — таблото е сменено");
  const fallback = JSON.parse(html.slice(b.begin, b.end + 1));
  html = html.slice(0, b.begin) + JSON.stringify({ meta: fallback.meta ?? {}, agents: [] }) + html.slice(b.end + 1);
  if (html.split(AGENTS_FETCH).length !== 2) throw new Error(`очаквам точно един ${AGENTS_FETCH}`);
  if (!html.includes(DATA_MARKER)) throw new Error(`няма „${DATA_MARKER}“ — таблото е сменено`);
  html = html.replace(AGENTS_FETCH, "fetchAgents()").replace(DATA_MARKER, `${FETCH_AGENTS}${DATA_MARKER}`);
  let galaxy = null;
  const g = GALAXY_RE.exec(html);
  if (g) {
    galaxy = Buffer.from(g[1], "base64");
    html = html.replace(GALAXY_RE, 'const GALAXY_SRC = "./galaxy.jpg";');
  }
  return { ...splitInline(html), galaxy };
}

/**
 * Вградените `<style>` и обикновени `<script>` → page-N.css/js на същото място и в същия ред.
 * Публикуването винаги праща страницата, а публикуващият чете всичко, което праща — затова
 * страницата е тънка обвивка (разметка + връзки), а кодът на таблото е във файлове, които се
 * качват само когато се сменят. Класическите скриптове по `src` се изпълняват в реда си и делят
 * глобалния обхват — поведението е същото като при вградените. importmap остава вграден.
 */
export function splitInline(html) {
  const assets = [];
  let n = 0;
  // ЕДИН проход по реда на документа: съдържанието на скрипт се поглъща цяло, затова `<style>` в
  // низ ВЪТРЕ в скрипт (SVG-то на маскота) не се пипа — реален бъг на първата версия.
  html = html.replace(/<script\b([^>]*)>([\s\S]*?)<\/script>|<style>([\s\S]*?)<\/style>/g, (all, attrs, js, css) => {
    if (css !== undefined) {
      const path = `page-${++n}.css`;
      assets.push({ path, data: `${css.trim()}\n` });
      return `<link rel="stylesheet" href="./${path}" />`;
    }
    if (attrs.trim() !== "") return all; // src=…, type="importmap" — остават както са
    const path = `page-${++n}.js`;
    assets.push({ path, data: `${js.trim()}\n` });
    return `<script src="./${path}"></script>`;
  });
  return { html, assets };
}

/** Данните по агент: data/index.json (meta + реда на агентите) и data/agents/<id>.json. */
export function dataFiles(agentsJson) {
  const { agents, ...rest } = agentsJson;
  const out = [{ path: "data/index.json", data: `${JSON.stringify({ ...rest, agents: agents.map((a) => a.id) }, null, 2)}\n` }];
  for (const a of agents) {
    if (!/^[a-z0-9-]+$/.test(a.id)) throw new Error(`неочаквано id на агент: ${a.id}`);
    out.push({ path: `data/agents/${a.id}.json`, data: `${JSON.stringify(a, null, 2)}\n` });
  }
  return out;
}

/** Целият билд като списък файлове {path, data, text}; страницата е `index.html`. */
export function buildDir(reader) {
  const { html, galaxy, assets } = pageFrom(reader.read("index.html"));
  const files = [{ path: "index.html", data: html, text: true }, ...assets.map((a) => ({ ...a, text: true }))];
  const code = [html, ...assets.map((a) => a.data)].join("\n");
  for (const f of SCRIPTS) if (code.includes(`./${f}`)) files.push({ path: f, data: reader.read(f), text: true });
  if (galaxy) files.push({ path: "galaxy.jpg", data: galaxy, text: false });
  for (const f of reader.list("mascots")) {
    if (f.endsWith("-icon3d.webp") || f.endsWith("-portrait3d.webp"))
      files.push({ path: `mascots/${f}`, data: reader.readBuf(`mascots/${f}`), text: false });
  }
  for (const d of dataFiles(JSON.parse(reader.read("agents.json")))) files.push({ ...d, text: true });
  // Тайни: по ЦЕЛИЯ текст, който излиза (страница, скриптове, данни) — като билда в един файл.
  assertPublishable(html);
  if (/<script>|<style>/.test(html)) throw new Error("остана вграден <script>/<style> в страницата");
  const leaks = files.filter((f) => f.text).flatMap((f) => findSecretsIn(String(f.data)).map((l) => `${f.path}: ${l.name} · ред ${l.line}`));
  if (leaks.length) throw new Error(`шаблон за тайна в билда — НЕ публикувай:\n  ${leaks.join("\n  ")}`);
  return files;
}

/** Манифест път → sha256 (без страницата не се публикува нищо, затова тя винаги е вътре). */
export const manifestOf = (files) => Object.fromEntries(files.map((f) => [f.path, sha(Buffer.from(f.data))]));

/** Какво да се качи спрямо публикуваното: нови/сменени пътища и махнати (→ null при публикуване). */
export function diffManifest(prev, next) {
  const changed = Object.keys(next).filter((p) => !prev || prev[p] !== next[p]);
  const removed = prev ? Object.keys(prev).filter((p) => !(p in next)) : [];
  return { changed, removed };
}

function readState() {
  try { return JSON.parse(readFileSync(statePath(), "utf8")); } catch { return {}; }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const argv = process.argv.slice(2);
  const flag = (k) => { const i = argv.indexOf(k); return i === -1 ? null : (argv[i + 1] || ""); };
  const positional = argv.filter((a, i) => !a.startsWith("--") && !["--ref", "--mark-published"].includes(argv[i - 1]));
  const out = positional[0];
  if (!out) { console.error("употреба: node tools/docs/artifact-dir.mjs <папка> [--ref <ref>] | --mark-published <sha> <папка>"); process.exit(2); }
  const mark = flag("--mark-published");
  if (mark !== null) {
    const tip = mark || memoryTip();
    const manifest = JSON.parse(readFileSync(join(out, MANIFEST), "utf8"));
    writeFileSync(statePath(), `${JSON.stringify({ published: tip, url: ARTIFACT_URL, at: new Date().toISOString(), manifest }, null, 2)}\n`);
    console.log(`✓ артефактът е отбелязан като публикуван от ${tip.slice(0, 8)} (${Object.keys(manifest).length} файла)`);
    process.exit(0);
  }
  const ref = flag("--ref") ?? memoryTip();
  let files;
  try { files = buildDir(dashReader(ref)); } catch (e) { console.error(`\x1b[31m✗ ${e.message}\x1b[0m`); process.exit(1); }
  rmSync(out, { recursive: true, force: true });
  for (const f of files) { mkdirSync(dirname(join(out, f.path)), { recursive: true }); writeFileSync(join(out, f.path), f.data); }
  const manifest = manifestOf(files);
  writeFileSync(join(out, MANIFEST), `${JSON.stringify(manifest, null, 2)}\n`);
  const { changed, removed } = diffManifest(readState().manifest, manifest);
  const bytes = (p) => Buffer.byteLength(files.find((f) => f.path === p).data);
  const textKb = changed.filter((p) => files.find((f) => f.path === p).text).reduce((s, p) => s + bytes(p), 0) / 1024;
  console.log(`\x1b[32m✓\x1b[0m ${out} · ${files.length} файла · източник ${ref ? ref.slice(0, 8) : "работното дърво"}`);
  console.log(`  за качване: ${changed.length} файла (${textKb.toFixed(0)} KB текст за прочит), махнати: ${removed.length}`);
  for (const p of changed) console.log(`    + ${p}`);
  for (const p of removed) console.log(`    − ${p}`);
  console.log(`  публикувай: file_path=${join(out, "index.html")}, url=${ARTIFACT_URL}, files = само горните (махнатите → null)`);
  if (ref) console.log(`  после: node tools/docs/artifact-dir.mjs --mark-published ${ref} ${out}`);
}
