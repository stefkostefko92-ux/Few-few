// Клиентът на потока GET /api/v1/events (SSE) с резервен вариант (AC-13, §12.4): при отпадане —
// повторно свързване с нарастващо забавяне (+ малко случайност) и ПЕРИОДИЧНО презареждане през REST,
// докато потокът не се върне. Сървърът няма буфер за пропуснатото: след всяка (пре)връзка се
// презарежда през REST (разговори, известия, `…/messages?after=…` за отворените). Дублирането е
// изключено — съобщенията се сливат по id.

import { api } from '../api.js';
import { emit } from '../store.js';
import { setConn } from './model.js';
import { handleEvent, resync } from './sync.js';

const TYPES = [
  'message.created',
  'message.updated',
  'conversation.updated',
  'presence.changed',
  'notification.created',
  'case.assigned',
];
const BASE_DELAY = 1000;
const MAX_DELAY = 30000;
const POLL_EVERY = 20000;
/** Закъснението се нулира едва след толкова стабилна връзка — иначе изгонен поток (над тавана
 *  на сървъра от 5 на човек) се връща веднага и изгонва следващия таб в безкраен кръг. */
const STABLE_AFTER = 30000;

let source = null;
let running = false;
let delay = BASE_DELAY;
let retryTimer = 0;
let pollTimer = 0;
let stableTimer = 0;
let openIds = () => [];

function stopPolling() {
  clearInterval(pollTimer);
  pollTimer = 0;
}

function startPolling() {
  if (pollTimer) return;
  pollTimer = setInterval(() => {
    if (document.visibilityState === 'visible') void resync(openIds());
  }, POLL_EVERY);
}

function closeSource() {
  clearTimeout(stableTimer);
  if (source) {
    source.onopen = null;
    source.onerror = null;
    source.close();
    source = null;
  }
}

async function sessionStillValid() {
  try {
    await api('GET', '/auth/me');
    return true;
  } catch (err) {
    // 401 на /auth/me = сесията е отнета/изтекла → към входа. Мрежова грешка = пак опитваме.
    if (err.status === 401) {
      emit('auth:expired');
      return false;
    }
    return true;
  }
}

function scheduleReconnect() {
  clearTimeout(retryTimer);
  const jitter = Math.random() * 0.3 * delay;
  retryTimer = setTimeout(connect, delay + jitter);
  delay = Math.min(delay * 2, MAX_DELAY);
}

function connect() {
  if (!running) return;
  closeSource();
  setConn('connecting');
  const es = new EventSource('/api/v1/events', { withCredentials: true });
  source = es;
  es.onopen = () => {
    clearTimeout(stableTimer);
    stableTimer = setTimeout(() => {
      delay = BASE_DELAY;
    }, STABLE_AFTER);
    stopPolling();
    setConn('live');
    // Потокът няма буфер: каквото е станало междувременно, идва от REST.
    void resync(openIds());
  };
  for (const type of TYPES) {
    es.addEventListener(type, (ev) => {
      try {
        handleEvent(type, JSON.parse(ev.data));
      } catch {
        /* повредена рамка — следващият resync я компенсира */
      }
    });
  }
  es.onerror = async () => {
    if (source !== es) return;
    closeSource();
    setConn('polling');
    startPolling();
    if (await sessionStillValid()) scheduleReconnect();
  };
}

/** @param {() => string[]} getOpenConversationIds */
export function startRealtime(getOpenConversationIds) {
  openIds = getOpenConversationIds;
  if (running) return;
  running = true;
  delay = BASE_DELAY;
  connect();
}

export function stopRealtime() {
  running = false;
  clearTimeout(retryTimer);
  stopPolling();
  closeSource();
  setConn('off');
}

/** Връщане в таба / появила се мрежа → не чакаме таймера. */
export function nudge() {
  if (!running) return;
  if (!source) {
    clearTimeout(retryTimer);
    delay = BASE_DELAY;
    connect();
  } else {
    void resync(openIds());
  }
}

addEventListener('online', nudge);
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') nudge();
});
