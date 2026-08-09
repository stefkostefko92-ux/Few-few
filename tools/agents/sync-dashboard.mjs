#!/usr/bin/env node
// sync-dashboard.mjs — изравнява `knowledge.lessons` в agents-dashboard/agents.json с РЕАЛНИЯ брой
// проверени поуки в `_memory/<id>.md`.
//
// Защо съществува (2026-07-30): паметта е КАНОНИЧНА, таблото я ОГЛЕДАЛВА — `memory-capture.mjs:238`
// пише `a.knowledge.lessons = countVerified(id)` при всяко улавяне. Но когато паметта се редактира
// РЪЧНО (курация, дедуп, промоция към _shared — точно каквото правихме днес), кукатa не се пуска и
// числото в таблото остава старото. Измерено: 10 от 28 агента бяха разсинхронени в ДВЕ посоки
// (регистър по-висок И по-нисък), общо 3665 срещу 3642. Таблото твърдеше знание, което го няма.
//
// Ползва `countVerified` от куката — един брояч, не втора реализация (преписаният брояч дрейфва,
// това е същият урок като единния източник за „какво е тайна“).
//
// Употреба:
//   node tools/agents/sync-dashboard.mjs           # изравнява и записва
//   node tools/agents/sync-dashboard.mjs --check   # само проверява (изход 1 при разсинхрон) — за CI

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { countVerified } from "../../.claude/hooks/memory-capture.mjs";
import { parseFallback, replaceFallback } from "../lib/dashboard-fallback.mjs";

const ROOT = process.env.CLAUDE_PROJECT_DIR || join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const DASH = join(ROOT, "agents-dashboard", "agents.json");
const HTML = join(ROOT, "agents-dashboard", "index.html");
const MEM = join(ROOT, ".claude", "agents", "_memory");
const CHECK = process.argv.includes("--check");

const raw = readFileSync(DASH, "utf8");
const data = JSON.parse(raw);
const list = data.agents || data;

const drift = [];
for (const a of list) {
  const real = countVerified(a.id, MEM);
  if (real == null) continue; // няма файл на паметта → грижа на oversee, не наша
  const shown = a.knowledge?.lessons ?? null;
  if (shown !== real) {
    drift.push({ id: a.id, shown, real });
    if (!CHECK && a.knowledge) a.knowledge.lessons = real;
  }
}

// Огледалото в index.html се проверява СЪЩО — иначе `--check` минава, докато FALLBACK е застоял,
// и `oversee` пада по-късно с друго съобщение (така се загуби време веднъж).
const fbDrift = [];
if (existsSync(HTML)) {
  const fb = parseFallback(readFileSync(HTML, "utf8"));
  for (const a of (fb ? (fb.agents || fb) : [])) {
    const real = countVerified(a.id, MEM);
    if (real != null && (a.knowledge?.lessons ?? null) !== real) fbDrift.push({ id: a.id, shown: a.knowledge?.lessons ?? null, real });
  }
}

if (!drift.length && !fbDrift.length) {
  console.log("\x1b[32m✓ табло↔памет: изравнено — agents.json И вграденият FALLBACK отговарят на _memory.\x1b[0m");
  process.exit(0);
}

for (const d of drift) {
  console.error(`  ${d.id.padEnd(22)} табло=${String(d.shown).padStart(4)}  памет=${String(d.real).padStart(4)}  (${d.real - d.shown > 0 ? "+" : ""}${d.real - d.shown})`);
}
for (const d of fbDrift) {
  console.error(`  ${d.id.padEnd(22)} FALLBACK=${String(d.shown).padStart(4)}  памет=${String(d.real).padStart(4)}`);
}

if (CHECK) {
  console.error(`\n\x1b[31m✗ табло↔памет: ${drift.length} в agents.json + ${fbDrift.length} в FALLBACK.\x1b[0m Паметта е канонична — пусни: node tools/agents/sync-dashboard.mjs`);
  process.exit(1);
}

// Запазваме форматирането (2 интервала + завършващ нов ред), за да е diff-ът четим.
writeFileSync(DASH, JSON.stringify(data, null, 2) + "\n");

// ДВЕТЕ огледала, не едното: таблото носи и вграден FALLBACK в index.html (за file:// преглед), а
// `oversee` ГЕЙТВА съвпадението им. Първата версия пипаше само agents.json и веднага счупи гейта —
// затова синхронът е непълен, ако не мине и през FALLBACK.
let fbSynced = 0;
if (existsSync(HTML)) {
  const html = readFileSync(HTML, "utf8");
  const fb = parseFallback(html);
  if (fb) {
    const fbList = fb.agents || fb;
    for (const a of fbList) {
      const real = countVerified(a.id, MEM);
      if (real != null && a.knowledge && a.knowledge.lessons !== real) { a.knowledge.lessons = real; fbSynced++; }
    }
    if (fbSynced) writeFileSync(HTML, replaceFallback(html, fb));
  } else {
    console.error("\x1b[33m⚠ FALLBACK в index.html не се разпарсва — agents.json е обновен, но огледалото НЕ.\x1b[0m");
  }
}

const total = list.reduce((s, a) => s + (a.knowledge?.lessons || 0), 0);
console.log(`\n\x1b[32m✓ изравнени ${drift.length} агента\x1b[0m (+${fbSynced} в FALLBACK) · общо проверени поуки: ${total}`);
