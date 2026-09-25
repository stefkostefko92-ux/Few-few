// bot.js — главният цикъл. Ред на мислене на всяка итерация:
//   1) сверй състояние с борсата (reconcile)  2) капитал + дневен/drawdown контрол
//   3) сигнал от стратегията (само затворени свещи)  4) риск-гейтове  5) изпълнение със стоп
// Всяка стъпка е защитена: рискът се проверява ПРЕДИ всеки вход; kill-switch спира всичко.
import { makeExchange, loadMarket } from './exchange.js';
import { fetchClosedCandles, currentPrice, readEquity } from './marketdata.js';
import { prepare, signalAt, stopDistance } from './strategy.js';
import { positionSize, checkRiskGates, updateEquityPeak, tradingAllowedByFrequency } from './risk.js';
import { marketBuy, marketSell, placeStopLoss, cancelAllOpen } from './execute.js';
import { loadState, saveState, rollDay } from './state.js';
import { tradeRecord, recordTrade } from './journal.js';
import { log, audit } from './logger.js';

// Слага стопа; при отказ позицията остава отбелязана `unprotected`, kill-switch-ът се включва (без нови
// входове) и грешката отива в лога/одита — следващият tick опитва стопа наново. Записва state.
export async function protect(place, state, symbol) {
  const pos = state.position ?? null;
  try {
    await place();
    if (pos) delete pos.unprotected;
  } catch (e) {
    state.killed = true;
    log.error(`⛔ ${symbol}: стопът НЕ е поставен (${e.message}) — позицията е без защита на борсата. KILL-SWITCH включен; повторен опит следващия tick. Провери ръчно.`);
    audit('stop.failed', { symbol, error: String(e.message).slice(0, 200) });
  }
  saveState(state);
}

export async function runOnce(ex, cfg, market, state) {
  const price = await currentPrice(ex, cfg.symbol);
  const warmup = Math.max(cfg.emaTrend, cfg.emaSlow, cfg.smaSlow, cfg.atrPeriod, cfg.rsiPeriod) + 5;
  const { candles, closes } = await fetchClosedCandles(ex, cfg.symbol, cfg.timeframe, warmup + 50);
  if (closes.length < warmup) { log.warn('Недостатъчно свещи още (warmup).'); return state; }

  // Капитал: в live/testnet чете реалния баланс; в dry-run без ключове ползва paper капитал.
  let equity, baseTotal;
  try {
    ({ equity, baseTotal } = await readEquity(ex, cfg.symbol, price));
  } catch (e) {
    if (cfg.live) throw e; // на живо липсващият баланс е фатален — не гадаем
    equity = cfg.paperEquity + (state.paperPnl ?? 0); baseTotal = 0;
    log.warn(`DRY-RUN: балансът не е четен (${e.message}) → paper капитал $${equity.toFixed(2)}`);
  }
  rollDay(state, equity);
  updateEquityPeak(state, equity);

  const ctx = prepare(candles, cfg);
  const i = closes.length - 1;                 // последна ЗАТВОРЕНА свещ
  const sig = signalAt(ctx, i);

  // Затваряне на позиция „отвън":
  //  • live: борсата е източник на истината — базовият актив е изчезнал (стопът се е напълнил).
  //  • dry-run: няма реална позиция на борсата — симулираме стопа, ако цената е под него.
  const minCost = market?.limits?.cost?.min ?? 0;
  if (state.position && (cfg.live ? baseTotal * price <= minCost : price <= state.position.stopPrice)) {
    const rec = tradeRecord({
      symbol: cfg.symbol, entry: state.position.entry, exit: state.position.stopPrice,
      qty: state.position.qty, stopPrice: state.position.stopPrice, exitReason: 'stop',
    });
    recordTrade(rec);
    audit('trade.closed', rec);
    if (!cfg.live) state.paperPnl = (state.paperPnl ?? 0) + rec.pnlQuote;
    if (rec.rMultiple <= 0) state.lastLossMs = Date.now(); // cooldown срещу revenge trading
    log.info(`Позицията е затворена (стоп) → записана в дневника: ${rec.rMultiple}R`);
    state.position = null;
    saveState(state);
  }

  // Имаме ли позиция: live → по реалния баланс; dry-run → по паметта (paper позиция).
  const hasPosition = cfg.live ? baseTotal * price > minCost : !!state.position;

  audit('tick', { price, equity, signal: sig, hasPosition, killed: state.killed });
  log.info(`tick: price=${price} equity=${equity.toFixed(2)} signal=${sig ?? '—'} pos=${hasPosition}`);

  // Изход: сигнал за изход → продавам, махам стопа и записвам сделката в дневника.
  if (hasPosition && sig === 'exit') {
    log.info('Сигнал за ИЗХОД → продавам и махам стопа.');
    await cancelAllOpen({ ex, cfg, symbol: cfg.symbol });
    const sellQty = cfg.live ? baseTotal : state.position?.qty ?? 0;
    if (sellQty > 0) await marketSell({ ex, cfg, market, symbol: cfg.symbol, quantity: sellQty, price });
    if (state.position) {
      const rec = tradeRecord({
        symbol: cfg.symbol, entry: state.position.entry, exit: price,
        qty: state.position.qty, stopPrice: state.position.stopPrice, exitReason: 'signal',
      });
      recordTrade(rec);
      audit('trade.closed', rec);
      if (!cfg.live) state.paperPnl = (state.paperPnl ?? 0) + rec.pnlQuote;
      if (rec.rMultiple <= 0) state.lastLossMs = Date.now();
      log.info(`Изход по сигнал → записан в дневника: ${rec.rMultiple}R`);
    }
    state.position = null;
    saveState(state);
    return state;
  }

  // Незащитена позиция (стопът е бил отказан или отменен без заместител) → всеки tick опитва наново.
  if (hasPosition && state.position?.unprotected) {
    const qty = cfg.live ? baseTotal : state.position.qty;
    await protect(() => placeStopLoss({ ex, cfg, market, symbol: cfg.symbol, quantity: qty, stopPrice: state.position.stopPrice }), state, cfg.symbol);
  }

  // Trailing stop: ако сме в позиция и цената се вдигна, качваме стопа НАГОРЕ (никога надолу).
  if (hasPosition && cfg.useTrailing && state.position && !state.position.unprotected) {
    const newStop = price - stopDistance(ctx, i, price);
    if (newStop > (state.position.stopPrice ?? 0) * 1.001) {
      log.info(`Trailing: качвам стоп ${(state.position.stopPrice ?? 0).toFixed(2)} → ${newStop.toFixed(2)}`);
      // Старият стоп се маха преди новия → между двете позицията е гола. Отбелязваме го на диска.
      state.position.unprotected = true;
      saveState(state);
      await cancelAllOpen({ ex, cfg, symbol: cfg.symbol });
      const trailQty = cfg.live ? baseTotal : state.position.qty;
      state.position.stopPrice = newStop;
      await protect(() => placeStopLoss({ ex, cfg, market, symbol: cfg.symbol, quantity: trailQty, stopPrice: newStop }), state, cfg.symbol);
    }
  }

  // Вход: само ако нямаме позиция и има long сигнал.
  if (!hasPosition && sig === 'long') {
    const gate = checkRiskGates({
      equity, state,
      dailyLossLimitPct: cfg.dailyLossLimitPct,
      maxDrawdownPct: cfg.maxDrawdownPct,
    });
    if (!gate.allowed) {
      if (gate.kill) { state.killed = true; saveState(state); }
      log.warn(`ВХОД отказан от риск-гейт: ${gate.reason}`);
      audit('risk.block', { reason: gate.reason, kill: gate.kill });
      return state;
    }

    // Честотни спирачки: дневен лимит сделки + cooldown след загуба (срещу over-/revenge trading).
    const freq = tradingAllowedByFrequency({
      state, maxTradesPerDay: cfg.maxTradesPerDay, cooldownMinutes: cfg.cooldownMinutes, nowMs: Date.now(),
    });
    if (!freq.allowed) {
      log.warn(`ВХОД отказан (честота): ${freq.reason}`);
      audit('freq.block', { reason: freq.reason });
      return state;
    }

    const stopPrice = price - stopDistance(ctx, i, price); // ATR-базиран (или % fallback)
    const qty = positionSize({
      equity, riskPct: cfg.riskPctPerTrade, entry: price, stopPrice,
      maxPositionPct: cfg.maxPositionPct,
    });
    if (!(qty > 0)) { log.warn('Изчисленото количество е 0 — пропускам.'); return state; }

    log.info(`Сигнал ВХОД → купувам ~${qty} @${price}, стоп @${stopPrice.toFixed(2)}`);
    const buy = await marketBuy({ ex, cfg, market, symbol: cfg.symbol, quantity: qty, price });
    const filled = buy.filled ?? qty;
    if (!(filled > 0)) {
      // expired/0 fill: няма позиция → нито запис, нито брояч, нито фалшив -1R в дневника.
      log.warn('Покупката не се изпълни (filled 0) — няма позиция.');
      audit('entry.unfilled', { symbol: cfg.symbol, status: buy.status ?? null });
      return state;
    }
    // Позицията се записва ПРЕДИ стопа: ако борсата откаже стопа, ботът пак знае за нея
    // (Трейдъра + Изпитателя, 2026-09-24 — преди отказан стоп губеше напълно позицията).
    state.position = { qty: filled, entry: buy.average ?? price, stopPrice, unprotected: true };
    state.dayTradeCount = (state.dayTradeCount ?? 0) + 1; // за дневния лимит сделки
    saveState(state);
    // Веднага защитен стоп на БОРСАТА (не 'ментален').
    await protect(() => placeStopLoss({ ex, cfg, market, symbol: cfg.symbol, quantity: filled, stopPrice }), state, cfg.symbol);
    return state;
  }

  saveState(state);
  return state;
}

export async function startBot(cfg) {
  const ex = makeExchange(cfg);
  const market = await loadMarket(ex, cfg.symbol);
  const state = loadState();
  if (state.stateError) {
    log.error(`⛔ ${state.stateError} — KILL-SWITCH включен (fail closed). Запазено за разбор: ${state.stateKept || 'не успях да го преместя'}. Провери позициите на борсата ръчно.`);
    audit('state.corrupt', { error: state.stateError, kept: state.stateKept });
    delete state.stateError; delete state.stateKept; // kill-switch-ът остава в state; бележката — само в лога
  }
  if (state.killed) log.warn('⛔ KILL-SWITCH е активен от предишна сесия. Ботът няма да отваря позиции. Изчисти data/state.json след разбор, за да го нулираш.');

  log.info(`Стартиран. Цикъл на всеки ${cfg.loopSeconds}s. Ctrl+C за спиране.`);
  let stop = false;
  // SIGTERM идва от systemctl stop / docker stop / kill — без него ботът умираше по средата на цикъла,
  // между поръчка към борсата и saveState. Сега и двата сигнала довършват текущия цикъл.
  for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => { log.info(`Спиране (${sig})…`); stop = true; });

  while (!stop) {
    try {
      await runOnce(ex, cfg, market, state);
    } catch (e) {
      log.error(`Цикъл грешка: ${e.message}`);
      audit('loop.error', { error: e.message });
    }
    // изчакване с ранно прекъсване
    for (let s = 0; s < cfg.loopSeconds && !stop; s++) await new Promise((r) => setTimeout(r, 1000));
  }
  log.info('Спрян.');
}
