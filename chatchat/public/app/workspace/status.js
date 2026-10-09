// Малките индикатори в горната лента и в лентата: брояч на известия и състояние на връзката
// (форма + текст, не само цвят).

import { $, clear, h } from '../dom.js';
import { t } from '../i18n.js';
import { ws } from './model.js';

export function renderBadges() {
  const n = ws.unreadNotifications;
  for (const id of ['#inbox-badge', '#bell-badge']) {
    const el = $(id);
    el.textContent = n > 99 ? '99+' : String(n);
    el.hidden = n === 0;
    el.setAttribute('aria-label', t('inbox.unread', { count: n }));
  }
}

const CONN = {
  live: ['●', 'conn.live'],
  connecting: ['◌', 'conn.connecting'],
  polling: ['○', 'conn.polling'],
  off: ['', ''],
};

export function renderConn() {
  const [glyph, key] = CONN[ws.conn] ?? CONN.off;
  const el = $('#conn-status');
  clear(el);
  if (key) el.append(h('span', { 'aria-hidden': 'true' }, `${glyph} `), t(key));
  el.dataset.state = ws.conn;
}
