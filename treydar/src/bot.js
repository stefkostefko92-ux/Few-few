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
    equity = cfg.paperEquity; baseTotal = 0;
    log.warn(`DRY-RUN: балансът не е четен (${e.message}) → paper капитал $${equity}`);
  }
  rollDay(state, equity);
  updateEquityPeak(state, equity);

  const ctx = prepare(candles, cfg);
  const i = closes.length - 1;                 // последна ЗАТВОРЕНА свещ
  const sig = signalAt(ctx, i);
  const hasPosition = baseTotal * price > (market?.limits?.cost?.min ?? 0);

  audit('tick', { price, equity, signal: sig, hasPosition, killed: state.killed });
  log.info(`tick: price=${price} equity=${equity.toFixed(2)} signal=${sig ?? '—'} pos=${hasPosition}`);

  // Позицията е затворена ОТВЪН (стопът на борсата се е напълнил, или ръчна продажба):
  // запиши сделката в дневника като изход по стоп, за да учи ботът от нея.
  if (!hasPosition && state.position) {
    const rec = tradeRecord({
      symbol: cfg.symbol, entry: state.position.entry, exit: state.position.stopPrice,
      qty: state.position.qty, stopPrice: state.position.stopPrice, exitReason: 'stop',
    });
    recordTrade(rec);
    audit('trade.closed', rec);
    if (rec.rMultiple <= 0) state.lastLossMs = Date.now(); // cooldown срещу revenge trading
    log.info(`Позицията е затворена (стоп) → записана в дневника: ${rec.rMultiple}R`);
    state.position = null;
    saveState(state);
  }

  // Изход: сигнал за изход → продавам, махам стопа и записвам сделката в дневника.
  if (hasPosition && sig === 'exit') {
    log.info('Сигнал за ИЗХОД → продавам и махам стопа.');
    await cancelAllOpen({ ex, cfg, symbol: cfg.symbol });
    await marketSell({ ex, cfg, market, symbol: cfg.symbol, quantity: baseTotal, price });
    if (state.position) {
      const rec = tradeRecord({
        symbol: cfg.symbol, entry: state.position.entry, exit: price,
        qty: state.position.qty, stopPrice: state.position.stopPrice, exitReason: 'signal',
      });
      recordTrade(rec);
      audit('trade.closed', rec);
      if (rec.rMultiple <= 0) state.lastLossMs = Date.now();
      log.info(`Изход по сигнал → записан в дневника: ${rec.rMultiple}R`);
    }
    state.position = null;
    saveState(state);
    return state;
  }

  // Trailing stop: ако сме в позиция и цената се вдигна, качваме стопа НАГОРЕ (никога надолу).
  if (hasPosition && cfg.useTrailing && state.position) {
    const newStop = price - stopDistance(ctx, i, price);
    if (newStop > (state.position.stopPrice ?? 0) * 1.001) {
      log.info(`Trailing: качвам стоп ${(state.position.stopPrice ?? 0).toFixed(2)} → ${newStop.toFixed(2)}`);
      await cancelAllOpen({ ex, cfg, symbol: cfg.symbol });
      await placeStopLoss({ ex, cfg, market, symbol: cfg.symbol, quantity: baseTotal, stopPrice: newStop });
      state.position.stopPrice = newStop;
      saveState(state);
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
    // Веднага защитен стоп на БОРСАТА (не 'ментален').
    if (filled > 0) await placeStopLoss({ ex, cfg, market, symbol: cfg.symbol, quantity: filled, stopPrice });
    state.position = { qty: filled, entry: buy.average ?? price, stopPrice };
    state.dayTradeCount = (state.dayTradeCount ?? 0) + 1; // за дневния лимит сделки
    saveState(state);
    return state;
  }

  saveState(state);
  return state;
}

export async function startBot(cfg) {
  const ex = makeExchange(cfg);
  const market = await loadMarket(ex, cfg.symbol);
  const state = loadState();
  if (state.killed) log.warn('⛔ KILL-SWITCH е активен от предишна сесия. Ботът няма да отваря позиции. Изчисти data/state.json след разбор, за да го нулираш.');

  log.info(`Стартиран. Цикъл на всеки ${cfg.loopSeconds}s. Ctrl+C за спиране.`);
  let stop = false;
  process.on('SIGINT', () => { log.info('Спиране…'); stop = true; });

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
