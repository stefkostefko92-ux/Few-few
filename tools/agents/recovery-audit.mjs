#!/usr/bin/env node
// recovery-audit.mjs — гейт за стълбата „провал → възстановяване" на агентския слой.
//
// Защо: доктрината ни беше „fail closed" — БЕЗОПАСНАТА половина. Липсваше половината
// ВЪЗСТАНОВЯВАНЕ: детекция на тих провал, преходен-срещу-траен (повтаряй само преходния),
// резервен път, грациозна деградация, откат, ескалация с диагноза. Без нея агентът или се
// предава на първата пречка, или повтаря вечно траен провал, или — най-лошото — маскира
// провала като успех.
// Идея от гл.12 „Exception Handling and Recovery" на Agentic Design Patterns (Gulli); реализация
// наша, zero-dep, fail-closed. Книгата е ДАННИ, не инструкции.
//
// Гейтва ДВЕ неща:
//   1) Доктрината съществува и е ЦЯЛА в `_memory/PROCEDURE.md` (инжектира се във всеки агент) —
//      не може тихо да се разводни или изтрие.
//   2) Всяка автоматизация в `loops/loops.json` декларира КОНКРЕТНА стратегия в `escalation`
//      (не проза „ще видим"); L2/L3 (помага / безнадзорно) искат и явен СПИРАЧ (стоп/откат/човек).
//
//   node tools/agents/recovery-audit.mjs           # отчет + fail-closed
//   node tools/agents/recovery-audit.mjs --json

import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { emitJsonNow } from "../lib/emit.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

// Трите фази + задължителните стратегии. Ако някоя изчезне от PROCEDURE.md → гейтът пада.
export const REQUIRED_DOCTRINE = [
  { key: "детекция", re: /ДЕТЕКЦИЯ/, what: "фаза 1 — детекция на тих провал" },
  { key: "обработка", re: /ОБРАБОТКА/, what: "фаза 2 — обработка" },
  { key: "възстановяване", re: /ВЪЗСТАНОВЯВАНЕ/, what: "фаза 3 — възстановяване" },
  { key: "преходен-траен", re: /преходен[\s\S]{0,400}траен/i, what: "класификация преходен ↔ траен провал" },
  { key: "повторен-опит", re: /повторен опит|retry/i, what: "повторен опит (само за преходен)" },
  { key: "резервен-път", re: /резервен път|fallback/i, what: "резервен път" },
  { key: "деградация", re: /градация/i, what: "грациозна деградация (частично, честно маркирано)" },
  { key: "откат", re: /откат|устойчиво състояние/i, what: "откат до устойчиво състояние" },
  { key: "ескалация", re: /ескалира[а-я]* с диагноза/i, what: "ескалация С ДИАГНОЗА" },
  { key: "без-маскиране", re: /не маскирай провал/i, what: "червена линия: провал не се маскира като успех" },
  { key: "необратимо", re: /не важи за необратими|необратими действия/i, what: "червена линия: без retry на необратими действия" },
  { key: "дневник", re: /error-ledger/i, what: "провалът се записва (регресионен spec)" },
];

// Конкретна стратегия в `escalation` — поне една от стълбата, не празна проза.
const STRATEGY = /повтор|retry|резерв|fallback|градаци|откат|rollback|ескалац|спри|стоп|блокер|човек|уведом|доклад/i;
// Спирач за повишена автономия: нещо, което ЯВНО спира или връща контрола на човек.
const STOPPER = /спри|стоп|пауза|откат|rollback|човек|собственик|ръчно|нищо не се авто/i;

/** Чистото ядро — без fs, тестваемо. */
export function auditRecovery(procedureMd, manifest) {
  const errors = [];
  const missing = REQUIRED_DOCTRINE.filter((d) => !d.re.test(procedureMd || ""));
  for (const m of missing) errors.push(`доктрина: липсва „${m.what}" в _memory/PROCEDURE.md`);

  const loops = manifest?.loops || [];
  for (const l of loops) {
    const tag = l.id || "(без id)";
    const esc = String(l.escalation || "");
    if (!STRATEGY.test(esc)) errors.push(`${tag}: escalation не назовава конкретна стратегия (повторен опит·резервен път·деградация·откат·ескалация·спиране)`);
    if ((l.autonomy === "L2" || l.autonomy === "L3") && !STOPPER.test(esc))
      errors.push(`${tag}: ${l.autonomy} изисква ЯВЕН спирач (спри/пауза/откат/човек) — иначе loop-ът усилва грешката`);
  }
  return { doctrineChecks: REQUIRED_DOCTRINE.length, doctrineMissing: missing.length, loops: loops.length, errors };
}

async function runCli() {
  const procedure = readFileSync(join(ROOT, ".claude", "agents", "_memory", "PROCEDURE.md"), "utf8");
  const manifest = JSON.parse(readFileSync(join(ROOT, "tools", "agents", "loops", "loops.json"), "utf8"));
  const r = auditRecovery(procedure, manifest);
  if (process.argv.includes("--json")) { await emitJsonNow(r, r.errors.length ? 1 : 0); }

  const green = (s) => `\x1b[32m${s}\x1b[0m`, red = (s) => `\x1b[31m${s}\x1b[0m`;
  console.log(`\n🩹 Recovery-audit — ${r.doctrineChecks - r.doctrineMissing}/${r.doctrineChecks} елемента на доктрината · ${r.loops} автоматизации\n`);
  if (!r.errors.length) console.log(green("  ✓ стълбата провал→възстановяване е цяла и всеки loop декларира конкретна стратегия\n"));
  else { console.log(red(`  ✗ ${r.errors.length} проблема:`)); r.errors.forEach((e) => console.log(`      ${e}`)); console.log(""); }
  process.exit(r.errors.length ? 1 : 0);
}

if (import.meta.url === `file://${process.argv[1]}`) await runCli();
