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

// „сила на спомена“: ярък ≥0.5, мъгляв ≥0.3, иначе далечен
function recallKey(score) {
  if (score >= 0.5) return 'recallVivid';
  if (score >= 0.3) return 'recallHazy';
  return 'recallFaint';
}

function render(results) {
  resultsEl.replaceChildren();
  results.forEach((r, i) => {
    const card = el('article', 'result');
    // спомените изплуват един по един; силата им личи по акцента вляво
    card.style.setProperty('--recall', String(Math.min(Math.max(r.score, 0), 1)));
    card.style.animationDelay = `${i * 60}ms`;
    const link = el('a', null, r.title);
    link.href = r.url;
    link.target = '_blank';
    link.rel = 'noopener';
    card.append(link, el('div', 'url', r.url), el('p', 'snippet', '…' + r.snippet + '…'));
    const meta = [t(recallKey(r.score)), t('similarity', [String(r.score)])];
    if (r.time) meta.push(t('readOn', [new Date(r.time).toLocaleDateString()]));
    card.append(el('div', 'meta', meta.join(' · ')));
    resultsEl.append(card);
  });
}

async function refreshStats() {
  try {
    const res = await chrome.runtime.sendMessage({ type: 'deja:stats' });
    if (res?.ok) {
      status.textContent =
        res.pages === 1 ? t('pagesInMemoryOne') : t('pagesInMemory', [String(res.pages)]);
    }
  } catch {
    /* service worker-ът се събужда — не е фатално */
  }
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  const query = input.value.trim();
  if (!query) return;

  button.disabled = true;
  form.classList.add('searching'); // паметта „диша“, докато рови
  status.textContent = t('statusSearching');
  try {
    const res = await chrome.runtime.sendMessage({ type: 'deja:search', query });
    if (!res?.ok) throw new Error(res?.error || t('errNoResponse'));
    if (res.results.length === 0) {
      status.textContent = t('statusEmpty');
      resultsEl.replaceChildren();
    } else {
      status.textContent =
        res.results.length === 1
          ? t('statusResultsOne')
          : t('statusResults', [String(res.results.length)]);
      render(res.results);
    }
  } catch (err) {
    status.textContent = t('statusError', [String(err?.message || err)]);
  } finally {
    button.disabled = false;
    form.classList.remove('searching');
  }
});

refreshStats();
