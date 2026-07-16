// Déjà — popup: статус, пауза, изчистване, пътища към паметта и настройките.

import { getSettings, patchSettings } from '../lib/settings.js';
import { applyI18n, t } from '../lib/i18n.js';
import { countLabel } from '../lib/dom.js';

applyI18n();

const stats = document.getElementById('stats');
const openBtn = document.getElementById('open');
const pausedBox = document.getElementById('paused');
const clearBtn = document.getElementById('clear');
const memoryLink = document.getElementById('memory');
const optionsLink = document.getElementById('options');

async function refresh() {
  try {
    const res = await chrome.runtime.sendMessage({ type: 'deja:stats' });
    stats.textContent = res?.ok
      ? countLabel(res.result.pages, 'popupPagesOne', 'popupPages')
      : t('popupSleeping');
  } catch {
    stats.textContent = t('popupWaking');
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
  if (!confirm(t('popupClearConfirm'))) return;
  await chrome.runtime.sendMessage({ type: 'deja:clear' });
  refresh();
});

memoryLink.addEventListener('click', (event) => {
  event.preventDefault();
  chrome.tabs.create({ url: chrome.runtime.getURL('memory.html') });
});

optionsLink.addEventListener('click', (event) => {
  event.preventDefault();
  chrome.runtime.openOptionsPage();
});

refresh();
