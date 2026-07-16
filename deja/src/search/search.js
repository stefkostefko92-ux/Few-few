// Déjà — страница за търсене. Праща заявката на service worker-а,
// който я embed-ва локално и подрежда парчетата по косинусова близост.

import { applyI18n, t } from '../lib/i18n.js';
import { send } from '../lib/msg.js';
import { el, countLabel } from '../lib/dom.js';

applyI18n();

const form = document.getElementById('form');
const input = document.getElementById('query');
const button = document.getElementById('go');
const status = document.getElementById('status');
const resultsEl = document.getElementById('results');
const filtersEl = document.getElementById('filters');

const DAY_MS = 24 * 60 * 60 * 1000;
const FILTERS = [
  { key: 'filterAll', days: 0 },
  { key: 'filterWeek', days: 7 },
  { key: 'filterMonth', days: 31 },
  { key: 'filterYear', days: 366 },
];
let activeFilterDays = 0;

// „сила на спомена“: ярък ≥0.5, мъгляв ≥0.3, иначе далечен
function recallKey(score) {
  if (score >= 0.5) return 'recallVivid';
  if (score >= 0.3) return 'recallHazy';
  return 'recallFaint';
}

// Скок до точния абзац: text fragment маркира цитата в страницата
function deepLink(result) {
  return result.quote ? result.url + '#:~:text=' + encodeURIComponent(result.quote) : result.url;
}

async function loadRelated(card, urlKey) {
  const holder = card.querySelector('.related');
  holder.textContent = '…';
  try {
    const related = await send('deja:related', { urlKey });
    holder.replaceChildren();
    if (!related.length) {
      holder.append(el('span', 'related-none', t('relatedNone')));
      return;
    }
    for (const r of related) {
      const link = el('a', 'related-item', r.title);
      link.href = r.url;
      link.target = '_blank';
      link.rel = 'noopener';
      holder.append(link);
    }
  } catch {
    holder.textContent = '';
  }
}

function render(results) {
  resultsEl.replaceChildren();
  results.forEach((r, i) => {
    const card = el('article', 'result');
    // спомените изплуват един по един; силата им личи по акцента вляво
    card.style.setProperty('--recall', String(Math.min(Math.max(r.score, 0), 1)));
    card.style.animationDelay = `${i * 60}ms`;
    const link = el('a', null, r.title);
    link.href = deepLink(r);
    link.target = '_blank';
    link.rel = 'noopener';
    card.append(link, el('div', 'url', r.url), el('p', 'snippet', '…' + r.snippet + '…'));

    const meta = el('div', 'meta');
    const parts = [t(recallKey(r.score)), t('similarity', [String(r.score)])];
    if (r.time) parts.push(t('readOn', [new Date(r.time).toLocaleDateString()]));
    meta.append(document.createTextNode(parts.join(' · ') + ' · '));
    const relatedLink = el('a', 'related-toggle', t('relatedLink'));
    relatedLink.href = '#';
    relatedLink.addEventListener('click', (event) => {
      event.preventDefault();
      loadRelated(card, r.url);
    });
    meta.append(relatedLink);
    card.append(meta, el('div', 'related'));
    resultsEl.append(card);
  });
}

function renderFilters() {
  filtersEl.replaceChildren();
  for (const f of FILTERS) {
    const chip = el('button', 'chip' + (activeFilterDays === f.days ? ' active' : ''), t(f.key));
    chip.type = 'button';
    chip.addEventListener('click', () => {
      activeFilterDays = f.days;
      renderFilters();
      if (input.value.trim()) doSearch(input.value.trim());
    });
    filtersEl.append(chip);
  }
}

async function refreshStats() {
  try {
    const { pages } = await send('deja:stats');
    status.textContent = countLabel(pages, 'pagesInMemoryOne', 'pagesInMemory');
  } catch {
    /* service worker-ът се събужда — не е фатално */
  }
}

async function doSearch(query) {
  button.disabled = true;
  form.classList.add('searching'); // паметта „диша“, докато рови
  status.textContent = t('statusSearching');
  try {
    const minTime = activeFilterDays ? Date.now() - activeFilterDays * DAY_MS : 0;
    const results = await send('deja:search', { query, minTime });
    if (results.length === 0) {
      status.textContent = t('statusEmpty');
      resultsEl.replaceChildren();
    } else {
      status.textContent =
        results.length === 1 ? t('statusResultsOne') : t('statusResults', [String(results.length)]);
      render(results);
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

renderFilters();
refreshStats();

// omnibox: „dj <заявка>“ пристига като ?q= — пускаме търсенето веднага
const initialQuery = new URLSearchParams(location.search).get('q');
if (initialQuery) {
  input.value = initialQuery;
  doSearch(initialQuery);
}
