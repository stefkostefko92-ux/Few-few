/**
 * Background service worker (Manifest V3, ES module).
 *
 * Responsibilities:
 *  - Seed and migrate persisted settings on install/update.
 *  - Relay messages between the popup/options pages and the active game tab.
 *  - Own desktop notifications (content scripts cannot raise them directly in
 *    a way that survives tab navigation).
 *  - Maintain a lightweight keep-alive alarm so the scheduler's wall-clock
 *    features keep ticking even if the tab is backgrounded.
 */

import { DEFAULT_SETTINGS, mergeSettings, SETTINGS_VERSION } from '../shared/defaults.js';

const STORAGE_KEY = 'tanothBotSettings';
const STATS_KEY = 'tanothBotStats';

/* -------------------------------------------------------------------------- */
/* Install / update                                                            */
/* -------------------------------------------------------------------------- */

chrome.runtime.onInstalled.addListener(async (details) => {
  const existing = (await chrome.storage.local.get(STORAGE_KEY))[STORAGE_KEY];
  const merged = mergeSettings(existing);
  await chrome.storage.local.set({ [STORAGE_KEY]: merged });

  if (details.reason === 'install') {
    await chrome.storage.local.set({ [STATS_KEY]: emptyStats() });
  }

  // Heartbeat used by the scheduler's break / time-window logic.
  chrome.alarms.create('tanoth-heartbeat', { periodInMinutes: 1 });
});

chrome.runtime.onStartup.addListener(() => {
  chrome.alarms.create('tanoth-heartbeat', { periodInMinutes: 1 });
});

function emptyStats() {
  return {
    since: Date.now(),
    adventures: 0,
    duelsWon: 0,
    duelsLost: 0,
    dungeonRuns: 0,
    caveFloors: 0,
    workShifts: 0,
    goldEarned: 0,
    xpEarned: 0,
    itemsSold: 0,
    runesUpgraded: 0,
    levelUps: 0,
    errors: 0
  };
}

/* -------------------------------------------------------------------------- */
/* Heartbeat -> nudge the active game tab so its scheduler re-evaluates        */
/* -------------------------------------------------------------------------- */

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name !== 'tanoth-heartbeat') return;
  const tabs = await chrome.tabs.query({ url: '*://*.tanoth.gameforge.com/*' });
  for (const tab of tabs) {
    chrome.tabs.sendMessage(tab.id, { type: 'HEARTBEAT' }).catch(() => {});
  }
});

/* -------------------------------------------------------------------------- */
/* Message routing                                                             */
/* -------------------------------------------------------------------------- */

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  switch (msg?.type) {
    case 'GET_SETTINGS':
      chrome.storage.local.get(STORAGE_KEY).then((r) =>
        sendResponse(mergeSettings(r[STORAGE_KEY]))
      );
      return true;

    case 'SAVE_SETTINGS':
      chrome.storage.local.set({ [STORAGE_KEY]: mergeSettings(msg.settings) })
        .then(() => {
          broadcastToGameTabs({ type: 'SETTINGS_UPDATED', settings: mergeSettings(msg.settings) });
          sendResponse({ ok: true });
        });
      return true;

    case 'RESET_SETTINGS':
      chrome.storage.local.set({ [STORAGE_KEY]: structuredClone(DEFAULT_SETTINGS) })
        .then(() => {
          broadcastToGameTabs({ type: 'SETTINGS_UPDATED', settings: DEFAULT_SETTINGS });
          sendResponse({ ok: true, settings: DEFAULT_SETTINGS });
        });
      return true;

    case 'GET_STATS':
      chrome.storage.local.get(STATS_KEY).then((r) =>
        sendResponse(r[STATS_KEY] || emptyStats())
      );
      return true;

    case 'RESET_STATS':
      chrome.storage.local.set({ [STATS_KEY]: emptyStats() })
        .then(() => sendResponse({ ok: true }));
      return true;

    case 'STATS_DELTA':
      // Content script reports incremental stat changes; we accumulate them.
      applyStatsDelta(msg.delta).then((stats) => sendResponse(stats));
      return true;

    case 'NOTIFY':
      raiseNotification(msg.title, msg.message);
      sendResponse({ ok: true });
      return false;

    case 'OPEN_OPTIONS':
      chrome.runtime.openOptionsPage();
      sendResponse({ ok: true });
      return false;

    case 'CONTROL':
      // Forward start/stop/pause commands from the popup to the active tab.
      forwardToActiveGameTab(msg).then((r) => sendResponse(r));
      return true;

    case 'GET_STATUS':
      forwardToActiveGameTab({ type: 'GET_STATUS' }).then((r) => sendResponse(r));
      return true;

    default:
      return false;
  }
});

async function applyStatsDelta(delta) {
  const cur = (await chrome.storage.local.get(STATS_KEY))[STATS_KEY] || emptyStats();
  for (const [k, v] of Object.entries(delta || {})) {
    if (typeof v === 'number') cur[k] = (cur[k] || 0) + v;
  }
  await chrome.storage.local.set({ [STATS_KEY]: cur });
  return cur;
}

async function broadcastToGameTabs(message) {
  const tabs = await chrome.tabs.query({ url: '*://*.tanoth.gameforge.com/*' });
  for (const tab of tabs) {
    chrome.tabs.sendMessage(tab.id, message).catch(() => {});
  }
}

async function forwardToActiveGameTab(message) {
  let [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab || !/tanoth\.gameforge\.com/.test(tab.url || '')) {
    const game = await chrome.tabs.query({ url: '*://*.tanoth.gameforge.com/*' });
    tab = game[0];
  }
  if (!tab) return { ok: false, error: 'NO_GAME_TAB' };
  try {
    return await chrome.tabs.sendMessage(tab.id, message);
  } catch (e) {
    return { ok: false, error: 'TAB_UNREACHABLE' };
  }
}

function raiseNotification(title, message) {
  chrome.notifications.create({
    type: 'basic',
    iconUrl: chrome.runtime.getURL('icons/icon128.png'),
    title: title || chrome.i18n.getMessage('extName'),
    message: message || ''
  });
}

console.info(`[TanothBot] service worker ready (settings v${SETTINGS_VERSION})`);
