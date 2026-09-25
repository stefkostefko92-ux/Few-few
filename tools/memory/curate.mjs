#!/usr/bin/env node
// tools/memory/curate.mjs — пазач срещу дрейф/подуване на паметта (v8.0).
//
// Употреба:
//   node tools/memory/curate.mjs                        # dry-run: какво би направил
//   node tools/memory/curate.mjs --write                # приложи точен дедуп + капване
//   node tools/memory/curate.mjs --merge-dups --write   # + семантично сливане на почти-дубли
//   node tools/memory/curate.mjs --check                # ГЕЙТ: пада при ТОЧНИ дубли (евтино, без O(n²))
//
// Защо има --check (Кръг 12, 2026-08-04). Инструментът беше СПОСОБЕН и записан като процедура в 5+
// дефиниции, но не се викаше от НИЩО — нито гейт, нито кука, нито CI (`grep -c curate gate.mjs` → 0).
// Спящ инструмент = нула, колкото и добър да е; и точно в този момент в паметта имаше 2 реални
// точни дубла (dizayner.md, секция „Карантина“ — тоест НЕ инжектирани, значи цената им беше дрейф
// на файла, не токени; в „Проверени поуки“ същият дублат щеше да се плаща на всеки старт). Гейтва се само
// ТОЧНИЯТ дедуп: той е механичен и еднозначен (`--write` го оправя). Парафразите, числовите
// противоречия и застаряването остават за ЧОВЕК — те са преценка, не дефект, и струват ~11s O(n²),
// които не бива да са в пътя на всеки PR. Затова `--check` НЕ пуска сравненията по прилика.
//
// За всеки .claude/agents/_memory/<id>.md:
//  - маха ТОЧНО дублирани поуки (по нормализиран текст) в „Проверени поуки“ и „Карантина“;
//  - при --merge-dups: слива и БЛИЗКИ парафрази (Jaccard ≥ MERGE_THRESHOLD=0.82) — пази
//    по-информативната (по-дългата) от двойката, маха парафраза. Само много висока прилика =
//    редундантност, НЕ противоречие; средният диапазон (SIM..MERGE) остава само флагнат;
//  - НЕ архивира истинско знание: агентите нямат лимит на наученото (MAX_PER_SECTION=∞);
//    единствено дубли/парафрази и противоречия се третират — реалните поуки се пазят;
//  - маркира ВЪЗМОЖНИ противоречия (висока прилика между две поуки) за ЧОВЕШКО решение —
//    не трие и не презаписва мълчаливо (закон: противоречие → стоп).
//
// v8.0: БЛОК-осъзнат. Всяка поука е блок = реда „- …“ + всички следващи continuation редове
//   (заглъбен текст, не нов bullet, не заглавие, не празен ред). Дедуп/сливане/сравнение
//   работят върху ЦЕЛИЯ текст на блока (източникът `_(…)_` често е на continuation ред), а
//   записът пази блоковете НЕДОКОСНАТИ и в оригиналния им ред (никакво разбъркване на редове).

import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

// CURATE_MEM_DIR позволява тестът да пусне ИНСТРУМЕНТА върху фикстура вместо върху живата памет.
// Без него CLI тестът щеше да съди СЪСТОЯНИЕТО на репото („днес няма дубли“) вместо поведението на
// инструмента — вече правена грешка: такъв тест е зелен, докато някой не добави дублат, и червен по
// причина, която няма нищо общо с кода.
const MEM_DIR = process.env.CURATE_MEM_DIR ||
  join(dirname(fileURLToPath(import.meta.url)), "..", "..", ".claude", "agents", "_memory");
const MAX_PER_SECTION = Infinity; // БЕЗ лимит — знанието на агентите не се архивира никога; само дубли/противоречия се третират
const SIM_THRESHOLD = 0.6; // Jaccard над това → вероятно дублат/противоречие (флаг за преглед)
const MERGE_THRESHOLD = 0.82; // Jaccard над това → почти сигурен ПАРАФРАЗ (не противоречие) → авто-сливане при --merge-dups
const STALE_DAYS = 45; // време-чувствителна поука по-стара от това → флаг за повторна проверка
const WRITE = process.argv.includes("--write");
// Семантична дедупликация: маха БЛИЗКИ парафрази (не точни дубли), но само при много висока
// прилика (≥MERGE_THRESHOLD) — това е редундантност, не противоречие; средният диапазон
// (SIM..MERGE) остава само флагнат за човек (закон: противоречие → стоп, не трий мълчаливо).
const MERGE_DUPS = process.argv.includes("--merge-dups");
// --merge-safe: слива близък-диапазон (SIM..MERGE) двойки САМО когато числовите им токени
// СЪВПАДАТ (парафраз, не противоречие). Числа се разминават → НЕ пипа, флагва за човек.
const MERGE_SAFE = process.argv.includes("--merge-safe");
// --check: гейт-режим. Само точният дедуп (евтин, еднозначен, механично поправим с --write);
// прескача O(n²) сравненията по прилика и застаряването — те са човешка преценка, не дефект.
const CHECK = process.argv.includes("--check");

// Време-чувствителни факти (версии, „latest“, дати, API дати) гният — flawlessness #8 (TTL/provenance).
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
// БЕЛЕЖКА (Трейдъра + Разбивача, 2026-07-29): да свържеш ЕТИКЕТ с ЧИСЛО в свободна проза е
// NLP-трудно — общ детектор върху ВСИЧКИ поуки или шуми (версии/URL: „edition 2≠4“), или
// пропуска реалния случай. Затова НЕ правим това.
// НО (2026-07-30): в БЛИЗКИЯ диапазон (Jaccard ≥ SIM) двата блока са ВЕЧЕ почти един и същ текст —
// тогава сравняваме само МНОЖЕСТВАТА числа, без да свързваме етикет с число. Съвпадат → парафраз
// (безопасно за сливане); разминават се → истинско числово противоречие (ξ 0.0065≠0.0019) → човек.
// Това е тясно и надеждно точно защото прилика ≥SIM вече е гарантирала, че говорят за същото.
export function numTokens(text) {
  const t = String(text).toLowerCase()
    .replace(/ /g, " ")
    .replace(/(\d)[ ,](?=\d{3}\b)/g, "$1"); // махни хилядни разделители: 52,428,800 → 52428800
  const out = new Set();
  let m;
  // числа/версии/прагове: 2026-06-24.dahlia, 8×1.25, 639-1, 0.05, 100. Lookbehind (?<!\p{L}) отрязва
  // ИДЕНТИФИКАТОРНИ цифри залепени за буква (B2C, MV3, SHA256, 3DS) — те са имена, не КОЛИЧЕСТВА, и
  // бяха източник на фалшиви „разлики“ (една парафраза изброява „B2B/B2C“, другата не). Реалните
  // количествени противоречия (95.91≠96, 0.0065≠0.0019) са самостоятелни числа → пак се хващат.
  const re = /(?<!\p{L})\d+(?:[.\-–×]\d+)*(?:\.[a-z]{2,})?/giu;
  while ((m = re.exec(t))) out.add(m[0].replace(/[–]/g, "-"));
  return out;
}
export function numDiff(a, b) {
  const A = numTokens(a), B = numTokens(b);
  const only = (X, Y) => [...X].filter((v) => !Y.has(v));
  const onlyA = only(A, B), onlyB = only(B, A);
  return { onlyA, onlyB, match: onlyA.length === 0 && onlyB.length === 0 };
}

function sectionBounds(lines, heading) {
  const start = lines.findIndex((l) => new RegExp(`^##\\s*${heading}`).test(l));
  if (start === -1) return null;
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i++) if (/^##\s/.test(lines[i])) { end = i; break; }
  return { start, end };
}

// Разбива тялото на секция на подредени елементи: bullet-блок (реда „- …“ + continuation редове)
// или суров ред (празен ред / въвеждащ текст преди първия bullet). Continuation = непразен ред,
// който НЕ започва с „- “. Празен ред затваря текущия блок и се пази като суров ред.
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
// одит-клас „код на върха при import“ (същият, за който имаме import-safety.test.mjs).
function main() {
let totalDup = 0, totalCap = 0, totalParaphrase = 0, totalNumConflict = 0, totalStale = 0, totalMerged = 0;

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
      // Докладвай КОЯ поука е дублат — иначе изходът казва „2 точни дубли“ без да казва къде,
      // и гейтът е неизползваем (собственикът не знае какво да оправи).
      if (seen.has(n)) {
        report.push(`  ⧉ ТОЧЕН ДУБЛАТ (${heading}): ${blockText(entries[i]).slice(0, 130)}…`);
        totalDup++; dropped.add(i); changed = true;
      } else seen.add(n);
    }

    // семантично сливане на почти-дубли (≥MERGE_THRESHOLD): пази по-информативния (по-дълъг) блок
    const live = () => bulletIdx.filter((i) => !dropped.has(i));
    if (MERGE_DUPS && !CHECK) {
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

    // близки дублати в средния диапазон: класифицирай по ЧИСЛОВИ ТОКЕНИ.
    //  • числата съвпадат → ПАРАФРАЗ (безопасно сливане при --merge-safe/--merge-dups);
    //  • числата се разминават → ИСТИНСКО числово противоречие → докладвай за ЧОВЕК, НЕ пипай (закон).
    const kept = live();
    for (let a = 0; !CHECK && a < kept.length; a++) {
      if (dropped.has(kept[a])) continue;
      for (let c = a + 1; c < kept.length; c++) {
        if (dropped.has(kept[c])) continue;
        const ta = blockText(entries[kept[a]]), tc = blockText(entries[kept[c]]);
        if (jaccard(ta, tc) < SIM_THRESHOLD) continue;
        const d = numDiff(ta, tc);
        if (!d.match) {
          report.push(`  ⚠ ЧИСЛА СЕ РАЗЛИЧАВАТ (${heading}) — човек решава, не пипам:\n     A само: ${d.onlyA.join(", ") || "—"}\n     B само: ${d.onlyB.join(", ") || "—"}\n     • ${ta.slice(0, 150)}\n     • ${tc.slice(0, 150)}`);
          totalNumConflict++;
        } else if (MERGE_SAFE || MERGE_DUPS) {
          const drop = ta.length >= tc.length ? kept[c] : kept[a];
          const keep = drop === kept[c] ? kept[a] : kept[c];
          report.push(`  ⇉ слято-безопасно (${heading}; числа съвпадат = парафраз):\n     ✓ ${blockText(entries[keep]).slice(0, 100)}…\n     ✗ ${blockText(entries[drop]).slice(0, 100)}…`);
          dropped.add(drop); totalMerged++; changed = true;
          if (drop === kept[a]) break;
        } else {
          report.push(`  ≈ парафраз (${heading}; числа съвпадат — добави --merge-safe за сливане):\n     • ${ta.slice(0, 120)}\n     • ${tc.slice(0, 120)}`);
          totalParaphrase++;
        }
      }
    }

    // застарели време-чувствителни проверени факти → флаг за повторна проверка (не трий)
    if (heading === "Проверени поуки" && !CHECK)
      for (const i of kept) {
        if (dropped.has(i)) continue;
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
  if (changed && WRITE && !CHECK) writeFileSync(file, lines.join("\n")), console.log(`  ✎ записан ${f}`);
}

if (CHECK) {
  // Гейтва се САМО механичното: точен дублат. Той не е преценка — една и съща поука, записана
  // два пъти. В „Проверени поуки“ се плаща двойно при всеки старт; в „Карантина“ е чист дрейф.
  console.log(`\ncurate --check: ${totalDup} точни дубли в паметта.`);
  if (totalDup) {
    console.error(`✗ ${totalDup} точни дубла — пусни \`node tools/memory/curate.mjs --write\`.`);
    process.exit(1);
  }
  console.log("✓ няма точни дубли. (Парафрази/числови противоречия/застаряване — пусни без --check, човек решава.)");
  process.exit(0);
}

const mergeHint = MERGE_SAFE || MERGE_DUPS ? "" : " (dry — добави --merge-safe за парафразите)";
console.log(`\ncurate: ${totalDup} точни дубли, ${totalMerged} слети парафрази${mergeHint}, ${totalCap} капнати, ` +
  `${totalParaphrase} парафрази за сливане, ${totalNumConflict} ЧИСЛОВИ противоречия (човек решава), ` +
  `${totalStale} застарели (>${STALE_DAYS}д).` +
  (WRITE ? " [записано]" : " [dry-run — добави --write за прилагане]"));
}

if (import.meta.url === `file://${process.argv[1]}`) main();
