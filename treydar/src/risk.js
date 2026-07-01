// risk.js — риск-мениджмънтът. ТОВА е най-важният файл. Всичко тук е чисти функции,
// за да е тестваемо и предвидимо. Правило: рискът е закон, не опция.

// Размер на позицията от РИСКА, не от "колко искам да вложа".
// Рискуваш точно riskPct% от капитала; разстоянието до стопа определя количеството.
//   риск в пари = equity * riskPct/100
//   загуба на единица = entry - stopPrice   (за long)
//   количество = риск в пари / загуба на единица
// После се капва до maxPositionPct от капитала.
export function positionSize({ equity, riskPct, entry, stopPrice, maxPositionPct }) {
  if (!(equity > 0) || !(entry > 0)) return 0;
  if (!(stopPrice > 0) || stopPrice >= entry) throw new Error('stopPrice трябва да е > 0 и < entry (long).');
  const riskMoney = equity * (riskPct / 100);
  const perUnitLoss = entry - stopPrice;
  let qty = riskMoney / perUnitLoss;

  // Таван: стойността на позицията да не надхвърля maxPositionPct% от капитала.
  const maxNotional = equity * (maxPositionPct / 100);
  if (qty * entry > maxNotional) qty = maxNotional / entry;
  return qty;
}

// Stop-loss цена за long от фиксиран % под входа.
export function stopFromPct(entry, stopLossPct) {
  return entry * (1 - stopLossPct / 100);
}
export function takeProfitFromPct(entry, takeProfitPct) {
  return takeProfitPct > 0 ? entry * (1 + takeProfitPct / 100) : null;
}

// Оценка на риск-предпазителите ПРЕДИ да позволим нов вход.
// state: { equityPeak, dayStartEquity, killed }
// Връща { allowed, reason, kill } — kill=true означава трайно спиране (max drawdown).
export function checkRiskGates({ equity, state, dailyLossLimitPct, maxDrawdownPct }) {
  if (state.killed) return { allowed: false, kill: true, reason: 'KILL-SWITCH вече е активен (max drawdown).' };

  // Глобален max drawdown спрямо исторически връх → трайно спиране.
  const peak = Math.max(state.equityPeak ?? equity, equity);
  const ddPct = peak > 0 ? ((peak - equity) / peak) * 100 : 0;
  if (ddPct >= maxDrawdownPct)
    return { allowed: false, kill: true, reason: `Max drawdown ${ddPct.toFixed(2)}% ≥ ${maxDrawdownPct}% → KILL-SWITCH.` };

  // Дневен лимит на загубата спрямо капитала в началото на деня → пауза за деня.
  const base = state.dayStartEquity ?? equity;
  const dayPnlPct = base > 0 ? ((equity - base) / base) * 100 : 0;
  if (dayPnlPct <= -dailyLossLimitPct)
    return { allowed: false, kill: false, reason: `Дневна загуба ${dayPnlPct.toFixed(2)}% ≤ -${dailyLossLimitPct}% → стоп за днес.` };

  return { allowed: true, kill: false, reason: 'ok' };
}

// Обновява върха на капитала (за drawdown сметката).
export function updateEquityPeak(state, equity) {
  state.equityPeak = Math.max(state.equityPeak ?? equity, equity);
  return state.equityPeak;
}
