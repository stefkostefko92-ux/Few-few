// Déjà — страница за търсене. Праща заявката на service worker-а,
// който я embed-ва локално и подрежда парчетата по косинусова близост.

import { applyI18n, t } from '../lib/i18n.js';
import { send } from '../lib/msg.js';
import { el, countLabel } from '../lib/dom.js';
import { initAmbient } from '../lib/ambient.js';
import { icon } from '../lib/icons.js';
import { mountBookmarkCard } from '../lib/bookmarks-ui.js';
import { recordWin, mountRateNudge } from '../lib/rate.js';

applyI18n();
const ambient = initAmbient();

const form = document.getElementById('form');
const input = document.getElementById('query');
const button = document.getElementById('go');
const status = document.getElementById('status');
const resultsEl = document.getElementById('results');
const filtersEl = document.getElementById('filters');
const bmCtaEl = document.getElementById('bmCta');

// под този брой спомени търсачката предлага отметките — иначе е празна седмици
const YOUNG_MEMORY = 30;

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

const escapeRegExp = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Откроява думите от заявката в снипета (безопасно: text възли + <mark>)
function highlightInto(container, text, query) {
  const words = [
    ...new Set(
      query
        .toLowerCase()
        .split(/\s+/)
        .filter((w) => w.length >= 3),
    ),
  ];
  if (!words.length) {
    container.textContent = text;
    return;
  }
  // само от началото на дума (иначе „pot“ светва в „spot“) и до края ѝ — „домат“
  // откроява „доматите“ цяла; \b не познава кирилица, затова \p{L} с флаг u
  const re = new RegExp(
    '(?<![\\p{L}\\p{N}])(?:' + words.map(escapeRegExp).join('|') + ')[\\p{L}\\p{N}]*',
    'giu',
  );
  let last = 0;
  for (const m of text.matchAll(re)) {
    container.append(document.createTextNode(text.slice(last, m.index)));
    container.append(el('mark', null, m[0]));
    last = m.index + m[0].length;
  }
  container.append(document.createTextNode(text.slice(last)));
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

function render(results, query) {
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
    trackWin(link);
    card.append(link, el('div', 'url', r.url));
    if (r.kind === 'bookmark') {
      // отметка без прочит: няма откъс — показваме откъде е (папката)
      card.classList.add('is-bookmark');
      card.append(bookmarkTag(r.folder));
    } else {
      const snippet = el('p', 'snippet');
      highlightInto(snippet, '…' + r.snippet + '…', query);
      card.append(snippet);
    }

    const meta = el('div', 'meta');
    const parts = [t(recallKey(r.score)), t('similarity', [String(r.score)])];
    if (r.time) {
      const date = new Date(r.time).toLocaleDateString();
      parts.push(t(r.kind === 'bookmark' ? 'bmAddedOn' : 'readOn', [date]));
    }
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

// клик (и среден бутон) на намерен спомен = търсенето свърши работа
function trackWin(link) {
  link.addEventListener('click', recordWin);
  link.addEventListener('auxclick', (event) => event.button === 1 && recordWin());
}

function bookmarkTag(folder) {
  const tag = el('div', 'bm-tag');
  tag.append(icon('bookmark'), document.createTextNode(t('bmBadge')));
  if (folder) tag.append(el('span', 'bm-folder', folder));
  return tag;
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
    ambient.setMemories(pages);
    await maybeOfferBookmarks(pages);
  } catch {
    /* service worker-ът се събужда — не е фатално */
  }
}

async function doSearch(query) {
  button.disabled = true;
  form.classList.add('searching'); // паметта „диша“, докато рови
  ambient.focus(true); // мрежата се свива — паметта търси
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
      render(results, query);
      ambient.surface(results.length); // спомените изплуват
    }
  } catch (err) {
    status.textContent = t('statusError', [String(err?.message || err)]);
  } finally {
    button.disabled = false;
    form.classList.remove('searching');
    ambient.focus(false);
  }
}

form.addEventListener('submit', (event) => {
  event.preventDefault();
  const query = input.value.trim();
  if (query) doSearch(query);
});

// Млада памет + изключени отметки → покана; веднъж показана, картата остава
// до края на сесията (за да видиш прогреса и „Опитай: …“ след включването)
async function maybeOfferBookmarks(pages) {
  if (bmCtaEl.dataset.mounted) return;
  const { settings = {} } = await chrome.storage.local.get('settings');
  if (settings.bookmarks || pages >= YOUNG_MEMORY || !chrome.permissions) return;
  bmCtaEl.dataset.mounted = '1';
  bmCtaEl.hidden = false;
  mountBookmarkCard(bmCtaEl, {
    compact: true,
    onProgress(st) {
      if (st?.state === 'running' && st.total) ambient.setMemories(pages + st.done);
      if (st?.state === 'done' && !bmCtaEl.dataset.counted) {
        bmCtaEl.dataset.counted = '1';
        refreshStats();
      }
    },
  });
}

// Празната търсачка не е празна: последните спомени са на един клик
async function showRecent() {
  try {
    const items = await send('deja:recent', { limit: 6 });
    if (!items.length || input.value.trim()) return;
    resultsEl.replaceChildren();
    resultsEl.append(el('h2', 'recent-title', t('recentTitle')));
    for (const r of items) {
      const row = el('div', 'recent-row');
      const link = el('a', null, r.title || r.url);
      link.href = r.url;
      link.target = '_blank';
      link.rel = 'noopener';
      row.append(link);
      if (r.time) row.append(el('span', 'recent-when', new Date(r.time).toLocaleDateString()));
      resultsEl.append(row);
    }
  } catch {
    /* паметта спи — не е фатално */
  }
}

renderFilters();
// една покана наведнъж: първо се решава поканата за отметки (млада памет), чак
// после молбата за отзив — иначе двете се състезават коя ще излезе първа
refreshStats().finally(() =>
  mountRateNudge(document.getElementById('nudge'), { el, icon, t, canShow: () => bmCtaEl.hidden }),
);
showRecent();

// omnibox: „dj <заявка>“ пристига като ?q= — пускаме търсенето веднага
const initialQuery = new URLSearchParams(location.search).get('q');
if (initialQuery) {
  input.value = initialQuery;
  doSearch(initialQuery);
}
