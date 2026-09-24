// state.js — трайно състояние на бота между рестартите (equity връх, дневен старт, позиция).
// Персистира намерения, за да може ботът да рестартира и да продължи от реалността.
import { readFileSync, writeFileSync, mkdirSync, renameSync, linkSync, rmSync } from 'node:fs';
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
    // saveState винаги пише killed (DEFAULT се разгъва) — липсващо/небулево поле значи чужд или счупен файл,
    // не „чисто състояние“. Иначе {} тихо забравя отворена позиция (Разбивача, 2026-09-24).
    if (typeof parsed.killed !== 'boolean') throw new Error('killed липсва или не е булево');
    if (parsed.position != null && typeof parsed.position !== 'object') throw new Error('position не е обект');
    if (parsed.positions != null && (typeof parsed.positions !== 'object' || Array.isArray(parsed.positions))) throw new Error('positions не е обект');
    return { ...DEFAULT, ...parsed };
  } catch (e) {
    return corrupt(file, `повреден ${file}: ${e.message}`);
  }
}

function corrupt(file, reason) {
  // Затвореният kill-switch се записва ВЕДНАГА: иначе живее само в паметта и рестарт преди първия
  // успешен tick вижда ENOENT → killed:false (Разбивача, 2026-09-24).
  // Редът е важен: първо временен файл, после доказателство (hard link), накрая атомарен rename върху
  // оригинала. Ако записът падне (ENOSPC), повреденият файл остава на място → следващото пускане
  // пак го вижда като повреден → пак fail closed. Никога не местим оригинала преди новото да е на диска.
  const tmp = `${file}.tmp-${process.pid}`;
  try {
    writeFileSync(tmp, JSON.stringify({ ...DEFAULT, killed: true }, null, 2));
  } catch {
    try { rmSync(tmp, { force: true }); } catch { /* ignore */ }
    return { ...DEFAULT, killed: true, stateError: reason, stateKept: null };
  }
  let kept = `${file}.corrupt-${Date.now()}`;
  try { linkSync(file, kept); } catch { kept = null; }
  try { renameSync(tmp, file); } catch { try { rmSync(tmp, { force: true }); } catch { /* ignore */ } }
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
