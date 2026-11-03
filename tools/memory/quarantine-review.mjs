#!/usr/bin/env node
// quarantine-review.mjs — кои карантинирани поуки заслужават ПОВТОРНА ПРОВЕРКА.
//
// Защо. Карантината трябва да е място за недоказаното. Но два дефекта я напълниха с доказуемо
// знание: (1) етикетът на увереност на български не се разпознаваше (поправено 2026-07-27);
// (2) `sourceIsReal` в куката беше по-строга от `hasSource` в одитора и отхвърляше легитимни
// източници — правни цитати с домейн без схема (`tita.bg/laws/427`), репо-пътища без номер на ред,
// `discord.com/developers/docs`. Резултат: стотици поуки с истински източник заседнаха завинаги.
//
// ТОЗИ ИНСТРУМЕНТ НЕ ПРОМОТИРА НИЩО. Само докладва. Промоцията на памет е ЧОВЕШКО решение
// (закон: „не пренаписвай памет мълчаливо"), а минаването на проверката за източник е НЕОБХОДИМО,
// не достатъчно — съдържанието още трябва да е вярно. Правилният път е повторна проверка от самия
// агент, който го е научил, срещу цитирания източник.
//
//   node tools/memory/quarantine-review.mjs            # обобщение по агенти
//   node tools/memory/quarantine-review.mjs --agent kasadjiyata   # конкретните поуки
//   node tools/memory/quarantine-review.mjs --json

import { readdirSync, readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { sectionBullets, isRealSource, lessonDate } from "../agents/oversee-lib.mjs";
import { emitJson, finish } from "../lib/emit.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const MEM = join(ROOT, ".claude", "agents", "_memory");
const argv = process.argv.slice(2);
const JSON_OUT = argv.includes("--json");
const only = (() => { const i = argv.indexOf("--agent"); return i >= 0 ? argv[i + 1] : null; })();

// Датата, на която етикетът на увереност спря да яде поуки. Карантинирано ПРЕДИ нея е заподозряно.
export const CONFIDENCE_FIX_DATE = "2026-07-27";

export const tailSource = (bullet) => {
  const m = String(bullet).match(/_\((.*?)\)_\s*$/);
  if (!m) return "";
  return m[1].split(";").pop().trim().replace(/^["'„“”]+|["'„“”]+$/g, "");
};

/**
 * Стабилен къс идентификатор на поука (Кръг 13). Нужен е, за да може агент да адресира КОЯ точно
 * поука е пресверил, без да ѝ преписва текста (преписването е канал за тиха промяна на съдържание).
 * Хешът е върху НОРМАЛИЗИРАНИЯ пълен ред, значи е стабилен спрямо интервали и регистър, но се
 * променя, ако текстът се промени — точно каквото искаме: променен текст = друга поука.
 * FNV-1a: 32 бита стигат при ~500 записа, нула зависимости, детерминистичен между процеси.
 */
export function lessonId(bullet) {
  const s = String(bullet).toLowerCase().replace(/\s+/g, " ").trim();
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h.toString(16).padStart(8, "0");
}

export function reviewAgent(id, md) {
  const q = sectionBullets(md, "Карантина") || [];
  const items = q.map((b) => {
    const src = tailSource(b);
    const date = lessonDate(b);
    return {
      lid: lessonId(b),
      text: b.replace(/^-\s*\*\*[\d-]+:\*\*\s*/, "").replace(/\s*_\(.*?\)_\s*$/, "").trim(),
      source: src,
      date,
      sourceOk: isRealSource(src),
      preFix: !!date && date < CONFIDENCE_FIX_DATE,
    };
  });
  return {
    id,
    total: items.length,
    candidates: items.filter((i) => i.sourceOk),
    // Най-силните кандидати: реален източник И карантинирани преди поправката на етикета.
    strong: items.filter((i) => i.sourceOk && i.preFix),
    items,
  };
}

export function reviewAll(dir = MEM) {
  const files = readdirSync(dir).filter((f) => f.endsWith(".md") && !f.startsWith("_") && !/^(SECURITY|PROCEDURE|PROTOCOL)/.test(f));
  return files.map((f) => reviewAgent(f.replace(/\.md$/, ""), readFileSync(join(dir, f), "utf8")))
    .filter((r) => r.total > 0)
    .sort((a, b) => b.candidates.length - a.candidates.length);
}

function main() {
  if (!existsSync(MEM)) { console.error("няма памет"); process.exit(2); }
  const all = reviewAll();
  const tot = all.reduce((s, r) => s + r.total, 0);
  const cand = all.reduce((s, r) => s + r.candidates.length, 0);
  const strong = all.reduce((s, r) => s + r.strong.length, 0);

  // `console.log(...)` + `process.exit(0)` РЕЖЕ изхода на 65 536 байта, когато stdout е тръба
  // (а CI и таблото четат точно през тръба). Този отчет е ~544 KB — 88% изчезваха мълчаливо.
  if (JSON_OUT) return emitJson({ total: tot, candidates: cand, strong, agents: all }, 0);

  const d = (s) => `\x1b[90m${s}\x1b[0m`, y = (s) => `\x1b[33m${s}\x1b[0m`, c = (s) => `\x1b[36m${s}\x1b[0m`;

  if (only) {
    const r = all.find((x) => x.id === only);
    if (!r) { console.log(`няма карантина за „${only}"`); process.exit(0); }
    console.log(`\n🔎  Карантина на ${c(only)} — ${r.total} записа · ${r.candidates.length} кандидата за повторна проверка\n`);
    for (const i of r.candidates) {
      console.log(`  ${y("•")} ${i.text.slice(0, 150)}${i.text.length > 150 ? "…" : ""}`);
      console.log(d(`      източник: ${i.source.slice(0, 120)}`));
      console.log(d(`      ${i.date || "без дата"}${i.preFix ? " · ПРЕДИ поправката на етикета" : ""}\n`));
    }
    console.log(d("Нищо не е променено. Повторната проверка се прави от агента срещу цитирания източник.\n"));
    return finish(0);
  }

  console.log(`\n🔎  Преглед на карантината — ${tot} записа във флота\n`);
  console.log(`  ${cand} (${Math.round(cand / tot * 100)}%) носят източник, който ДНЕС минава проверката`);
  console.log(`  ${strong} от тях са отпреди ${CONFIDENCE_FIX_DATE} — заподозрени жертви на двата поправени дефекта\n`);
  console.log("  агент                  карантина   кандидати   силни");
  for (const r of all) {
    if (!r.candidates.length) continue;
    console.log(`  ${r.id.padEnd(22)} ${String(r.total).padStart(7)} ${String(r.candidates.length).padStart(11)} ${String(r.strong.length).padStart(7)}`);
  }
  console.log(d(`\n  ВАЖНО: това е доклад, не промоция. Минаването на проверката за източник е НЕОБХОДИМО,`));
  console.log(d(`  не достатъчно — съдържанието още трябва да е вярно. Повторната проверка е работа на`));
  console.log(d(`  агента, който го е научил, срещу цитирания източник. Виж: --agent <id>.\n`));
  return finish(0);
}

if (import.meta.url === `file://${process.argv[1]}`) main();
