// Déjà — страница за търсене. Праща заявката на service worker-а,
// който я embed-ва локално и подрежда парчетата по косинусова близост.

import { applyI18n, t } from '../lib/i18n.js';

applyI18n();

const form = document.getElementById('form');
const input = document.getElementById('query');
const button = document.getElementById('go');
const status = document.getElementById('status');
const resultsEl = document.getElementById('results');

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}

function render(results) {
  resultsEl.replaceChildren();
  for (const r of results) {
    const card = el('article', 'result');
    const link = el('a', null, r.title);
    link.href = r.url;
    link.target = '_blank';
    link.rel = 'noopener';
    card.append(link, el('div', 'url', r.url), el('p', 'snippet', '…' + r.snippet + '…'));
    const meta = [t('similarity', [String(r.score)])];
    if (r.time) meta.push(t('readOn', [new Date(r.time).toLocaleDateString()]));
    card.append(el('div', 'meta', meta.join(' · ')));
    resultsEl.append(card);
  }
}

async function refreshStats() {
  try {
    const res = await chrome.runtime.sendMessage({ type: 'deja:stats' });
    if (res?.ok) status.textContent = t('pagesInMemory', [String(res.pages)]);
  } catch {
    /* service worker-ът се събужда — не е фатално */
  }
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  const query = input.value.trim();
  if (!query) return;

  button.disabled = true;
  status.textContent = t('statusSearching');
  try {
    const res = await chrome.runtime.sendMessage({ type: 'deja:search', query });
    if (!res?.ok) throw new Error(res?.error || 'no response');
    if (res.results.length === 0) {
      status.textContent = t('statusEmpty');
      resultsEl.replaceChildren();
    } else {
      status.textContent = t('statusResults', [String(res.results.length)]);
      render(res.results);
    }
  } catch (err) {
    status.textContent = t('statusError', [String(err?.message || err)]);
  } finally {
    button.disabled = false;
  }
});

refreshStats();
