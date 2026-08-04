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
//   node tools/memory/promote.mjs --agent <id> --verdicts <файл.json>            # dry-run
//   node tools/memory/promote.mjs --agent <id> --verdicts <файл.json> --write

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { isRealSource } from "../agents/oversee-lib.mjs";
import { lessonId } from "./quarantine-review.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const MEM_DIR = process.env.CURATE_MEM_DIR || join(ROOT, ".claude", "agents", "_memory");

export const VERDICTS = ["потвърдена", "опровергана", "остава"];

/** Разбива опашката `_(обхват; увереност; източник)_` на части. Източникът може да съдържа „;“. */
export function splitTail(bullet) {
  const m = String(bullet).match(/_\((.*)\)_\s*$/);
  if (!m) return null;
  const parts = m[1].split(";");
  if (parts.length < 2) return null;
  return { scope: parts[0].trim(), confidence: parts[1].trim(), source: parts.slice(2).join(";").trim() };
}

/** Пренаписва САМО опашката и датовия префикс. Тялото на поуката остава дословно. */
export function promoteBullet(bullet, newSource, today) {
  const tail = splitTail(bullet);
  if (!tail) return null;
  const withTail = bullet.replace(/_\((.*)\)_\s*$/, `_(${tail.scope}; verified; ${newSource})_`);
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
export function applyVerdicts(md, verdicts, today) {
  const lines = md.split("\n");
  const q = sectionBounds(lines, "Карантина");
  const v = sectionBounds(lines, "Проверени поуки");
  if (!q || !v) return { error: "липсва секция „Карантина“ или „Проверени поуки“" };

  // Индекс: lid → номер на ред, само в Карантина.
  const inQuar = new Map();
  for (let i = q.start + 1; i < q.end; i++) if (lines[i].trim().startsWith("- ")) inQuar.set(lessonId(lines[i]), i);

  const promoted = [], refuted = [], kept = [], errors = [];
  const drop = new Set();

  for (const rec of verdicts) {
    const lid = String(rec.lid || "").trim();
    if (!VERDICTS.includes(rec.verdict)) { errors.push(`${lid}: непознат вердикт „${rec.verdict}“`); continue; }
    // FAIL-CLOSED. Първата версия имаше „умна“ клауза: непознат lid + вече има проверени поуки →
    // приеми, че е промотиран в предишен пуск, и пропусни. Това ГЪЛТАШЕ всеки сгрешен lid, защото
    // условието е вярно почти винаги — тихо пропускане, маскирано като идемпотентност. Точно класът
    // тихи провали, който гоня цялата сесия; тестът го хвана. Промоцията сменя текста, значи сменя и
    // lid-а, тоест „вече промотирана“ ПРИНЦИПНО не е разпознаваема по lid. Затова: непознат lid е
    // грешка. Идемпотентността се постига като вердиктите се генерират наново от `quarantine-review`.
    if (!inQuar.has(lid)) { errors.push(`${lid}: няма такава поука в Карантина на този агент`); continue; }
    const i = inQuar.get(lid);
    if (rec.verdict === "остава") { kept.push(lid); continue; }
    if (rec.verdict === "опровергана") { lines[i] = refuteBullet(lines[i], rec.note, today); refuted.push(lid); continue; }
    // потвърдена
    const src = String(rec.source || "").trim();
    if (!isRealSource(src)) { errors.push(`${lid}: „потвърдена“ без реален източник (даден: „${src || "—"}“)`); continue; }
    const nb = promoteBullet(lines[i], src, today);
    if (!nb) { errors.push(`${lid}: не мога да разчета опашката _(обхват; увереност; източник)_`); continue; }
    promoted.push({ lid, line: nb });
    drop.add(i);
  }

  if (errors.length) return { error: errors.join("\n"), errors };

  // Запис: махни промотираните от Карантина, добави ги НАЧЕЛО на „Проверени поуки“ (най-новото горе).
  const out = [];
  lines.forEach((l, i) => {
    if (drop.has(i)) return;
    out.push(l);
    if (i === v.start) { out.push(""); for (const p of promoted) out.push(p.line); }
  });
  // изчисти двойните празни редове, които вмъкването може да създаде
  const cleaned = out.filter((l, i) => !(l.trim() === "" && out[i + 1] !== undefined && out[i + 1].trim() === ""));
  return { md: cleaned.join("\n"), promoted: promoted.map((p) => p.lid), refuted, kept };
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
  const r = applyVerdicts(readFileSync(file, "utf8"), verdicts, today);
  if (r.error) { console.error(`✗ ${agent}:\n${r.error}`); process.exit(1); }

  console.log(`${agent}: ${r.promoted.length} промотирани · ${r.refuted.length} опровергани · ` +
    `${r.kept.length} остават` +
    (WRITE ? "" : "  [dry-run]"));
  if (WRITE) writeFileSync(file, r.md);
}

if (import.meta.url === `file://${process.argv[1]}`) main();
