// Déjà — страничен панел: търсене без да напускаш страницата + „какво съм
// чел по темата на ТАЗИ страница“ (следи активния таб през storage.session,
// докладван от content script-а — без „tabs“ право) + последни спомени.

import { applyI18n, t } from '../lib/i18n.js';
import { send } from '../lib/msg.js';
import { el, countLabel } from '../lib/dom.js';

applyI18n();

const form = document.getElementById('form');
const input = document.getElementById('query');
const button = document.getElementById('go');
const status = document.getElementById('status');
const resultsEl = document.getElementById('results');
const contextEl = document.getElementById('context');
const contextNote = document.getElementById('contextNote');
const recentEl = document.getElementById('recent');

function recallKey(score) {
  if (score >= 0.5) return 'recallVivid';
  if (score >= 0.3) return 'recallHazy';
  return 'recallFaint';
}

function deepLink(r) {
  return r.quote ? r.url + '#:~:text=' + encodeURIComponent(r.quote) : r.url;
}

function miniRow(r) {
  const row = el('div', 'mini');
  const link = el('a', null, r.title || r.url);
  link.href = deepLink(r);
  link.target = '_blank';
  link.rel = 'noopener';
  link.title = r.url;
  row.append(link);
  if (r.time) row.append(el('span', 'when', new Date(r.time).toLocaleDateString()));
  return row;
}

function card(r, i) {
  const node = el('article', 'result');
  node.style.setProperty('--recall', String(Math.min(Math.max(r.score, 0), 1)));
  node.style.animationDelay = `${i * 50}ms`;
  const link = el('a', null, r.title);
  link.href = deepLink(r);
  link.target = '_blank';
  link.rel = 'noopener';
  node.append(link, el('p', 'snippet', '…' + r.snippet + '…'));
  const meta = [t(recallKey(r.score)), t('similarity', [String(r.score)])];
  node.append(el('div', 'meta', meta.join(' · ')));
  return node;
}

async function doSearch(query) {
  button.disabled = true;
  form.classList.add('searching');
  status.textContent = t('statusSearching');
  try {
    const results = await send('deja:search', { query });
    resultsEl.replaceChildren();
    if (!results.length) {
      status.textContent = t('statusEmpty');
    } else {
      status.textContent = countLabel(results.length, 'statusResultsOne', 'statusResults');
      results.forEach((r, i) => resultsEl.append(card(r, i)));
    }
  } catch (err) {
    status.textContent = t('statusError', [String(err?.message || err)]);
  } finally {
    button.disabled = false;
    form.classList.remove('searching');
  }
}

form.addEventListener('submit', (event) => {
  event.preventDefault();
  const query = input.value.trim();
  if (query) doSearch(query);
});

let lastContextUrl = null;

async function refreshContext() {
  const { activeTab } = await chrome.storage.session.get('activeTab');
  if (!activeTab?.url) {
    contextNote.textContent = t('panelNoPage');
    contextEl.replaceChildren();
    return;
  }
  if (activeTab.url === lastContextUrl) return;
  lastContextUrl = activeTab.url;
  contextNote.textContent = activeTab.title || activeTab.url;
  contextEl.replaceChildren(el('p', 'empty', '…'));
  try {
    const { items } = await send('deja:context', { url: activeTab.url, title: activeTab.title });
    contextEl.replaceChildren();
    if (!items.length) {
      contextEl.append(el('p', 'empty', t('relatedNone')));
      return;
    }
    for (const r of items) contextEl.append(miniRow(r));
  } catch {
    contextEl.replaceChildren();
  }
}

async function refreshRecent() {
  try {
    const items = await send('deja:recent', { limit: 8 });
    recentEl.replaceChildren();
    if (!items.length) {
      recentEl.append(el('p', 'empty', t('memoryEmpty')));
      return;
    }
    for (const r of items) recentEl.append(miniRow(r));
  } catch {
    recentEl.replaceChildren();
  }
}

// активният таб се сменя → панелът се обновява сам
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'session' && changes.activeTab) refreshContext();
});

refreshContext();
refreshRecent();
