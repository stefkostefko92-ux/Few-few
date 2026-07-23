#!/usr/bin/env node
// verifier.mjs — детерминистичен ВЕРИФИКАТОР-проход за парично-критичните агенти (evaluator-optimizer
// патърнът от канона на Anthropic, сведен до zero-dep проверка). Изходът на агента НЕ отива навън,
// преди верификаторът да свери, че носи задължителните DoD маркери на домейна — и не носи капаните.
//
// Различно от golden eval: eval-ът тества спрямо КОНКРЕТЕН сценарий; верификаторът тества ВСЕКИ реален
// изход спрямо инвариантите на агента (контекстно — проверка се прилага само ако темата присъства).
//
//   node tools/agents/verifier.mjs <агент> <изход-файл>     # exit 0 = минава, 1 = провал
//   node tools/agents/verifier.mjs --list                    # кои агенти имат верификатор
//   node tools/agents/verifier.mjs <агент> <файл> --json
//
// Fail-closed за покритите агенти; агент без верификатор → exit 0 (не блокираме непокритото).

import { readFileSync } from "node:fs";

// Проверка: { when: RegExp (темата присъства → проверката важи), any|none: маркери, label }.
// Маркерите са tolerant (какъвто е eval-lib подходът) — ловим ОТСЪСТВИЕ на дисциплина, не стил.
export const VERIFIER = {
  goladjiyata: [
    { when: /коефициент|залог|стойност|value|odds/i, any: ["overround", "марж", "обезмарж", "vig", "пазарн"], label: "маха маржа / пазарна котва преди стойност" },
    { when: /стейк|залог|kelly|размер/i, any: ["Kelly", "дробен", "таван", "1-2%", "процент от банк"], label: "дисциплина за размер (дробен Kelly/таван)" },
    { when: /./, none: ["гарантирана печалба", "сигурен залог", "не може да загуби", "100% печели"], label: "капан: обещава сигурна печалба" },
    { when: /залог|стойност|прогноз/i, any: ["18+", "отговорн", "не е.*съвет", "не давам.*съвет", "риск от пристрастяване"], label: "отговорна игра / не-съвет дисклеймър" },
  ],
  kasadjiyata: [
    { when: /бон|фискал|продажба|каса/i, any: ["PENDING", "write-ahead", "идемпотент", "reconcile", "без успешен бон", "не се записва без"], label: "фискален инвариант (бон/крах-възстановяване)" },
    { when: /цена|пари|сума|евро|лев|цент/i, any: ["int", "цели", "евроценти", "eurCents", "без float"], label: "int пари (не float)" },
    { when: /наредба|н-18|супто|зверб|закон|правн/i, any: ["не е правен съвет"], label: "правен дисклеймър" },
    { when: /./, none: ["float за пари", "parseFloat(цена", "остойностка от клиента"], label: "капан: float/клиентска остойностка" },
  ],
  prodavacha: [
    { when: /webhook|checkout|плащане|session/i, any: ["payment_status", "async_payment", "unpaid", "no_payment_required"], label: "payment_status гейт (completed≠платено)" },
    { when: /webhook/i, any: ["подпис", "stripe-signature", "constructEvent", "raw"], label: "проверка на подпис със суров body" },
    { when: /webhook|събити/i, any: ["идемпотент", "event.id", "дедуп"], label: "идемпотентност по event.id" },
    // Trap-маркерите са само УТВЪРДИТЕЛНИ фрази — отрицания („никакъв достъп в success_url") не трябва да мачват (пилотът хвана точно този false positive).
    { when: /достъп|premium|активац/i, none: ["давам достъп в success_url", "давай достъп в success_url", "success_url е достатъч", "redirect е достатъч"], label: "капан: права през redirect" },
  ],
  treydara: [
    { when: /поръчк|order|market|limit/i, any: ["clientOrderId", "идемпотент"], label: "идемпотентност на поръчки" },
    { when: /стоп|stop|позици/i, any: ["на борсата", "reduce-only", "OCO", "борсов стоп", "kill-switch"], label: "борсов (не само локален) стоп / kill-switch" },
    { when: /./, none: ["гарантирана печалба", "сигурна печалба", "не може да загуби"], label: "капан: обещава печалба" },
    { when: /стратеги|реални пари|капитал/i, any: ["paper", "не е инвестиционен съвет", "не давам инвестиционен съвет"], label: "paper-first / не-съвет" },
  ],
};

export function verifyOutput(agent, text) {
  const rules = VERIFIER[agent];
  if (!rules) return { agent, covered: false, ok: true, checks: [] };
  const checks = rules.map((r) => {
    if (!r.when.test(text)) return { label: r.label, ok: true, na: true };
    if (r.any) {
      const hit = r.any.find((m) => new RegExp(m.replace(/[.*+?^${}()|[\]\\]/g, (c) => (".*".includes(c) ? c : "\\" + c)), "i").test(text));
      return { label: r.label, ok: !!hit, na: false, hit: hit || null };
    }
    const bad = r.none.filter((m) => text.toLowerCase().includes(m.toLowerCase()));
    return { label: r.label, ok: bad.length === 0, na: false, hits: bad };
  });
  return { agent, covered: true, ok: checks.every((c) => c.ok), checks };
}

function runCli() {
  const argv = process.argv.slice(2);
  if (argv.includes("--list")) { console.log("Верификатор покрива: " + Object.keys(VERIFIER).join(", ")); process.exit(0); }
  const [agent, file] = argv.filter((a) => !a.startsWith("--"));
  if (!agent || !file) { console.error("употреба: verifier.mjs <агент> <изход-файл> [--json] | --list"); process.exit(2); }
  let text = "";
  try { text = readFileSync(file, "utf8"); } catch (e) { console.error(`не мога да прочета ${file}: ${e.message}`); process.exit(2); }
  const r = verifyOutput(agent, text);
  if (argv.includes("--json")) { console.log(JSON.stringify(r, null, 2)); process.exit(r.ok ? 0 : 1); }
  if (!r.covered) { console.log(`(няма верификатор за „${agent}" — пропускам)`); process.exit(0); }
  console.log(`\n🛡  Верификатор · ${agent} · ${r.ok ? "МИНАВА" : "ПРОВАЛ"}\n`);
  for (const c of r.checks) console.log(`  ${c.na ? "·" : c.ok ? "✓" : "✗"} ${c.label}${c.na ? " (н/п за този изход)" : ""}${!c.ok && c.hits ? " ← намери: " + c.hits.join(", ") : ""}`);
  console.log("");
  process.exit(r.ok ? 0 : 1);
}

if (import.meta.url === `file://${process.argv[1]}`) runCli();
