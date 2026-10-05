// multibot.js — мулти-символен (портфейлен) режим. Активира се при SYMBOLS с ≥2 символа.
// Всеки символ минава през СЪЩИТЕ предпазители като bot.js (риск-гейтове, честота, стоп на
// борсата, дневник), плюс портфейлните лимити (Dalio): макс едновременни позиции, таван на
// общия риск и таван на риска в КОРЕЛИРАНА група (BTC/ETH ≈ един залог, не два).
// Позициите живеят в state.positions[symbol]; в live режим борсата остава източник на истината.
import { makeExchange } from './exchange.js';
import { fetchClosedCandles, currentPrice, readPortfolioEquity } from './marketdata.js';
import { prepare, signalAt, stopDistance } from './strategy.js';
import { positionSize, checkRiskGates, updateEquityPeak, tradingAllowedByFrequency } from './risk.js';
import { marketBuy, marketSell, placeStopLoss, cancelAllOpen } from './execute.js';
import { loadState, saveState, rollDay } from './state.js';
import { tradeRecord, recordTrade } from './journal.js';
import { canOpenPosition, groupByCorrelation, toReturns } from './portfolio.js';
import { log, audit } from './logger.js';

function warmupBars(cfg) {
  return Math.max(cfg.emaTrend, cfg.emaSlow, cfg.smaSlow, cfg.atrPeriod, cfg.rsiPeriod) + 5;
}

// Затваря счетоводно позиция (журнал + cooldown + paper PnL) и я маха от state.
function closePosition({ cfg, state, symbol, exit, exitReason }) {
  const pos = state.positions[symbol];
  if (!pos) return;
  const rec = tradeRecord({
    symbol, entry: pos.entry, exit, qty: pos.qty, stopPrice: pos.stopPrice, exitReason,
  });
  recordTrade(rec);
  audit('trade.closed', rec);
  if (!cfg.live) state.paperPnl = (state.paperPnl ?? 0) + rec.pnlQuote;
  if (rec.rMultiple <= 0) state.lastLossMs = Date.now();
  log.info(`[${symbol}] затворена (${exitReason}) → дневник: ${rec.rMultiple}R`);
  delete state.positions[symbol];
}

// Обработва един символ в рамките на текущия tick.
async function tickSymbol({ ex, cfg, market, state, symbol, groups, equity, price, candles, closes, baseTotal }) {
  const ctx = prepare(candles, cfg);
  const i = closes.length - 1;
  const sig = signalAt(ctx, i);
  const pos = state.positions[symbol];
  const minCost = market?.limits?.cost?.min ?? 0;

  // Затваряне „отвън": live → базовият актив е изчезнал (стопът се е напълнил);
  // dry-run → симулираме стопа при цена под него.
  if (pos && (cfg.live ? baseTotal * price <= minCost : price <= pos.stopPrice))
    closePosition({ cfg, state, symbol, exit: pos.stopPrice, exitReason: 'stop' });

  const hasPosition = cfg.live ? baseTotal * price > minCost : !!state.positions[symbol];
  audit('tick', { symbol, price, signal: sig, hasPosition });
  log.info(`[${symbol}] price=${price} signal=${sig ?? '—'} pos=${hasPosition}`);

  // Изход по сигнал.
  if (hasPosition && sig === 'exit') {
    await cancelAllOpen({ ex, cfg, symbol });
    const sellQty = cfg.live ? baseTotal : state.positions[symbol]?.qty ?? 0;
    if (sellQty > 0) await marketSell({ ex, cfg, market, symbol, quantity: sellQty, price });
    closePosition({ cfg, state, symbol, exit: price, exitReason: 'signal' });
    return;
  }

  // Незащитена позиция → всеки tick опитва стопа наново.
  if (hasPosition && state.positions[symbol]?.unprotected) {
    const p = state.positions[symbol];
    const qty = cfg.live ? baseTotal : p.qty;
    await protectMulti(() => placeStopLoss({ ex, cfg, market, symbol, quantity: qty, stopPrice: p.stopPrice }), state, symbol);
  }

  // Trailing stop (само нагоре).
  if (hasPosition && cfg.useTrailing && state.positions[symbol] && !state.positions[symbol].unprotected) {
    const p = state.positions[symbol];
    const newStop = price - stopDistance(ctx, i, price);
    if (newStop > (p.stopPrice ?? 0) * 1.001) {
      log.info(`[${symbol}] trailing: стоп ${p.stopPrice.toFixed(2)} → ${newStop.toFixed(2)}`);
      p.unprotected = true; // между отмяната и новия стоп позицията е гола
      saveState(state);
      await cancelAllOpen({ ex, cfg, symbol });
      const trailQty = cfg.live ? baseTotal : p.qty;
      p.stopPrice = newStop;
      await protectMulti(() => placeStopLoss({ ex, cfg, market, symbol, quantity: trailQty, stopPrice: newStop }), state, symbol);
    }
  }

  // Вход.
  if (!hasPosition && sig === 'long') {
    // 1) Глобални риск-гейтове (дневен лимит загуба, max drawdown → kill).
    const gate = checkRiskGates({
      equity, state, dailyLossLimitPct: cfg.dailyLossLimitPct, maxDrawdownPct: cfg.maxDrawdownPct,
    });
    if (!gate.allowed) {
      if (gate.kill) state.killed = true;
      log.warn(`[${symbol}] вход отказан (риск): ${gate.reason}`);
      audit('risk.block', { symbol, reason: gate.reason, kill: gate.kill });
      return;
    }
    // 2) Честотни спирачки (over-/revenge trading) — общи за портфейла.
    const freq = tradingAllowedByFrequency({
      state, maxTradesPerDay: cfg.maxTradesPerDay, cooldownMinutes: cfg.cooldownMinutes, nowMs: Date.now(),
    });
    if (!freq.allowed) {
      log.warn(`[${symbol}] вход отказан (честота): ${freq.reason}`);
      audit('freq.block', { symbol, reason: freq.reason });
      return;
    }
    // 3) Портфейлни лимити: едновременни позиции, общ риск, риск в корелирана група.
    const openPositions = Object.entries(state.positions).map(([s, p]) => ({ symbol: s, riskPct: p.riskPct ?? cfg.riskPctPerTrade }));
    const port = canOpenPosition({
      openPositions, proposed: { symbol, riskPct: cfg.riskPctPerTrade }, groups,
      maxConcurrent: cfg.maxConcurrent, maxPortfolioRiskPct: cfg.maxPortfolioRiskPct, maxGroupRiskPct: cfg.maxGroupRiskPct,
    });
    if (!port.allowed) {
      log.warn(`[${symbol}] вход отказан (портфейл): ${port.reason}`);
      audit('portfolio.block', { symbol, reason: port.reason });
      return;
    }

    const stopPrice = price - stopDistance(ctx, i, price);
    const qty = positionSize({
      equity, riskPct: cfg.riskPctPerTrade, entry: price, stopPrice, maxPositionPct: cfg.maxPositionPct,
    });
    if (!(qty > 0)) { log.warn(`[${symbol}] количество 0 — пропускам.`); return; }

    log.info(`[${symbol}] ВХОД → ~${qty} @${price}, стоп @${stopPrice.toFixed(2)}`);
    const buy = await marketBuy({ ex, cfg, market, symbol, quantity: qty, price });
    const filled = buy.filled ?? qty;
    if (!(filled > 0)) {
      log.warn(`[${symbol}] покупката не се изпълни (filled 0) — няма позиция.`);
      audit('entry.unfilled', { symbol, status: buy.status ?? null });
      return;
    }
    // Позицията се записва ПРЕДИ стопа — отказан стоп не бива да я изтрие от портфейлните лимити.
    state.positions[symbol] = { qty: filled, entry: buy.average ?? price, stopPrice, riskPct: cfg.riskPctPerTrade, unprotected: true };
    state.dayTradeCount = (state.dayTradeCount ?? 0) + 1;
    saveState(state);
    await protectMulti(() => placeStopLoss({ ex, cfg, market, symbol, quantity: filled, stopPrice }), state, symbol);
  }
}

// Като protect() в bot.js, но за позиция в state.positions[symbol].
export async function protectMulti(place, state, symbol) {
  const pos = state.positions[symbol];
  try {
    await place();
    if (pos) delete pos.unprotected;
  } catch (e) {
    state.killed = true;
    log.error(`⛔ [${symbol}] стопът НЕ е поставен (${e.message}) — позицията е без защита на борсата. KILL-SWITCH включен; повторен опит следващия tick. Провери ръчно.`);
    audit('stop.failed', { symbol, error: String(e.message).slice(0, 200) });
  }
  saveState(state);
}

export async function runOnceMulti(ex, cfg, markets, state) {
  // 1) Данни за всички символи (цена + затворени свещи).
  const data = {};
  for (const s of cfg.symbols) {
    const price = await currentPrice(ex, s);
    const { candles, closes } = await fetchClosedCandles(ex, s, cfg.timeframe, warmupBars(cfg) + 50);
    data[s] = { price, candles, closes };
  }
  const ready = cfg.symbols.filter((s) => data[s].closes.length >= warmupBars(cfg));
  if (!ready.length) { log.warn('Недостатъчно свещи за всички символи още.'); return state; }

  // 2) Портфейлен капитал (в live/testnet от борсата; dry-run → paper).
  let equity, baseTotals;
  try {
    const prices = Object.fromEntries(ready.map((s) => [s, data[s].price]));
    ({ equity, baseTotals } = await readPortfolioEquity(ex, ready, prices));
  } catch (e) {
    if (cfg.live) throw e;
    equity = cfg.paperEquity + (state.paperPnl ?? 0);
    baseTotals = Object.fromEntries(ready.map((s) => [s, 0]));
    log.warn(`DRY-RUN: балансът не е четен (${e.message}) → paper капитал $${equity.toFixed(2)}`);
  }
  rollDay(state, equity);
  updateEquityPeak(state, equity);
  audit('portfolio.tick', { equity, symbols: ready.length, open: Object.keys(state.positions).length });

  // 3) Корелационни групи от доходностите на затворените свещи (кои символи са „един залог").
  const retsBySym = {};
  for (const s of ready) retsBySym[s] = toReturns(data[s].closes);
  const groups = groupByCorrelation(ready, retsBySym, cfg.corrThreshold);

  // 4) Обработи всеки символ (последователно — ccxt rate limiter пази).
  for (const s of ready) {
    try {
      await tickSymbol({
        ex, cfg, market: markets[s], state, symbol: s, groups, equity,
        price: data[s].price, candles: data[s].candles, closes: data[s].closes,
        baseTotal: baseTotals[s] ?? 0,
      });
    } catch (e) {
      log.error(`[${s}] tick грешка: ${e.message}`);
      audit('tick.error', { symbol: s, error: e.message });
    }
  }
  saveState(state);
  return state;
}

export async function startMultiBot(cfg) {
  const ex = makeExchange(cfg);
  await ex.loadMarkets();
  const markets = {};
  for (const s of cfg.symbols) {
    markets[s] = ex.market(s);
    if (!markets[s]) throw new Error(`Няма такъв пазар: ${s}`);
  }
  const state = loadState();
  if (state.stateError) {
    log.error(`⛔ ${state.stateError} — KILL-SWITCH включен (fail closed). Запазено за разбор: ${state.stateKept || 'не успях да го преместя'}. Провери позициите на борсата ръчно.`);
    audit('state.corrupt', { error: state.stateError, kept: state.stateKept });
    delete state.stateError; delete state.stateKept; // kill-switch-ът остава в state; бележката — само в лога
  }
  if (state.killed) log.warn('⛔ KILL-SWITCH е активен от предишна сесия. Няма нови входове. Изчисти data/state.json след разбор.');

  log.info(`Мулти-символен режим: ${cfg.symbols.join(', ')} · цикъл ${cfg.loopSeconds}s · лимити: ≤${cfg.maxConcurrent} позиции, общ риск ≤${cfg.maxPortfolioRiskPct}%, група ≤${cfg.maxGroupRiskPct}% (|corr|≥${cfg.corrThreshold})`);
  let stop = false;
  // SIGTERM идва от systemctl stop / docker stop / kill — без него ботът умираше по средата на цикъла,
  // между поръчка към борсата и saveState. Сега и двата сигнала довършват текущия цикъл.
  for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => { log.info(`Спиране (${sig})…`); stop = true; });

  while (!stop) {
    try {
      await runOnceMulti(ex, cfg, markets, state);
    } catch (e) {
      log.error(`Цикъл грешка: ${e.message}`);
      audit('loop.error', { error: e.message });
    }
    for (let s = 0; s < cfg.loopSeconds && !stop; s++) await new Promise((r) => setTimeout(r, 1000));
  }
  log.info('Спрян.');
}
