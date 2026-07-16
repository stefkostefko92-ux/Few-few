// Déjà — „Моята памет“: списък на запомнените страници, забравяне
// поединично, export/import на целия индекс. Доверието е функция.

import { applyI18n, t } from '../lib/i18n.js';

applyI18n();

const countEl = document.getElementById('count');
const listEl = document.getElementById('list');
const exportBtn = document.getElementById('export');
const importBtn = document.getElementById('import');
const importFile = document.getElementById('importFile');

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}

async function send(type, payload = {}) {
  const res = await chrome.runtime.sendMessage({ type, ...payload });
  if (!res?.ok) throw new Error(res?.error || t('errNoResponse'));
  return res.result;
}

async function refresh() {
  const pages = await send('deja:memory:list');
  countEl.textContent =
    pages.length === 1 ? t('pagesInMemoryOne') : t('pagesInMemory', [String(pages.length)]);
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
