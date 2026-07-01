// journal.js — трейд дневник: записва всяка ЗАТВОРЕНА сделка с контекст, за да може ботът да се
// учи от грешките си (post-trade анализ в coach.js / `npm run review`). Форматът е JSONL.
import { appendFileSync, readFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const dataDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'data');
try { mkdirSync(dataDir, { recursive: true }); } catch { /* ok */ }
const tradesFile = join(dataDir, 'trades.jsonl');

// Строи запис за сделка. R-multiple = печалба/загуба, мерена в единици първоначален риск (до стопа).
// Това е ключовата метрика за учене: рискувай 1R, цели много-R.
export function tradeRecord({ ts, symbol, entry, exit, qty, stopPrice, entryReason, exitReason }) {
  const riskPerUnit = entry - stopPrice;           // за long
  const rMultiple = riskPerUnit > 0 ? (exit - entry) / riskPerUnit : 0;
  const pnlPct = entry > 0 ? (exit / entry - 1) * 100 : 0;
  const pnlQuote = (exit - entry) * qty;
  return {
    ts: ts ?? new Date().toISOString(),
    symbol, side: 'long',
    entry, exit, qty, stopPrice,
    entryReason: entryReason ?? 'signal',
    exitReason: exitReason ?? 'signal',     // 'signal' | 'stop' | 'manual'
    rMultiple: round(rMultiple, 3),
    pnlPct: round(pnlPct, 3),
    pnlQuote: round(pnlQuote, 2),
    win: exit > entry,
  };
}

export function recordTrade(rec) {
  appendFileSync(tradesFile, JSON.stringify(rec) + '\n');
}

export function loadTrades() {
  let txt = '';
  try { txt = readFileSync(tradesFile, 'utf8'); } catch { return []; }
  return txt.split('\n').filter(Boolean).map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
}

function round(x, d) { const p = 10 ** d; return Math.round(x * p) / p; }
