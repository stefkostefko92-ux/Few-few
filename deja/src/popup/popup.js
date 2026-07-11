// Déjà — popup: статус, пауза и изчистване на паметта.

import { getSettings, patchSettings } from '../lib/settings.js';

const stats = document.getElementById('stats');
const openBtn = document.getElementById('open');
const pausedBox = document.getElementById('paused');
const clearBtn = document.getElementById('clear');

async function refresh() {
  try {
    const res = await chrome.runtime.sendMessage({ type: 'deja:stats' });
    stats.textContent = res?.ok ? `${res.pages} страници в паметта` : 'паметта спи';
  } catch {
    stats.textContent = 'паметта се събужда…';
  }
  const settings = await getSettings();
  pausedBox.checked = settings.paused;
}

openBtn.addEventListener('click', () => {
  chrome.tabs.create({ url: chrome.runtime.getURL('search.html') });
});

pausedBox.addEventListener('change', () => {
  patchSettings({ paused: pausedBox.checked });
});

clearBtn.addEventListener('click', async () => {
  if (!confirm('Изтриване на всичко запомнено? Няма връщане.')) return;
  await chrome.runtime.sendMessage({ type: 'deja:clear' });
  refresh();
});

refresh();
