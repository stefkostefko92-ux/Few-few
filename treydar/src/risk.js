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

// Дробен Kelly (Thorp): предлага риск% на сделка от РЕАЛИЗИРАНАТА статистика на бота.
//   Kelly f* = W − (1−W)/Rr,  където W = win rate, Rr = avgWin/|avgLoss| (payoff ratio).
// Ползваме ДРОБЕН Kelly (по подразбиране 1/4) заради variance drag и грешка в оценките;
// капваме, и връщаме 0 при недостатъчна/дегенеративна статистика (без едж → без риск).
export function fractionalKelly({ winRate, avgWinR, avgLossR, fraction = 0.25, cap = 2, minTrades = 30, trades = Infinity }) {
  if (trades < minTrades) return 0;                 // твърде малка извадка → не оразмерявай по Kelly
  const lossMag = Math.abs(avgLossR);
  if (!(winRate > 0) || !(avgWinR > 0) || !(lossMag > 0)) return 0;
  const payoff = avgWinR / lossMag;                 // Rr
  const f = winRate - (1 - winRate) / payoff;       // пълен Kelly фракция от капитала
  if (!(f > 0)) return 0;                            // няма едж → 0
  const riskPct = f * fraction * 100;               // като % риск на сделка
  return Math.min(riskPct, cap);                    // никога над cap%
}

// Обновява върха на капитала (за drawdown сметката).
export function updateEquityPeak(state, equity) {
  state.equityPeak = Math.max(state.equityPeak ?? equity, equity);
  return state.equityPeak;
}

// Честотни спирачки (психология → правила): дневен лимит сделки (over-trading) + cooldown след
// загуба (revenge trading). state: { dayTradeCount, lastLossMs }. nowMs в милисекунди.
export function tradingAllowedByFrequency({ state, maxTradesPerDay, cooldownMinutes, nowMs }) {
  if (maxTradesPerDay > 0 && (state.dayTradeCount ?? 0) >= maxTradesPerDay)
    return { allowed: false, reason: `Дневен лимит сделки (${maxTradesPerDay}) достигнат — стоп до утре (срещу over-trading).` };
  if (cooldownMinutes > 0 && state.lastLossMs) {
    const until = state.lastLossMs + cooldownMinutes * 60000;
    if (nowMs < until)
      return { allowed: false, reason: `Cooldown след загуба още ${Math.ceil((until - nowMs) / 60000)} мин (срещу revenge trading).` };
  }
  return { allowed: true, reason: 'ok' };
}
