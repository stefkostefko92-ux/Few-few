// Отметките в паметта — общият UI за welcome, търсачката и настройките.
// Правото се иска ТУК (в страница, при клик → жест на потребителя), а
// service worker-ът само учи. Прогресът идва от chrome.storage.local
// (bookmarkSync), затова всяка отворена страница го вижда на живо.

import { t } from './i18n.js';
import { send } from './msg.js';
import { el } from './dom.js';
import { icon } from './icons.js';

const PERM = { permissions: ['bookmarks'] };

// true = правото е дадено и ученето е тръгнало; false = потребителят отказа
export async function enableBookmarks() {
  const granted = await chrome.permissions.request(PERM);
  if (!granted) return false;
  await send('deja:bookmarks:enable');
  return true;
}

export function disableBookmarks() {
  return send('deja:bookmarks:disable');
}

// cb(status | null, enabled) веднага и при всяка промяна
export function watchBookmarks(cb) {
  const read = async () => {
    const { bookmarkSync = null, settings = {} } = await chrome.storage.local.get([
      'bookmarkSync',
      'settings',
    ]);
    cb(bookmarkSync, !!settings.bookmarks);
  };
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && (changes.bookmarkSync || changes.settings)) read();
  });
  read();
}

const nf = (n) => Number(n || 0).toLocaleString();

// Ред за прогрес/резултат — общ за картата и настройките
export function statusLine(status) {
  if (!status) return '';
  if (status.state === 'running') {
    return status.total ? t('bmLearning', [nf(status.done), nf(status.total)]) : t('bmPreparing');
  }
  if (status.state === 'paused') return t('bmPaused');
  if (status.state === 'error') return t('bmError');
  if (status.state === 'done') {
    return status.count === 1 ? t('bmDoneOne') : t('bmDone', [nf(status.count)]);
  }
  return '';
}

// Голямата карта: „Направи отметките си търсими — още сега“.
// opts.onProgress(status) — за да расте мрежата заедно с паметта.
export function mountBookmarkCard(host, { compact = false, onProgress } = {}) {
  host.classList.add('bm', 'lg');
  if (compact) host.classList.add('bm-compact');

  const mark = el('div', 'bm-mark');
  mark.append(icon('bookmark'));
  const body = el('div', 'bm-body');
  const title = el('h3', 'bm-title', t('bmTitle'));
  if (host.id) title.id = `${host.id}-title`; // за aria-labelledby на секцията
  const text = el('p', 'bm-text', t(compact ? 'bmTextShort' : 'bmText'));
  const actions = el('div', 'bm-actions');
  const button = el('button', 'lg-accent bm-go', t('bmButton'));
  button.type = 'button';
  const note = el('span', 'bm-note', t('bmNote'));
  actions.append(button, note);

  const progress = el('div', 'bm-progress');
  progress.setAttribute('role', 'progressbar');
  progress.setAttribute('aria-valuemin', '0');
  progress.setAttribute('aria-valuemax', '100');
  const bar = el('div', 'bm-bar');
  progress.append(bar);
  const line = el('p', 'bm-status');
  line.setAttribute('aria-live', 'polite');
  const tryRow = el('div', 'bm-try');

  body.append(title, text, actions, progress, line, tryRow);
  host.replaceChildren(mark, body);

  button.addEventListener('click', async () => {
    button.disabled = true;
    try {
      const ok = await enableBookmarks();
      if (!ok) line.textContent = t('bmDenied');
    } catch (err) {
      line.textContent = t('statusError', [String(err?.message || err)]);
    } finally {
      button.disabled = false;
    }
  });

  watchBookmarks((status, enabled) => {
    onProgress?.(status);
    const state = enabled ? status?.state || 'running' : 'off';
    host.dataset.state = state;
    actions.hidden = state !== 'off';
    progress.hidden = state !== 'running';
    if (state === 'running') {
      const pct = status?.total ? Math.round((status.done / status.total) * 100) : 4;
      bar.style.width = `${Math.max(pct, 4)}%`;
      progress.setAttribute('aria-valuenow', String(pct));
      title.textContent = t('bmTitleRunning');
    } else if (state === 'done') {
      title.textContent = t('bmTitleDone');
      mark.replaceChildren(icon('check'));
    }
    if (state !== 'off') line.textContent = statusLine(status);

    // „Опитай: …“ — папките на човека са най-добрите първи заявки
    tryRow.replaceChildren();
    if (state === 'done' && status?.folders?.length) {
      tryRow.append(el('span', 'bm-try-label', t('bmTry')));
      for (const folder of status.folders) {
        const chip = el('a', 'chip');
        chip.append(icon('folder'), document.createTextNode(folder));
        chip.href = chrome.runtime.getURL('search.html') + '?q=' + encodeURIComponent(folder);
        tryRow.append(chip);
      }
    }
  });
}
