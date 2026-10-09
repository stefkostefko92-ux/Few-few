// Плаващи прозорци за чат долу вдясно (само на широк екран): до 3, минимизират се до лента със
// заглавие и брояч, възстановяват се. Списъкът (само id-та и „минимизиран“) се пази в
// sessionStorage — прозорците оцеляват при презареждане и навигация; съдържанието се зарежда пак.

import { clear, h, $ } from '../dom.js';
import { t } from '../i18n.js';
import { listen } from '../store.js';
import { ws, titleOf } from './model.js';
import { unreadBadge } from './sidebar.js';
import { mountThread } from './thread.js';
import { loadConversation } from './sync.js';

const KEY = 'chatchat.windows';
const MAX = 3;
export const wide = () => window.matchMedia('(min-width: 1100px)').matches;

/** @type {Array<{id: string, min: boolean, thread: ReturnType<typeof mountThread> | null, body: HTMLElement}>} */
let wins = [];

const save = () => {
  try {
    sessionStorage.setItem(KEY, JSON.stringify(wins.map((w) => ({ id: w.id, min: w.min }))));
  } catch {
    /* незадължително */
  }
};

export const openWindowIds = () => wins.filter((w) => !w.min).map((w) => w.id);
export const hasWindow = (id) => wins.some((w) => w.id === id);

function paint() {
  const dock = $('#dock');
  for (const w of wins) {
    const conv = ws.convs.get(w.id);
    const title = conv ? titleOf(conv) : '…';
    const head = h(
      'header',
      { class: 'win-head' },
      h(
        'button',
        {
          class: 'win-title',
          type: 'button',
          'aria-expanded': String(!w.min),
          'aria-controls': `win-body-${w.id}`,
          onclick: () => toggle(w.id),
        },
        h('span', { class: 'conv-title-text' }, title),
        unreadBadge(conv?.unread),
      ),
      h(
        'button',
        { class: 'btn btn-quiet btn-sm', type: 'button', onclick: () => toggle(w.id) },
        w.min ? t('win.restore') : t('win.minimize'),
      ),
      h(
        'button',
        {
          class: 'btn btn-quiet btn-sm',
          type: 'button',
          'aria-label': t('win.closeNamed', { name: title }),
          onclick: () => closeWindow(w.id),
        },
        '×',
      ),
    );
    w.body.id = `win-body-${w.id}`;
    w.body.hidden = w.min;
    // Секцията е постоянна: сменя се само лентата, за да не губи полето фокус.
    if (!w.section) {
      w.section = h('section', { class: 'win' }, head, w.body);
    } else {
      w.section.firstElementChild.replaceWith(head);
    }
    w.section.classList.toggle('is-min', w.min);
    w.section.setAttribute('aria-label', title);
    if (w.section.parentElement !== dock) dock.append(w.section);
  }
  for (const el of [...dock.children]) {
    if (!wins.some((w) => w.section === el)) el.remove();
  }
}

function ensureThread(w) {
  if (w.min || w.thread) return;
  w.thread = mountThread(w.body, w.id, { scope: `win-${w.id}`, compact: true });
}

function toggle(id) {
  const w = wins.find((x) => x.id === id);
  if (!w) return;
  w.min = !w.min;
  if (w.min && w.thread) {
    w.thread.destroy();
    w.thread = null;
  }
  ensureThread(w);
  save();
  paint();
  if (!w.min) w.thread?.focusComposer();
}

export function closeWindow(id) {
  const w = wins.find((x) => x.id === id);
  w?.thread?.destroy();
  wins = wins.filter((x) => x.id !== id);
  save();
  paint();
}

export async function openWindow(id) {
  const existing = wins.find((w) => w.id === id);
  if (existing) {
    if (existing.min) toggle(id);
    return;
  }
  if (wins.length >= MAX) closeWindow(wins[0].id);
  if (!ws.convs.has(id)) await loadConversation(id);
  const w = { id, min: false, thread: null, body: h('div', { class: 'win-body' }) };
  wins.push(w);
  ensureThread(w);
  save();
  paint();
  w.thread?.focusComposer();
}

export function restoreWindows() {
  let saved = [];
  try {
    saved = JSON.parse(sessionStorage.getItem(KEY) ?? '[]');
  } catch {
    saved = [];
  }
  if (!wide() || !Array.isArray(saved)) return;
  for (const s of saved.slice(0, MAX)) {
    if (typeof s?.id !== 'string' || !ws.convs.has(s.id)) continue;
    const w = {
      id: s.id,
      min: s.min === true,
      thread: null,
      body: h('div', { class: 'win-body' }),
    };
    wins.push(w);
    ensureThread(w);
  }
  paint();
}

export function closeAllWindows() {
  for (const w of wins) w.thread?.destroy();
  wins = [];
  clear($('#dock'));
}

// Броячът и заглавието в лентата следват модела.
listen('ws:convs', () => wins.length && paint());
listen('ws:removed', (id) => hasWindow(id) && closeWindow(id));
listen('lang', () => paint());
