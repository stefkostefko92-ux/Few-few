// Déjà — popup: статус, пауза, забравяне на текущата страница, изчистване,
// страничен панел, пътища към паметта и настройките.

import { getSettings, patchSettings } from '../lib/settings.js';
import { applyI18n, t } from '../lib/i18n.js';
import { countLabel } from '../lib/dom.js';
import { send } from '../lib/msg.js';

applyI18n();

const stats = document.getElementById('stats');
const openBtn = document.getElementById('open');
const panelBtn = document.getElementById('panel');
const pausedBox = document.getElementById('paused');
const forgetBtn = document.getElementById('forget');
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

// activeTab: правото се дава само за таба, върху който потребителят е кликнал
// иконата — достатъчно за URL-а му, без широкото "tabs"
async function activeTabUrl() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab?.url && /^https?:\/\//.test(tab.url) ? tab.url : null;
}

openBtn.addEventListener('click', () => {
  chrome.tabs.create({ url: chrome.runtime.getURL('search.html') });
});

panelBtn.addEventListener('click', async () => {
  if (!chrome.sidePanel) return;
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab?.windowId != null) {
    await chrome.sidePanel.open({ windowId: tab.windowId }).catch(() => {});
    window.close();
  }
});
if (!chrome.sidePanel) panelBtn.hidden = true; // Firefox: sidebar_action се отваря от менюто

pausedBox.addEventListener('change', () => {
  patchSettings({ paused: pausedBox.checked });
});

forgetBtn.addEventListener('click', async () => {
  const url = await activeTabUrl();
  if (!url) return;
  await send('deja:forget-url', { url });
  forgetBtn.textContent = t('popupForgotten');
  refresh();
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
