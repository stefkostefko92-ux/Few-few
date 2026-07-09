// review.js — `npm run review`. Чете трейд дневника (data/trades.jsonl), пуска тренера (coach.js)
// и печата коучинг доклад: статистики, expectancy, повтарящи се грешки и присъда има ли ръб.
// Учи от миналото — но миналото не е бъдеще. Не е инвестиционен съвет.
import { loadTrades } from './journal.js';
import { analyzeTrades, fmtPF } from './coach.js';

const trades = loadTrades();
const { n, stats, mistakes, verdict } = analyzeTrades(trades);

console.log(`\n=== Трейд ревю (${n} сделки) ===`);
if (!n) {
  console.log('Няма записани сделки още. Пусни бота (dry-run/testnet), събери сделки, после ревю.');
  process.exit(0);
}

console.log(`  Expectancy:     ${stats.expectancyR.toFixed(3)} R/сделка   (>0 = има ръб)`);
console.log(`  Win-rate:       ${stats.winRatePct.toFixed(1)}%   (${(stats.winRatePct / 100 * n).toFixed(0)}/${n})`);
console.log(`  Средна печалба: ${stats.avgWinR.toFixed(2)}R   ·   Средна загуба: ${stats.avgLossR.toFixed(2)}R`);
console.log(`  Profit factor:  ${fmtPF(stats.profitFactor)}   ·   Общо: ${stats.totalR.toFixed(1)}R`);
console.log(`  Изходи по стоп: ${stats.stopExitRatePct.toFixed(0)}%   ·   Най-дълга серия загуби: ${stats.maxLossStreak}`);
if (stats.kellyQuarterPct > 0)
  console.log(`  ¼-Kelly риск:   ~${stats.kellyQuarterPct.toFixed(2)}%/сделка   (предложение от реалната статистика; дробен Kelly срещу variance drag)`);
else
  console.log(`  ¼-Kelly риск:   n/a   (нужни ≥30 сделки с положителен едж; дотогава ползвай малък фиксиран риск)`);

if (mistakes.length) {
  console.log(`\n  Повтарящи се грешки / бележки:`);
  const order = { HIGH: 0, MEDIUM: 1, INFO: 2 };
  mistakes.sort((a, b) => order[a.sev] - order[b.sev]);
  for (const m of mistakes) console.log(`    [${m.sev}] ${m.code} — ${m.msg}`);
} else {
  console.log(`\n  Няма ясни повтарящи се грешки в тази извадка.`);
}

console.log(`\n  Присъда: ${verdict}`);
console.log('\n⚠ Учене от минали сделки ≠ гаранция за бъдеще. Валидирай walk-forward + testnet преди реален капитал. Не е инвестиционен съвет.');
