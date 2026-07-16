// Déjà — „Моята памет“: списък на запомнените страници, забравяне
// поединично, export/import на целия индекс. Доверието е функция.

import { applyI18n, t } from '../lib/i18n.js';
import { send } from '../lib/msg.js';
import { el, countLabel } from '../lib/dom.js';

applyI18n();

const countEl = document.getElementById('count');
const listEl = document.getElementById('list');
const exportBtn = document.getElementById('export');
const importBtn = document.getElementById('import');
const importFile = document.getElementById('importFile');
const filterEl = document.getElementById('filter');

let allPages = [];

async function refresh() {
  allPages = await send('deja:memory:list');
  renderStats();
  renderList();
}

// Мини-статистика: топ домейни — къде живее паметта ти (изцяло локално)
function renderStats() {
  const statsEl = document.getElementById('stats');
  statsEl.replaceChildren();
  if (allPages.length < 3) return;
  const byHost = new Map();
  for (const p of allPages) {
    try {
      const host = new URL(p.urlKey).hostname;
      byHost.set(host, (byHost.get(host) || 0) + 1);
    } catch {
      /* невалиден URL — прескачаме */
    }
  }
  const top = [...byHost.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
  const max = top[0]?.[1] || 1;
  for (const [host, count] of top) {
    const row = el('div', 'stat-row');
    const bar = el('div', 'stat-bar');
    bar.style.width = `${Math.round((count / max) * 140)}px`;
    row.append(bar, el('span', 'stat-label', `${host} · ${count}`));
    statsEl.append(row);
  }
}

function renderList() {
  const needle = filterEl.value.trim().toLowerCase();
  const pages = needle
    ? allPages.filter(
        (p) =>
          (p.title || '').toLowerCase().includes(needle) || p.urlKey.toLowerCase().includes(needle),
      )
    : allPages;
  countEl.textContent = countLabel(pages.length, 'pagesInMemoryOne', 'pagesInMemory');
  listEl.replaceChildren();
  if (pages.length === 0) {
    listEl.append(el('p', 'empty', t('memoryEmpty')));
    return;
  }
  pages.forEach((page, i) => {
    const row = el('div', 'page-row');
    row.style.animationDelay = `${Math.min(i, 20) * 30}ms`;
    const info = el('div', 'info');
    const link = el('a', null, page.title || page.urlKey);
    link.href = page.urlKey;
    link.target = '_blank';
    link.rel = 'noopener';
    const sub = el(
      'div',
      'sub',
      `${page.urlKey}${page.time ? ' · ' + t('readOn', [new Date(page.time).toLocaleDateString()]) : ''}`,
    );
    info.append(link, sub);
    const forget = el('button', 'forget', t('memoryForget'));
    forget.addEventListener('click', async () => {
      await send('deja:memory:delete', { urlKey: page.urlKey });
      refresh();
    });
    row.append(info, forget);
    listEl.append(row);
  });
}

exportBtn.addEventListener('click', async () => {
  const dump = await send('deja:memory:export');
  const blob = new Blob([JSON.stringify(dump)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `deja-memory-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
});

filterEl.addEventListener('input', renderList);

importBtn.addEventListener('click', () => importFile.click());

importFile.addEventListener('change', async () => {
  const file = importFile.files?.[0];
  if (!file) return;
  if (!confirm(t('memoryImportConfirm'))) return;
  try {
    const dump = JSON.parse(await file.text());
    await send('deja:memory:import', { dump });
    refresh();
  } catch (err) {
    alert(t('statusError', [String(err?.message || err)]));
  } finally {
    importFile.value = '';
  }
});

refresh();
