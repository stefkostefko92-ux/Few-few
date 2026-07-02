// coach.js — тренерът: чист анализ на трейд дневника. Смята expectancy/статистики и маркира
// ПОВТАРЯЩИ СЕ ГРЕШКИ по евристики. Целта е ботът/човекът да се учи от миналите сделки.
// Не гарантира печалба; само посочва предотвратими грешки и дали има ръб (edge).
import { fractionalKelly } from './risk.js';

export function analyzeTrades(trades) {
  const n = trades.length;
  if (!n) return { n: 0, stats: null, mistakes: [], verdict: 'Няма записани сделки още.' };

  const wins = trades.filter((t) => t.rMultiple > 0);
  const losses = trades.filter((t) => t.rMultiple <= 0);
  const winRate = wins.length / n;
  const avgWinR = mean(wins.map((t) => t.rMultiple)) || 0;
  const avgLossR = mean(losses.map((t) => t.rMultiple)) || 0;      // ≤ 0
  const expectancyR = winRate * avgWinR + (1 - winRate) * avgLossR; // очаквани R на сделка
  const totalR = sum(trades.map((t) => t.rMultiple));
  const grossWin = sum(wins.map((t) => t.rMultiple));
  const grossLoss = -sum(losses.map((t) => t.rMultiple));
  const profitFactor = grossLoss > 0 ? grossWin / grossLoss : (grossWin > 0 ? Infinity : 0);
  const stopExits = trades.filter((t) => t.exitReason === 'stop').length;
  const stopExitRate = stopExits / n;
  const maxLossStreak = maxStreak(trades.map((t) => t.rMultiple <= 0));

  // Препоръчан риск% по ДРОБЕН Kelly (¼) от реализираната статистика — учи от собствените сделки.
  const kellyQuarterPct = fractionalKelly({ winRate, avgWinR, avgLossR, fraction: 0.25, cap: 2, trades: n });

  const stats = {
    n, winRatePct: winRate * 100, avgWinR, avgLossR, expectancyR,
    totalR, profitFactor, stopExitRatePct: stopExitRate * 100, maxLossStreak,
    kellyQuarterPct,
  };

  // --- Евристики за повтарящи се грешки ---
  const mistakes = [];
  const add = (sev, code, msg) => mistakes.push({ sev, code, msg });

  if (n < 30)
    add('INFO', 'low-sample', `Само ${n} сделки — твърде малка извадка за изводи (нужни са ~30+). Не прави промени на шум.`);

  if (expectancyR < 0)
    add('HIGH', 'negative-expectancy', `Отрицателна expectancy (${expectancyR.toFixed(3)}R/сделка) — стратегията губи пари след разходи. НЕ пускай реален капитал; преразгледай или спри.`);

  // Негативна асиметрия: средната загуба (по модул) е по-голяма от средната печалба → „режеш печалби, държиш загуби“.
  if (wins.length && losses.length && Math.abs(avgLossR) > avgWinR * 1.1)
    add('HIGH', 'bad-asymmetry', `Средна загуба ${Math.abs(avgLossR).toFixed(2)}R > средна печалба ${avgWinR.toFixed(2)}R — режеш печалбите рано и/или пускаш загубите. Класика: „cut losses short, let winners run“ е обратното на това.`);

  if (stopExitRate > 0.6 && n >= 15)
    add('MEDIUM', 'stops-too-tight', `${(stopExitRate * 100).toFixed(0)}% от изходите са по стоп — стопът може да е твърде стегнат (шумът те избива). Обмисли по-широк ATR множител или по-добър вход.`);

  if (maxLossStreak >= 6)
    add('MEDIUM', 'long-loss-streak', `Серия от ${maxLossStreak} поредни загуби — провери дали пазарният режим е сменен (тренд-стратегия в страничен пазар губи). Режим-филтърът пази точно това.`);

  if (winRate > 0.6 && expectancyR < 0)
    add('MEDIUM', 'win-rate-trap', `Висок win-rate (${(winRate * 100).toFixed(0)}%), но отрицателна expectancy — печелиш често малко, губиш рядко много. Win-rate сам по себе си лъже.`);

  if (profitFactor !== Infinity && profitFactor > 0 && profitFactor < 1)
    add('HIGH', 'pf-below-1', `Profit factor ${profitFactor.toFixed(2)} < 1 — брутните загуби надвишават брутните печалби. Няма ръб.`);

  // Verdict
  let verdict;
  if (expectancyR > 0 && profitFactor >= 1.3 && n >= 30)
    verdict = `✅ Има ръб на тази извадка (expectancy ${expectancyR.toFixed(3)}R, PF ${fmtPF(profitFactor)}). Пак: това е минало, не бъдеще — валидирай walk-forward и на testnet.`;
  else if (expectancyR <= 0)
    verdict = '❌ Няма ръб (отрицателна/нулева expectancy). Не рискувай реален капитал.';
  else
    verdict = '🟡 Смесено/недостатъчно — още данни/валидация преди реален капитал.';

  return { n, stats, mistakes, verdict };
}

function mean(a) { return a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0; }
function sum(a) { return a.reduce((x, y) => x + y, 0); }
function maxStreak(bools) { let m = 0, c = 0; for (const b of bools) { c = b ? c + 1 : 0; m = Math.max(m, c); } return m; }
function fmtPF(pf) { return pf === Infinity ? '∞' : pf.toFixed(2); }
export { fmtPF };
