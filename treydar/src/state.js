// state.js — трайно състояние на бота между рестартите (equity връх, дневен старт, позиция).
// Персистира намерения, за да може ботът да рестартира и да продължи от реалността.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
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
  position: null,      // { qty, entry, stopClientId } или null
  dayTradeCount: 0,    // брой входове днес (за дневния лимит сделки)
  lastLossMs: null,    // timestamp на последната губеща сделка (за cooldown)
};

export function loadState() {
  try {
    return { ...DEFAULT, ...JSON.parse(readFileSync(stateFile, 'utf8')) };
  } catch {
    return { ...DEFAULT };
  }
}

export function saveState(state) {
  writeFileSync(stateFile, JSON.stringify(state, null, 2));
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
