// state.js — трайно състояние на бота между рестартите (equity връх, дневен старт, позиция).
// Персистира намерения, за да може ботът да рестартира и да продължи от реалността.
import { readFileSync, writeFileSync, mkdirSync, renameSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const dataDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'data');
try { mkdirSync(dataDir, { recursive: true }); } catch { /* ok */ }
const stateFile = join(dataDir, 'state.json');

const DEFAULT = {
  equityPeak: null,
  dayStartEquity: null,
  dayKey: null,        // YYYY-MM-DD за нулиране на дневния лимит
  killed: false,
  position: null,      // едно-символен режим: { qty, entry, stopPrice } или null
  positions: {},       // мулти-символен режим: { [symbol]: { qty, entry, stopPrice, riskPct } }
  paperPnl: 0,         // натрупан paper PnL в dry-run (за приблизителен paper капитал)
  dayTradeCount: 0,    // брой входове днес (за дневния лимит сделки)
  lastLossMs: null,    // timestamp на последната губеща сделка (за cooldown)
};

// Липсващ файл = първо пускане → чисто състояние. ПОВРЕДЕН файл (прекъснат запис, пълен диск) НЕ е
// „чисто състояние“: преди тихо връщахме DEFAULT с killed: false — kill-switch-ът се отваряше сам и
// отворените позиции се „забравяха“ (Наблюдателя, 2026-09-24). Сега: fail closed — kill-switch ВКЛ.,
// повреденият файл се запазва за разбор, а не се презаписва при следващия saveState.
export function loadState(file = stateFile) {
  let raw;
  try {
    raw = readFileSync(file, 'utf8');
  } catch (e) {
    if (e.code === 'ENOENT') return { ...DEFAULT };
    return corrupt(file, `не мога да прочета ${file}: ${e.code || e.message}`);
  }
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('не е обект');
    return { ...DEFAULT, ...parsed };
  } catch (e) {
    return corrupt(file, `повреден ${file}: ${e.message}`);
  }
}

function corrupt(file, reason) {
  let kept = null;
  try { kept = `${file}.corrupt-${Date.now()}`; renameSync(file, kept); } catch { kept = null; }
  return { ...DEFAULT, killed: true, stateError: reason, stateKept: kept };
}

// Атомарен запис: временен файл + rename. Прекъснат writeFileSync оставяше полупразен state.json.
export function saveState(state, file = stateFile) {
  const tmp = `${file}.tmp-${process.pid}`;
  writeFileSync(tmp, JSON.stringify(state, null, 2));
  renameSync(tmp, file);
}

// Нулира дневния старт-капитал при нов календарен ден (UTC).
export function rollDay(state, equity, now = new Date()) {
  const key = now.toISOString().slice(0, 10);
  if (state.dayKey !== key) {
    state.dayKey = key;
    state.dayStartEquity = equity;
    state.dayTradeCount = 0;      // нов ден → нулирай дневния брояч сделки
  }
  if (state.dayStartEquity == null) state.dayStartEquity = equity;
  return state;
}
