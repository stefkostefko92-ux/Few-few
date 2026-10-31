#!/usr/bin/env node
// promote.mjs — ЕДИНСТВЕНИЯТ път Карантина → „Проверени поуки“ (Кръг 13, 2026-08-04).
//
// Защо съществува. `quarantine-review.mjs` показа, че 343 от 514 карантинирани поуки носят
// източник, който днес минава проверката (290 отпреди 2026-07-27 = жертви на два вече поправени
// дефекта). Знанието е реално, но седи в секция, която НЕ се инжектира. Пътят обратно обаче
// НЕ СЪЩЕСТВУВАШЕ: единственият писач в „Проверени поуки“ беше `memory-capture.mjs` (куката).
// Без този инструмент всяка пресверена поука щеше да влезе като НОВ запис, а старата да остане —
// 343 почти-дубликата, които `curate` не лови (той маха само ТОЧНИ дубли).
//
// ГЛАВНОТО СВОЙСТВО ЗА БЕЗОПАСНОСТ: текстът на поуката се взема от ФАЙЛА, никога от вердикта.
// Агентът може само да ПРЕКЛАСИФИЦИРА (потвърдена / опровергана / остава) — не може да промени
// съдържанието по този канал. Така пресверяването не е път за тиха подмяна на факт (нито от
// сгрешил агент, нито от инжектирано в източника съдържание).
//
// Вердикти (JSON масив):
//   [{ "lid": "1a2b3c4d", "verdict": "потвърдена", "source": "https://…", "note": "…" }]
//     потвърдена  → мести в „Проверени поуки“, увереност → verified, източник → ЖИВО сверения,
//                   датата се маркира „(пресверена YYYY-MM-DD)“. Иска РЕАЛЕН източник, иначе отказ.
//     опровергана → ОСТАВА в Карантина, маркира се „ОПРОВЕРГАНА“ + дата + бележка. Никога не трие
//                   (закон: не пренаписвай памет мълчаливо — опровержението е знание, не боклук).
//     остава      → нищо.
//
// От 2026-10-24 и ПРОВЕРЕНИ поуки (просрочените на `memory-freshness --agent <id>`): дотогава пътят
// за пресверка съществуваше само за Карантината, а срокът се смяташе от датата на научаването —
// пресверена поука оставаше просрочена завинаги и опашката (338) само растеше.
//     потвърдена  → остава НА МЯСТО, маркер „(пресверена YYYY-MM-DD)“ + живо сверения източник;
//                   по желание `next: YYYY-MM-DD` = нов изричен срок (метаданни, не съдържание).
//     опровергана → СВАЛЯ СЕ в Карантина с маркер ОПРОВЕРГАНА (не се инжектира повече, не се трие).
//                   Иска `note` — свалянето на проверено знание без причина е тиха подмяна.
//
//   node tools/memory/promote.mjs --agent <id> --verdicts <файл.json>            # dry-run
//   node tools/memory/promote.mjs --agent <id> --verdicts <файл.json> --write
//   (31.10.2026) { "lid", "verdict": "дубъл", "of": "<lid на запазената>" } · { "lid", "verdict": "премести", "to": "<агент>", "note" }

import { readFileSync, writeFileSync, existsSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { isRealSource } from "../agents/oversee-lib.mjs";
import { lessonId } from "./quarantine-review.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const MEM_DIR = process.env.CURATE_MEM_DIR || join(ROOT, ".claude", "agents", "_memory");

export const VERDICTS = ["потвърдена", "опровергана", "остава", "дубъл", "премести"];
// „дубъл“ (31.10.2026): проверена поука, която повтаря друга от същата памет (`of`) — слиза в Карантина
// с маркер „ДУБЪЛ на <of>“. Не е „опровергана“: знанието е вярно, просто вече стои другаде.
// „премести“: поука от чужд домейн (`to` = id на агент) — в източника слиза с маркер „ПРЕМЕСТЕНА при“,
// а редът (с „(преместено от <агент> <дата>)“) влиза най-горе в проверените на целта.

/** Разбива опашката `_(обхват; увереност; източник)_` на части. Източникът може да съдържа „;“. */
export function splitTail(bullet) {
  const m = String(bullet).match(/_\((.*)\)_\s*$/);
  if (!m) return null;
  const parts = m[1].split(";");
  if (parts.length < 2) return null;
  return { scope: parts[0].trim(), confidence: parts[1].trim(), source: parts.slice(2).join(";").trim() };
}

const REVERIFY_RE = /;?\s*re-?verify:?\s*(\d{4}-\d{2}-\d{2})/i;

/**
 * Пренаписва САМО опашката и датовия префикс. Тялото на поуката остава дословно.
 * Изричният срок в опашката (`; re-verify: ДАТА`) се пази, докато е в бъдещето — подмяната на
 * източника иначе щеше тихо да изтрие човешкия срок; минал срок е изпълнен с тази пресверка.
 * `next` го подменя.
 */
export function promoteBullet(bullet, newSource, today, next = null) {
  const tail = splitTail(bullet);
  const src = newSource.replace(REVERIFY_RE, "").trim();
  // Поука в стар формат — без опашка, източникът е в прозата („(Източник: собствен инструмент.)“).
  // Пресверката ѝ слага стандартна опашка с живо сверения източник; тялото остава дословно.
  // До 2026-10-24 такава поука беше НЕАДРЕСИРУЕМА: „не мога да разчета опашката“ спираше целия пакет.
  if (!tail) {
    if (/_\((.*)\)_\s*$/.test(bullet)) return null;              // опашка има, но е счупена → не гадай
    return markReverified(`${bullet.trimEnd()} _(общо; verified; ${src}${next ? `; re-verify: ${next}` : ""})_`, today);
  }
  const old = (tail.source.match(REVERIFY_RE) || [])[1];
  const due = next || (old && old > today ? old : null);
  const withTail = bullet.replace(/_\((.*)\)_\s*$/,
    `_(${tail.scope}; verified; ${src}${due ? `; re-verify: ${due}` : ""})_`);
  return markReverified(withTail, today);
}

/** „- **2026-07-24:**“ → „- **2026-07-24 (пресверена 2026-08-04):**“ — подменя стар маркер, пази друга история. */
function markReverified(withTail, today) {
  // „- **2026-07-24:**“ → „- **2026-07-24 (пресверена 2026-08-04):**“ — конвенцията, която паметта
  // вече ползва за преместени записи. Дата без промяна означава „не е пипано“, което би било лъжа.
  //
  // Съществуваща скоба се ПАЗИ (напр. „(преместено от verified …)“ е история, не шум), ОСВЕН ако е
  // предишен маркер за пресверяване — той се ПОДМЕНЯ. Първата версия го запазваше и на втори пуск
  // редът носеше два маркера „(пресверена …)“; тестът го хвана.
  return withTail.replace(/^(-\s*\*\*)([\d-]{10})((?:\s*\([^)]*\))?)(:\*\*)/,
    (_, a, d, paren, z) => `${a}${d} (пресверена ${today})${/пресверена/.test(paren) ? "" : paren}${z}`);
}

/** Маркира опроверган запис. Остава в Карантина — опровержението е знание. */
export function refuteBullet(bullet, note, today) {
  if (/^-\s*\*\*[^*]*\*\*:?\s*ОПРОВЕРГАНА/.test(bullet)) return bullet;   // идемпотентно
  return bullet.replace(/^(-\s*\*\*[^*]*\*\*:?\s*)/,
    `$1ОПРОВЕРГАНА ${today}${note ? ` (${note})` : ""} — `);
}

/**
 * Сваля проверена поука: маркер ОПРОВЕРГАНА + увереност verified → unverified. Увереността се сменя,
 * за да не остане в Карантина запис, който твърди за себе си, че е проверен.
 */
export function demoteBullet(bullet, note, today) {
  return unverify(bullet, refuteBullet(bullet, note, today));
}

function unverify(original, marked) {
  const tail = splitTail(original);
  if (!tail) return marked;
  return marked.replace(/_\((.*)\)_\s*$/, `_(${tail.scope}; unverified; ${tail.source})_`);
}

/** Маркер пред текста (ДУБЪЛ на … / ПРЕМЕСТЕНА при …) + увереност → unverified. */
function markBullet(bullet, marker, note) {
  const marked = bullet.replace(/^(-\s*\*\*[^*]*\*\*:?\s*)/, `$1${marker}${note ? ` (${note})` : ""} — `);
  return unverify(bullet, marked);
}

/** „- **2026-07-25:**“ → „- **2026-07-25 (преместено от <агент> <дата>):**“ — пази друга история в скобите. */
export function movedBullet(bullet, from, today) {
  return bullet.replace(/^(-\s*\*\*)([\d-]{10}(?:\s*\([^)]*\))*)(:\*\*)/, (_, a, d, z) => `${a}${d} (преместено от ${from} ${today})${z}`);
}

/** Вмъква поуки най-горе в „## Проверени поуки“ (целта на „премести“). */
export function insertVerified(md, newLines) {
  const lines = String(md).split("\n");
  const at = lines.findIndex((l) => /^##\s*Проверени поуки/.test(l));
  if (at === -1) throw new Error("целевата памет няма секция „Проверени поуки“");
  lines.splice(at + 1, 0, ...newLines);
  return lines.join("\n");
}

function sectionBounds(lines, heading) {
  const start = lines.findIndex((l) => new RegExp(`^##\\s*${heading}`).test(l));
  if (start === -1) return null;
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i++) if (/^##\s/.test(lines[i])) { end = i; break; }
  return { start, end };
}

/**
 * Прилага вердиктите върху съдържанието на един файл-памет. Чиста функция (текст → текст + отчет),
 * за да е тествана без да се пипа живата памет.
 */
export function applyVerdicts(md, verdicts, today, ctx = {}) {
  const lines = md.split("\n");
  const q = sectionBounds(lines, "Карантина");
  const v = sectionBounds(lines, "Проверени поуки");
  if (!q || !v) return { error: "липсва секция „Карантина“ или „Проверени поуки“" };

  // Индекс: lid → диапазон редове, по секция. БЛОКОВО, не по суров ред.
  //
  // Реален дефект (Кръг 13): индексирах по `lines[i]`, а `quarantine-review` смята lid-а върху
  // склеен БЛОК (`sectionBullets` лепи continuation редовете). Поука, чийто запис минава на втори
  // ред — включително когато под нея е останал стар плейсхолдър `_(празно …)_` — получаваше два
  // различни lid-а и ставаше НЕАДРЕСИРУЕМА. Хванато на живо: `skorostnika/e6503e11` (id от блок)
  // срещу `2b83ba8e` (id от ред). Fail-closed го обяви като „няма такава поука" вместо да сгреши
  // тихо — затова нищо не се повреди, но поуката не можеше да се промотира.
  const index = (sec) => {
    const m = new Map();
    for (let i = sec.start + 1; i < sec.end; i++) {
      if (!lines[i].trim().startsWith("- ")) continue;
      let end = i;
      while (end + 1 < sec.end && lines[end + 1].trim() !== "" && !lines[end + 1].trim().startsWith("- ")) end++;
      const block = lines.slice(i, end + 1).map((l) => l.trim()).join(" ");
      m.set(lessonId(block), { i, end });
      i = end;
    }
    return m;
  };
  const inQuar = index(q), inVer = index(v);

  const promoted = [], reverified = [], refuted = [], demoted = [], kept = [], errors = [], duplicates = [], moved = [];
  // `of` на „дубъл“ трябва да ОСТАНЕ в проверените — не може да е свален в същия пакет.
  const leaving = new Set(verdicts.filter((r) => ["опровергана", "дубъл", "премести"].includes(r?.verdict)).map((r) => String(r.lid || "").trim()));
  const drop = new Set(), replace = new Map();

  for (const rec of verdicts) {
    const lid = String(rec.lid || "").trim();
    if (!VERDICTS.includes(rec.verdict)) { errors.push(`${lid}: непознат вердикт „${rec.verdict}“`); continue; }
    // FAIL-CLOSED. Първата версия имаше „умна“ клауза: непознат lid + вече има проверени поуки →
    // приеми, че е промотиран в предишен пуск, и пропусни. Това ГЪЛТАШЕ всеки сгрешен lid, защото
    // условието е вярно почти винаги — тихо пропускане, маскирано като идемпотентност. Точно класът
    // тихи провали, който гоня цялата сесия; тестът го хвана. Промоцията сменя текста, значи сменя и
    // lid-а, тоест „вече промотирана“ ПРИНЦИПНО не е разпознаваема по lid. Затова: непознат lid е
    // грешка. Идемпотентността се постига като вердиктите се генерират наново от `quarantine-review`
    // (Карантина) или `memory-freshness --agent` (проверени).
    const where = inQuar.has(lid) ? "q" : inVer.has(lid) ? "v" : null;
    if (!where) { errors.push(`${lid}: няма такава поука в паметта на този агент`); continue; }
    if (rec.next != null && !(/^\d{4}-\d{2}-\d{2}$/.test(String(rec.next)) && String(rec.next) > today)) {
      errors.push(`${lid}: next трябва да е бъдеща дата YYYY-MM-DD (даден: „${rec.next}“)`); continue;
    }
    const { i, end } = (where === "q" ? inQuar : inVer).get(lid);
    const block = lines.slice(i, end + 1).join("\n");
    if (rec.verdict === "остава") { kept.push(lid); continue; }

    if (rec.verdict === "дубъл") {
      const of = String(rec.of || "").trim();
      if (where !== "v") { errors.push(`${lid}: „дубъл“ е само за проверена поука`); continue; }
      if (!of || of === lid || !inVer.has(of)) { errors.push(`${lid}: „дубъл“ иска of = lid на ДРУГА проверена поука в същата памет (даден: „${of || "—"}“)`); continue; }
      if (leaving.has(of)) { errors.push(`${lid}: of=${of} също се сваля в този пакет — оригиналът трябва да остане`); continue; }
      demoted.push({ lid, line: markBullet(block, `ДУБЪЛ на ${of} ${today}`, String(rec.note || "").trim()) });
      duplicates.push(lid);
      for (let k = i; k <= end; k++) drop.add(k);
      continue;
    }

    if (rec.verdict === "премести") {
      const to = String(rec.to || "").trim();
      if (where !== "v") { errors.push(`${lid}: „премести“ е само за проверена поука`); continue; }
      if (!to || to === ctx.self || !ctx.agents?.has?.(to)) { errors.push(`${lid}: „премести“ иска to = id на ДРУГ наш агент (даден: „${to || "—"}“)`); continue; }
      demoted.push({ lid, line: markBullet(block, `ПРЕМЕСТЕНА при ${to} ${today}`, String(rec.note || "").trim()) });
      moved.push({ lid, to, line: movedBullet(block.replace(/\s*\n\s*/g, " "), ctx.self || "?", today) });
      for (let k = i; k <= end; k++) drop.add(k);
      continue;
    }

    if (rec.verdict === "опровергана") {
      if (where === "q") { lines[i] = refuteBullet(lines[i], rec.note, today); refuted.push(lid); continue; }
      // Проверено знание се сваля само с причина — иначе каналът е тиха подмяна на памет.
      if (!String(rec.note || "").trim()) { errors.push(`${lid}: проверена поука се сваля само с бележка (note) защо`); continue; }
      demoted.push({ lid, line: demoteBullet(block, rec.note, today) });
      for (let k = i; k <= end; k++) drop.add(k);
      continue;
    }

    // потвърдена
    const src = String(rec.source || "").trim();
    if (!isRealSource(src)) { errors.push(`${lid}: „потвърдена“ без реален източник (даден: „${src || "—"}“)`); continue; }
    const nb = promoteBullet(block, src, today, rec.next || null);
    if (!nb) { errors.push(`${lid}: не мога да разчета опашката _(обхват; увереност; източник)_`); continue; }
    if (where === "v") {
      // Пресверка на място: редът не мърда (редът в секцията е хронология на научаването).
      replace.set(i, nb);
      for (let k = i + 1; k <= end; k++) drop.add(k);
      reverified.push(lid);
      continue;
    }
    promoted.push({ lid, line: nb });
    for (let k = i; k <= end; k++) drop.add(k);
  }

  if (errors.length) return { error: errors.join("\n"), errors };

  // Запис: промотираните НАЧЕЛО на „Проверени поуки“, свалените НАЧЕЛО на Карантина (най-новото горе).
  const out = [];
  lines.forEach((l, i) => {
    if (drop.has(i)) return;
    out.push(replace.has(i) ? replace.get(i) : l);
    if (i === v.start) { out.push(""); for (const p of promoted) out.push(p.line); }
    if (i === q.start && demoted.length) { out.push(""); for (const p of demoted) out.push(p.line); }
  });
  // изчисти двойните празни редове, които вмъкването може да създаде
  const cleaned = out.join("\n").split("\n").filter((l, i, a) => !(l.trim() === "" && a[i + 1] !== undefined && a[i + 1].trim() === ""));
  return {
    md: cleaned.join("\n"),
    promoted: promoted.map((p) => p.lid), reverified, refuted, demoted: demoted.map((p) => p.lid), kept, duplicates, moved,
  };
}

function main() {
  const argv = process.argv.slice(2);
  const arg = (n) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : null; };
  const agent = arg("--agent"), vf = arg("--verdicts"), WRITE = argv.includes("--write");
  if (!agent || !vf) { console.error("употреба: promote.mjs --agent <id> --verdicts <файл.json> [--write]"); process.exit(2); }
  const file = join(MEM_DIR, `${agent}.md`);
  if (!existsSync(file)) { console.error(`няма памет за „${agent}“`); process.exit(2); }
  if (!existsSync(vf)) { console.error(`няма файл с вердикти: ${vf}`); process.exit(2); }

  let verdicts;
  try { verdicts = JSON.parse(readFileSync(vf, "utf8")); } catch (e) { console.error(`вердиктите не се парсват: ${e.message}`); process.exit(2); }
  if (!Array.isArray(verdicts)) { console.error("вердиктите трябва да са JSON масив"); process.exit(2); }

  const today = new Date().toISOString().slice(0, 10);
  const agents = new Set(readdirSync(MEM_DIR).filter((f) => /^[a-z0-9-]+\.md$/.test(f) && !/^(SECURITY|PROCEDURE|PROTOCOL|README)\.md$/.test(f)).map((f) => f.slice(0, -3)));
  const r = applyVerdicts(readFileSync(file, "utf8"), verdicts, today, { self: agent, agents });
  if (r.error) { console.error(`✗ ${agent}:\n${r.error}`); process.exit(1); }

  const refutedV = r.demoted.length - r.duplicates.length - r.moved.length;
  console.log(`${agent}: ${r.promoted.length} промотирани · ${r.reverified.length} пресверени · ` +
    `${r.refuted.length + refutedV} опровергани (${refutedV} свалени от проверените) · ` +
    `${r.duplicates.length} дубъла · ${r.moved.length} преместени · ${r.kept.length} остават` +
    (WRITE ? "" : "  [dry-run]"));
  if (WRITE) {
    writeFileSync(file, r.md);
    const byTarget = new Map();
    for (const m of r.moved) byTarget.set(m.to, [...(byTarget.get(m.to) || []), m.line]);
    for (const [to, ls] of byTarget) {
      const tf = join(MEM_DIR, `${to}.md`);
      writeFileSync(tf, insertVerified(readFileSync(tf, "utf8"), ls));
      console.log(`  → ${to}: +${ls.length} проверени (преместени от ${agent})`);
    }
  }
}

if (import.meta.url === `file://${process.argv[1]}`) main();
