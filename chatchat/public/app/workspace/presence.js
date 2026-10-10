// Присъствие (FR-18): heartbeat на всеки ~60 s — ONLINE при видим таб, AWAY при скрит.
// Само координация между колеги: НЕ е доказателство за дежурство и не се показва като такова.
// Състоянието се предава с форма И текст, не само с цвят.

import { h } from '../dom.js';
import { fmtStamp } from '../format.js';
import { t } from '../i18n.js';
import { state } from '../store.js';
import { wsApi } from './api.js';
import { ws } from './model.js';

let timer = 0;
let everyMs = 60000;

const GLYPH = { ONLINE: '●', AWAY: '◐', OFFLINE: '○' };

async function beat() {
  const status = document.visibilityState === 'visible' ? 'ONLINE' : 'AWAY';
  try {
    const data = await wsApi.heartbeat(status);
    if (typeof data.heartbeatEveryMs === 'number') everyMs = Math.max(15000, data.heartbeatEveryMs);
    if (typeof data.showLastSeen === 'boolean') state.showLastSeen = data.showLastSeen;
  } catch {
    /* връзката е паднала — следващият удар е след минута */
  }
}

export function startPresence() {
  stopPresence();
  void beat();
  timer = setInterval(() => void beat(), everyMs);
}

export function stopPresence() {
  clearInterval(timer);
  timer = 0;
}

document.addEventListener('visibilitychange', () => {
  if (timer) void beat();
});

export function presenceOf(userId) {
  // Самият човек е на линия, докато чете това (не се пита сървърът за себе си).
  if (userId === state.user?.id) return 'ONLINE';
  return ws.presence.get(userId)?.status ?? 'OFFLINE';
}

/** Точка с форма + скрит текст (екранният четец чете „На линия“, не „зелено“). */
export function presenceDot(userId) {
  const status = presenceOf(userId);
  return h(
    'span',
    { class: `pres pres-${status.toLowerCase()}`, 'data-user': userId },
    h('span', { 'aria-hidden': 'true' }, GLYPH[status] ?? GLYPH.OFFLINE),
    h('span', { class: 'sr-only' }, t(`pres.${status}`)),
  );
}

/** „На линия“ / „Отсъства“ / „Офлайн · последно видян 12:30“ (ако човекът позволява). */
export function presenceText(userId) {
  const p = ws.presence.get(userId);
  const status = p?.status ?? 'OFFLINE';
  if (status === 'OFFLINE' && p?.lastSeenAt) {
    return t('pres.lastSeen', { time: fmtStamp(p.lastSeenAt) });
  }
  return t(`pres.${status}`);
}
