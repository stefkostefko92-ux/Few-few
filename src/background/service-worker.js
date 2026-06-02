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
import {
  PRICE_EUR, BILLING_PERIOD_DAYS, TRIAL_DAYS,
  REVOLUT_PAYMENT_URL, LICENSE_SECRET, LICENSE_PREFIX
} from '../shared/payment.js';

const STORAGE_KEY = 'tanothBotSettings';
const STATS_KEY = 'tanothBotStats';
const LICENSE_KEY = 'tanothBotLicense';   // { key, exp }
const INSTALL_KEY = 'tanothBotInstall';   // { firstRun }

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

  // Record the install time once, to anchor the free trial window.
  const inst = (await chrome.storage.local.get(INSTALL_KEY))[INSTALL_KEY];
  if (!inst || !inst.firstRun) {
    await chrome.storage.local.set({ [INSTALL_KEY]: { firstRun: Date.now() } });
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
    circleNodes: 0,
    attributesRaised: 0,
    goldEarned: 0,
    xpEarned: 0,
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

    case 'GET_LICENSE':
      getLicenseStatus().then(sendResponse);
      return true;

    case 'ACTIVATE_LICENSE':
      activateLicense(msg.key).then(sendResponse);
      return true;

    case 'OPEN_PAYMENT':
      chrome.tabs.create({ url: REVOLUT_PAYMENT_URL });
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

/* -------------------------------------------------------------------------- */
/* Licensing                                                                   */
/* -------------------------------------------------------------------------- */

const PAYMENT_INFO = {
  priceEur: PRICE_EUR,
  periodDays: BILLING_PERIOD_DAYS,
  trialDays: TRIAL_DAYS,
  paymentUrl: REVOLUT_PAYMENT_URL
};

function b64urlToBytes(s) {
  s = s.replace(/-/g, '+').replace(/_/g, '/');
  while (s.length % 4) s += '=';
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
function bytesToB64url(bytes) {
  let bin = '';
  bytes.forEach((b) => { bin += String.fromCharCode(b); });
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function hmac(payloadStr) {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw', enc.encode(LICENSE_SECRET),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(payloadStr));
  return bytesToB64url(new Uint8Array(sig)).slice(0, 24);
}

// Key format: TZ1.<payloadB64url>.<sig>  where payload = {"exp":<epochSec>}
async function verifyKey(key) {
  try {
    if (typeof key !== 'string') return null;
    const parts = key.trim().split('.');
    if (parts.length !== 3 || parts[0] !== LICENSE_PREFIX) return null;
    const [, payloadB64, sig] = parts;
    const expected = await hmac(payloadB64);
    if (sig !== expected) return null;
    const payload = JSON.parse(new TextDecoder().decode(b64urlToBytes(payloadB64)));
    if (!payload || typeof payload.exp !== 'number') return null;
    return payload; // { exp: epochSeconds }
  } catch (_) {
    return null;
  }
}

async function getLicenseStatus() {
  const now = Date.now();
  const inst = (await chrome.storage.local.get(INSTALL_KEY))[INSTALL_KEY] || { firstRun: now };
  const lic = (await chrome.storage.local.get(LICENSE_KEY))[LICENSE_KEY] || null;

  const trialEnds = inst.firstRun + TRIAL_DAYS * 86400000;
  let status = 'expired';
  let expISO = null;
  let entitled = false;

  if (lic && typeof lic.exp === 'number' && lic.exp * 1000 > now) {
    status = 'active';
    entitled = true;
    expISO = new Date(lic.exp * 1000).toISOString();
  } else if (now < trialEnds) {
    status = 'trial';
    entitled = true;
    expISO = new Date(trialEnds).toISOString();
  }

  const msLeft = (status === 'active' ? lic.exp * 1000 : trialEnds) - now;
  const daysLeft = Math.max(0, Math.ceil(msLeft / 86400000));

  return { status, entitled, expISO, daysLeft, payment: PAYMENT_INFO };
}

async function activateLicense(key) {
  const payload = await verifyKey(key);
  if (!payload) {
    return Object.assign({ ok: false, error: 'INVALID_KEY' }, await getLicenseStatus());
  }
  if (payload.exp * 1000 <= Date.now()) {
    return Object.assign({ ok: false, error: 'EXPIRED_KEY' }, await getLicenseStatus());
  }
  await chrome.storage.local.set({ [LICENSE_KEY]: { key: key.trim(), exp: payload.exp } });
  const status = await getLicenseStatus();
  broadcastToGameTabs({ type: 'LICENSE_UPDATED', license: status });
  return Object.assign({ ok: true }, status);
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
