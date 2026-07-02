// execute.js — изпращане на поръчки БЕЗОПАСНО: идемпотентност (clientOrderId + reconcile),
// precision закръгляне (floor към stepSize/tickSize + minNotional), защитен стоп след fill.
// В dry-run само логва намерението. Мрежов провал ≠ "поръчката не мина" → reconcile преди ретрай.
import { log, audit } from './logger.js';

// Уникален, но детерминистичен-по-намерение clientOrderId (буквено-цифров, макс 36 за Binance).
function makeClientId(tag) {
  const rnd = Math.floor(performance.now() * 1000) % 1e9; // варира без Math.random
  return `tr-${tag}-${Date.now().toString(36)}-${rnd.toString(36)}`.slice(0, 36);
}

// Закръгля количество/цена НАДОЛУ към precision на пазара (ccxt връща стрингове — точни).
function amt(ex, symbol, quantity) { return ex.amountToPrecision(symbol, quantity); }
function prc(ex, symbol, price) { return ex.priceToPrecision(symbol, price); }

// Проверка minNotional (мин. стойност на поръчка). Връща null ако е под минимума.
function meetsMinNotional(market, quantity, price) {
  const min = market?.limits?.cost?.min;
  if (min == null) return true;
  return quantity * price >= min;
}

// Проверява дали поръчка с този clientOrderId вече съществува на борсата (за идемпотентен ретрай).
async function findByClientId(ex, symbol, clientId) {
  try {
    const open = await ex.fetchOpenOrders(symbol);
    const hit = open.find((o) => o.clientOrderId === clientId);
    if (hit) return hit;
  } catch (e) { log.warn('fetchOpenOrders неуспех при reconcile', e.message); }
  try {
    const closed = await ex.fetchClosedOrders(symbol, undefined, 10);
    return closed.find((o) => o.clientOrderId === clientId) || null;
  } catch { return null; }
}

// Пазарен вход (buy). Идемпотентен: при мрежова грешка НЕ праща сляпо пак — първо сверява.
export async function marketBuy({ ex, cfg, market, symbol, quantity, price }) {
  const qty = Number(amt(ex, symbol, quantity));
  if (!(qty > 0)) throw new Error('Количество след закръгляне е 0 (под stepSize).');
  if (!meetsMinNotional(market, qty, price))
    throw new Error(`Под minNotional: ${(qty * price).toFixed(2)} < ${market.limits.cost.min}.`);

  const clientOrderId = makeClientId('buy');
  audit('intent.buy', { symbol, qty, price, clientOrderId, live: cfg.live });

  if (!cfg.live) {
    log.info(`DRY-RUN BUY ${qty} ${symbol} ~@${price} (clientOrderId=${clientOrderId})`);
    return { dryRun: true, clientOrderId, amount: qty, price };
  }

  try {
    const order = await ex.createOrder(symbol, 'market', 'buy', qty, undefined, { newClientOrderId: clientOrderId });
    audit('order.buy.ok', { clientOrderId, id: order.id, filled: order.filled, avg: order.average });
    return order;
  } catch (e) {
    // Може поръчката да е минала, но отговорът да се е загубил. Сверявай, не дублирай.
    log.warn(`BUY грешка (${e.constructor?.name}): ${e.message} → reconcile по clientOrderId`, '');
    const existing = await findByClientId(ex, symbol, clientOrderId);
    if (existing) { audit('order.buy.reconciled', { clientOrderId, id: existing.id }); return existing; }
    audit('order.buy.fail', { clientOrderId, error: e.message });
    throw e; // наистина не е минала — горе решава дали да опита пак с НОВ clientOrderId
  }
}

// Защитен стоп-лос на БОРСАТА след вход (STOP_LOSS_LIMIT за spot). Не 'ментален' стоп в паметта.
export async function placeStopLoss({ ex, cfg, market, symbol, quantity, stopPrice }) {
  const qty = Number(amt(ex, symbol, quantity));
  const stop = Number(prc(ex, symbol, stopPrice));
  // limit цена малко под стоп-цената, за да се напълни при задействане.
  const limit = Number(prc(ex, symbol, stopPrice * 0.999));
  const clientOrderId = makeClientId('stop');
  audit('intent.stop', { symbol, qty, stop, limit, clientOrderId, live: cfg.live });

  if (!cfg.live) {
    log.info(`DRY-RUN STOP-LOSS sell ${qty} ${symbol} stop@${stop} limit@${limit}`);
    return { dryRun: true, clientOrderId, stopPrice: stop };
  }
  try {
    const order = await ex.createOrder(symbol, 'STOP_LOSS_LIMIT', 'sell', qty, limit, {
      stopPrice: stop, newClientOrderId: clientOrderId, timeInForce: 'GTC',
    });
    audit('order.stop.ok', { clientOrderId, id: order.id, stop });
    return order;
  } catch (e) {
    const existing = await findByClientId(ex, symbol, clientOrderId);
    if (existing) return existing;
    audit('order.stop.fail', { clientOrderId, error: e.message });
    throw e;
  }
}

// Изход (sell) — при сигнал за изход или ръчно затваряне. Идемпотентен като входа.
export async function marketSell({ ex, cfg, market, symbol, quantity, price }) {
  const qty = Number(amt(ex, symbol, quantity));
  if (!(qty > 0)) throw new Error('Количество за продажба е 0.');
  const clientOrderId = makeClientId('sell');
  audit('intent.sell', { symbol, qty, price, clientOrderId, live: cfg.live });

  if (!cfg.live) {
    log.info(`DRY-RUN SELL ${qty} ${symbol} ~@${price}`);
    return { dryRun: true, clientOrderId, amount: qty, price };
  }
  try {
    const order = await ex.createOrder(symbol, 'market', 'sell', qty, undefined, { newClientOrderId: clientOrderId });
    audit('order.sell.ok', { clientOrderId, id: order.id, filled: order.filled });
    return order;
  } catch (e) {
    const existing = await findByClientId(ex, symbol, clientOrderId);
    if (existing) return existing;
    audit('order.sell.fail', { clientOrderId, error: e.message });
    throw e;
  }
}

// Отменя всички отворени поръчки за символа (напр. стар стоп преди нов вход).
export async function cancelAllOpen({ ex, cfg, symbol }) {
  if (!cfg.live) { log.info(`DRY-RUN cancel all open ${symbol}`); return; }
  try {
    const open = await ex.fetchOpenOrders(symbol);
    for (const o of open) await ex.cancelOrder(o.id, symbol);
  } catch (e) { log.warn('cancelAllOpen неуспех', e.message); }
}
