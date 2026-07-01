#!/usr/bin/env node
// tools/trading/backtest-check.mjs — sanity проверка на бектест скрипт (статична, без пускане).
//
// Търси трите класически илюзии, които правят бектеста да „лъже": look-ahead bias (сигнал+
// изпълнение на един и същ бар), липсващи такси/slippage, и липса на out-of-sample сегмент.
// Не оценява доходност — само дали методологията е честна. Красива equity крива на in-sample
// данни не значи нищо: винаги forward/paper преди реален капитал.
//
// Употреба:  node tools/trading/backtest-check.mjs <файл-или-папка>
// Изход: 0 = няма HIGH, 1 = има HIGH.

import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join, extname } from "node:path";

const root = process.argv[2] || ".";
const findings = [];
const add = (sev, code, msg, where) => findings.push({ sev, code, msg, where });

function walk(dir, acc = []) {
  let entries = [];
  try { entries = readdirSync(dir); } catch { return acc; }
  for (const e of entries) {
    if (["node_modules", ".git", "dist", "build"].includes(e)) continue;
    const p = join(dir, e);
    let st; try { st = statSync(p); } catch { continue; }
    if (st.isDirectory()) walk(p, acc); else acc.push(p);
  }
  return acc;
}

if (!existsSync(root)) { add("HIGH", "no-path", `Пътят не съществува: ${root}`, root); report(); process.exit(1); }

const files = (statSync(root).isDirectory() ? walk(root) : [root])
  .filter((f) => [".js", ".mjs", ".cjs", ".ts", ".py"].includes(extname(f)));

for (const f of files) {
  let src = "";
  try { src = readFileSync(f, "utf8"); } catch { continue; }
  // Само файлове, които РЕАЛНО са бектест — по име или по изричен маркер — иначе бот-файловете
  // (които уместно споменават equity/drawdown в риск логиката) дават лъжливи находки.
  // Реален бектест = име на файла ИЛИ (маркер за out-of-sample/walk-forward И структура на симулация).
  // Само споменаване на термините в коментар (напр. в strategy.js) не брои — иначе лъжливи находки.
  const hasStructure = /simulate\s*\(|equityCurve|tradeReturns|finalEquity|equity_curve/i.test(src);
  const hasMarker = /in-?sample|out.?of.?sample|walk.?forward/i.test(src);
  const isBacktest = /backtest|back_test/i.test(f) || (hasMarker && hasStructure);
  if (!isBacktest) continue;
  const rel = f.replace(root, "").replace(/^\//, "") || f;

  // Такси / комисионни
  if (!/(fee|commission|taker|maker|comm_rate|fee_rate|slippage)/i.test(src))
    add("HIGH", "no-fees", "Бектестът не споменава такси/комисионни — стратегия, печеливша без разходи, често е губеща с тях. Извади taker/maker fee на всяка сделка.", rel);

  // Slippage
  if (!/(slippage|slip|impact|spread)/i.test(src))
    add("MEDIUM", "no-slippage", "Няма моделиран slippage/spread — market поръчки на реален пазар се пълзят през книгата. Добави поне фиксиран slippage buffer.", rel);

  // Out-of-sample / walk-forward
  if (!/(out.?of.?sample|oos|walk.?forward|train.*test|holdout|split)/i.test(src))
    add("MEDIUM", "no-oos", "Няма видим out-of-sample / walk-forward / train-test сплит — риск от overfitting. Оптимизирай на един прозорец, тествай на следващия (неведян).", rel);

  // Look-ahead: сигнал и изпълнение на един и същ индекс
  if (/(close\[i\]|closes\[i\]|bar\.close|candle\[4\])/i.test(src) && /(buy|sell|enter|entry|signal)/i.test(src) && !/(i\s*\+\s*1|open\[i\s*\+\s*1\]|next.?bar|shift\(|no.?lookahead)/i.test(src))
    add("HIGH", "lookahead", "Сигналът ползва close[i], а изпълнението трябва да е на open[i+1] — иначе бектестът вижда бъдещето. Отмести изпълнението с 1 бар.", rel);
}

report();
process.exit(findings.some((f) => f.sev === "HIGH") ? 1 : 0);

function report() {
  const order = { HIGH: 0, MEDIUM: 1, INFO: 2 };
  findings.sort((a, b) => order[a.sev] - order[b.sev]);
  if (!findings.length) { console.log("✓ backtest-check: методологията изглежда честна. Пак: forward/paper тест преди реален капитал; минала доходност ≠ бъдеща."); return; }
  console.log(`backtest-check — ${findings.length} находки за ${root}:\n`);
  for (const f of findings)
    console.log(`  [${f.sev}] ${f.code} · ${f.where}\n        ${f.msg}`);
  const h = findings.filter((f) => f.sev === "HIGH").length;
  console.log(`\n${h} HIGH · ${findings.filter((f) => f.sev === "MEDIUM").length} MEDIUM · ${findings.filter((f) => f.sev === "INFO").length} INFO`);
}
