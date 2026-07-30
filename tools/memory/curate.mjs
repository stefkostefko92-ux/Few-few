#!/usr/bin/env node
// tools/memory/curate.mjs — пазач срещу дрейф/подуване на паметта (v8.0).
//
// Употреба:
//   node tools/memory/curate.mjs                        # dry-run: какво би направил
//   node tools/memory/curate.mjs --write                # приложи точен дедуп + капване
//   node tools/memory/curate.mjs --merge-dups --write   # + семантично сливане на почти-дубли
//
// За всеки .claude/agents/_memory/<id>.md:
//  - маха ТОЧНО дублирани поуки (по нормализиран текст) в „Проверени поуки" и „Карантина";
//  - при --merge-dups: слива и БЛИЗКИ парафрази (Jaccard ≥ MERGE_THRESHOLD=0.82) — пази
//    по-информативната (по-дългата) от двойката, маха парафраза. Само много висока прилика =
//    редундантност, НЕ противоречие; средният диапазон (SIM..MERGE) остава само флагнат;
//  - НЕ архивира истинско знание: агентите нямат лимит на наученото (MAX_PER_SECTION=∞);
//    единствено дубли/парафрази и противоречия се третират — реалните поуки се пазят;
//  - маркира ВЪЗМОЖНИ противоречия (висока прилика между две поуки) за ЧОВЕШКО решение —
//    не трие и не презаписва мълчаливо (закон: противоречие → стоп).
//
// v8.0: БЛОК-осъзнат. Всяка поука е блок = реда „- …" + всички следващи continuation редове
//   (заглъбен текст, не нов bullet, не заглавие, не празен ред). Дедуп/сливане/сравнение
//   работят върху ЦЕЛИЯ текст на блока (източникът `_(…)_` често е на continuation ред), а
//   записът пази блоковете НЕДОКОСНАТИ и в оригиналния им ред (никакво разбъркване на редове).

import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const MEM_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "..", ".claude", "agents", "_memory");
const MAX_PER_SECTION = Infinity; // БЕЗ лимит — знанието на агентите не се архивира никога; само дубли/противоречия се третират
const SIM_THRESHOLD = 0.6; // Jaccard над това → вероятно дублат/противоречие (флаг за преглед)
const MERGE_THRESHOLD = 0.82; // Jaccard над това → почти сигурен ПАРАФРАЗ (не противоречие) → авто-сливане при --merge-dups
const STALE_DAYS = 45; // време-чувствителна поука по-стара от това → флаг за повторна проверка
const WRITE = process.argv.includes("--write");
// Семантична дедупликация: маха БЛИЗКИ парафрази (не точни дубли), но само при много висока
// прилика (≥MERGE_THRESHOLD) — това е редундантност, не противоречие; средният диапазон
// (SIM..MERGE) остава само флагнат за човек (закон: противоречие → стоп, не трий мълчаливо).
const MERGE_DUPS = process.argv.includes("--merge-dups");

// Време-чувствителни факти (версии, „latest", дати, API дати) гният — flawlessness #8 (TTL/provenance).
const TIME_SENSITIVE = /верси|latest|текущ|\bv?\d+\.\d+|\b20\d\d\b|API \d|stable|release/i;
function lessonDate(bullet) { const m = bullet.match(/\*\*(\d{4}-\d{2}-\d{2})/); return m ? m[1] : null; }
function daysSince(d) { return (Date.now() - new Date(d + "T00:00:00Z").getTime()) / 86400000; }

const SECTIONS = ["Проверени поуки", "Карантина"];

function norm(s) {
  return s.toLowerCase().replace(/\*\*/g, "").replace(/[`'"„“”]/g, "").replace(/_\(.*?\)_/g, "")
    .replace(/\s+/g, " ").replace(/[.;,]+$/, "").trim();
}
function tokens(s) { return new Set(norm(s).split(" ").filter((w) => w.length > 3)); }
function jaccard(a, b) {
  const A = tokens(a), B = tokens(b);
  if (!A.size || !B.size) return 0;
  let inter = 0; for (const x of A) if (B.has(x)) inter++;
  return inter / (A.size + B.size - inter);
}
// БЕЛЕЖКА (Трейдъра + Разбивача, 2026-07-29): лексикалната прилика пропуска ЧИСЛОВО противоречие
// (ξ=0.0065/ден срещу 0.0019/ден; EPL 3.28 срещу 2.93 гол/мач). Опитах регекс-детектор тук и го
// МАХНАХ: надеждно да свържеш етикет с число в свободна проза е NLP-трудно — детекторът или шуми
// (лови версии/URL: „edition 2≠4", „https 3≠2"), или пропуска реалния случай („TBT е 200 ms" —
// етикетът е 2 думи преди числото). Проверка, която само ИЗГЛЕЖДА че работи, е по-лоша от липса.
// Конкретните числови противоречия се маршрутизират към собственика на паметта (човек решава).

function sectionBounds(lines, heading) {
  const start = lines.findIndex((l) => new RegExp(`^##\\s*${heading}`).test(l));
  if (start === -1) return null;
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i++) if (/^##\s/.test(lines[i])) { end = i; break; }
  return { start, end };
}

// Разбива тялото на секция на подредени елементи: bullet-блок (реда „- …" + continuation редове)
// или суров ред (празен ред / въвеждащ текст преди първия bullet). Continuation = непразен ред,
// който НЕ започва с „- ". Празен ред затваря текущия блок и се пази като суров ред.
function parseEntries(body) {
  const entries = [];
  let cur = null;
  for (const l of body) {
    if (l.trim().startsWith("- ")) { if (cur) entries.push(cur); cur = { type: "bullet", lines: [l] }; }
    else if (cur && l.trim() !== "") { cur.lines.push(l); }
    else { if (cur) { entries.push(cur); cur = null; } entries.push({ type: "raw", line: l }); }
  }
  if (cur) entries.push(cur);
  return entries;
}
const blockText = (e) => e.lines.map((l) => l.trim()).join(" ");

// CLI guard: без него целият обход на паметта се пуска при `import` и виси — президентски
// одит-клас „код на върха при import" (същият, за който имаме import-safety.test.mjs).
function main() {
let totalDup = 0, totalCap = 0, totalConflict = 0, totalStale = 0, totalMerged = 0;

for (const f of readdirSync(MEM_DIR).filter((x) => x.endsWith(".md") && x !== "PROTOCOL.md")) {
  const file = join(MEM_DIR, f);
  let lines = readFileSync(file, "utf8").split("\n");
  let changed = false;
  const report = [];

  for (const heading of SECTIONS) {
    const b = sectionBounds(lines, heading);
    if (!b) continue;
    const body = lines.slice(b.start + 1, b.end);
    const entries = parseEntries(body);
    const bulletIdx = entries.map((e, i) => (e.type === "bullet" ? i : -1)).filter((i) => i >= 0);

    // точен дедуп (пази първото срещане = най-новото отгоре)
    const seen = new Set();
    const dropped = new Set(); // индекси в `entries`, махнати като дубли/парафрази
    for (const i of bulletIdx) {
      const n = norm(blockText(entries[i]));
      if (seen.has(n)) { totalDup++; dropped.add(i); changed = true; } else seen.add(n);
    }

    // семантично сливане на почти-дубли (≥MERGE_THRESHOLD): пази по-информативния (по-дълъг) блок
    const live = () => bulletIdx.filter((i) => !dropped.has(i));
    if (MERGE_DUPS) {
      const idx = live();
      for (let a = 0; a < idx.length; a++) {
        if (dropped.has(idx[a])) continue;
        for (let c = a + 1; c < idx.length; c++) {
          if (dropped.has(idx[c])) continue;
          const ta = blockText(entries[idx[a]]), tc = blockText(entries[idx[c]]);
          if (jaccard(ta, tc) >= MERGE_THRESHOLD) {
            const drop = ta.length >= tc.length ? idx[c] : idx[a];
            const keep = drop === idx[c] ? idx[a] : idx[c];
            report.push(`  ⇉ слято (${heading}): пази по-пълния, маха парафраза\n     ✓ ${blockText(entries[keep]).slice(0, 100)}…\n     ✗ ${blockText(entries[drop]).slice(0, 100)}…`);
            dropped.add(drop); totalMerged++; changed = true;
            if (drop === idx[a]) break;
          }
        }
      }
    }

    // противоречия/близки дублати в средния диапазон (докладвай, не трий)
    const kept = live();
    for (let a = 0; a < kept.length; a++)
      for (let c = a + 1; c < kept.length; c++) {
        const ta = blockText(entries[kept[a]]), tc = blockText(entries[kept[c]]);
        if (jaccard(ta, tc) >= SIM_THRESHOLD) { report.push(`  ⚠ близки (${heading}): \n     • ${ta}\n     • ${tc}`); totalConflict++; }
      }

    // застарели време-чувствителни проверени факти → флаг за повторна проверка (не трий)
    if (heading === "Проверени поуки")
      for (const i of kept) {
        const t = blockText(entries[i]), d = lessonDate(t);
        if (d && TIME_SENSITIVE.test(t) && daysSince(d) > STALE_DAYS) {
          report.push(`  ⏳ застаряло (${Math.round(daysSince(d))}д, ${d}): ${t.slice(0, 110)}…`); totalStale++;
        }
      }

    if (!changed) continue;
    // реконструкция: пази реда, изхвърля само махнатите блокове, запазва continuation редовете
    const newBody = [];
    entries.forEach((e, i) => {
      if (dropped.has(i)) return;
      if (e.type === "bullet") newBody.push(...e.lines);
      else if (e.line.trim() && !/архивирани/.test(e.line)) newBody.push(e.line);
      else if (e.line.trim() === "") newBody.push(e.line);
    });
    lines = [...lines.slice(0, b.start + 1), ...newBody, ...lines.slice(b.end)];
  }

  if (report.length) console.log(`\n${f}:`), report.forEach((r) => console.log(r));
  if (changed && WRITE) writeFileSync(file, lines.join("\n")), console.log(`  ✎ записан ${f}`);
}

console.log(`\ncurate: ${totalDup} дубли, ${totalMerged} слети парафрази${MERGE_DUPS ? "" : " (само dry — добави --merge-dups)"}, ${totalCap} капнати, ${totalConflict} за преглед (противоречия), ${totalStale} застарели (>${STALE_DAYS}д, време-чувствителни).` +
  (WRITE ? " [записано]" : " [dry-run — добави --write за прилагане]"));
}

if (import.meta.url === `file://${process.argv[1]}`) main();
