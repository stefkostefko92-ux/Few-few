// Déjà — popup: статус, пауза, изчистване, път към настройките.

import { getSettings, patchSettings } from '../lib/settings.js';
import { applyI18n, t } from '../lib/i18n.js';

applyI18n();

const stats = document.getElementById('stats');
const openBtn = document.getElementById('open');
const pausedBox = document.getElementById('paused');
const clearBtn = document.getElementById('clear');
const optionsLink = document.getElementById('options');

async function refresh() {
  try {
    const res = await chrome.runtime.sendMessage({ type: 'deja:stats' });
    stats.textContent = res?.ok
      ? res.pages === 1
        ? t('popupPagesOne')
        : t('popupPages', [String(res.pages)])
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

optionsLink.addEventListener('click', (event) => {
  event.preventDefault();
  chrome.runtime.openOptionsPage();
});

refresh();
