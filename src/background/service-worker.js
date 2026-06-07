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
  PRICE_EUR, LIFETIME_PRICE_EUR, BILLING_PERIOD_DAYS, TRIAL_DAYS, LIFETIME_THRESHOLD_DAYS,
  REVOLUT_PAYMENT_URL, LICENSE_SECRET, LICENSE_PREFIX, LICENSE_SERVER_URL
} from '../shared/payment.js';
import { buildExternalNotifications } from '../shared/notify.js';

const STORAGE_KEY = 'tanothBotSettings';
const STATS_KEY = 'tanothBotStats';
const LICENSE_KEY = 'tanothBotLicense';   // { key, exp, device }
const INSTALL_KEY = 'tanothBotInstall';   // { firstRun }
const DEVICE_KEY = 'tanothBotDevice';     // stable per-install device id
const PROFILES_KEY = 'tanothBotProfiles'; // { name: settings }

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
    dungeonRuns: 0,
    caveRuns: 0,
    dragonRuns: 0,
    encounters: 0,
    workShifts: 0,
    duelsWon: 0,
    duelsLost: 0,
    itemsSold: 0,
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
  // All handlers go through one async dispatcher so the message port stays open
  // (worker kept alive) until a response is sent, and every path responds even
  // on error — no hung ports / dropped webhooks.
  handleMessage(msg, sender)
    .then((r) => sendResponse(r))
    .catch((e) => sendResponse({ ok: false, error: String((e && e.message) || e) }));
  return true;
});

async function handleMessage(msg, sender) {
  switch (msg?.type) {
    case 'GET_SETTINGS':
      return mergeSettings((await chrome.storage.local.get(STORAGE_KEY))[STORAGE_KEY]);

    case 'SAVE_SETTINGS': {
      const merged = mergeSettings(msg.settings);
      await chrome.storage.local.set({ [STORAGE_KEY]: merged });
      broadcastToGameTabs({ type: 'SETTINGS_UPDATED', settings: merged });
      return { ok: true };
    }

    case 'RESET_SETTINGS': {
      const fresh = structuredClone(DEFAULT_SETTINGS);
      await chrome.storage.local.set({ [STORAGE_KEY]: fresh });
      broadcastToGameTabs({ type: 'SETTINGS_UPDATED', settings: fresh });
      return { ok: true, settings: fresh };
    }

    case 'GET_STATS':
      return (await chrome.storage.local.get(STATS_KEY))[STATS_KEY] || emptyStats();

    case 'RESET_STATS':
      await chrome.storage.local.set({ [STATS_KEY]: emptyStats() });
      return { ok: true };

    case 'STATS_DELTA':
      return applyStatsDelta(msg.delta);

    case 'NOTIFY':
      raiseNotification(msg.title, msg.message);
      await sendWebhooks(msg.title, msg.message);   // awaited so the SW survives the fetch
      return { ok: true };

    case 'TEST_WEBHOOK':
      return { ok: true, sent: await sendWebhooks(msg.title || 'Tanoth Bot', msg.message || 'Test notification ✅') };

    case 'LIST_PROFILES':
      return Object.keys((await chrome.storage.local.get(PROFILES_KEY))[PROFILES_KEY] || {});

    case 'SAVE_PROFILE':   return saveProfile(msg.name);
    case 'LOAD_PROFILE':   return loadProfile(msg.name);
    case 'DELETE_PROFILE': return deleteProfile(msg.name);

    case 'OPEN_OPTIONS':
      chrome.runtime.openOptionsPage();
      return { ok: true };

    case 'GET_LICENSE':       return getLicenseStatus();
    case 'ACTIVATE_LICENSE':  return activateLicense(msg.key);

    case 'OPEN_PAYMENT':
      chrome.tabs.create({ url: REVOLUT_PAYMENT_URL });
      return { ok: true };

    case 'CONTROL':     return forwardToActiveGameTab(msg);
    case 'GET_STATUS':  return forwardToActiveGameTab({ type: 'GET_STATUS' });

    default: return { ok: false, error: 'UNKNOWN_MESSAGE' };
  }
}

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
  lifetimePriceEur: LIFETIME_PRICE_EUR,
  periodDays: BILLING_PERIOD_DAYS,
  trialDays: TRIAL_DAYS,
  paymentUrl: REVOLUT_PAYMENT_URL
};

// Stable identifier for THIS install/computer. A lifetime key is bound to it on
// first activation so the same key won't run on a different machine.
async function getDeviceId() {
  let id = (await chrome.storage.local.get(DEVICE_KEY))[DEVICE_KEY];
  if (!id) {
    id = (crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random().toString(36).slice(2));
    await chrome.storage.local.set({ [DEVICE_KEY]: id });
  }
  return id;
}

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
  const device = await getDeviceId();

  const trialEnds = inst.firstRun + TRIAL_DAYS * 86400000;
  const lifetimeMs = LIFETIME_THRESHOLD_DAYS * 86400000;
  let status = 'expired';
  let expISO = null;
  let entitled = false;
  let boundDevice = false;
  let wrongDevice = false;

  // Re-verify the stored key's SIGNATURE every time (not just at activation) so
  // a forged/hand-edited license object in storage can't grant entitlement.
  let licSigned = false;
  if (lic && typeof lic.key === 'string' && typeof lic.exp === 'number') {
    const payload = await verifyKey(lic.key);
    licSigned = !!payload && payload.exp === lic.exp;
  }
  const licValid = licSigned && lic.exp * 1000 > now;
  // Strict device binding: a stored license must carry THIS device's id.
  const licOnThisDevice = lic && lic.device === device;

  if (licValid && !licOnThisDevice) {
    // Key was activated on another computer.
    wrongDevice = true;
  } else if (licValid) {
    entitled = true;
    boundDevice = !!lic.device;
    expISO = new Date(lic.exp * 1000).toISOString();
    status = (lic.exp * 1000 - now) > lifetimeMs ? 'lifetime' : 'active';
  } else if (now < trialEnds) {
    status = 'trial';
    entitled = true;
    expISO = new Date(trialEnds).toISOString();
  }

  const ref = status === 'lifetime' || status === 'active' ? lic.exp * 1000 : trialEnds;
  const daysLeft = status === 'lifetime' ? null : Math.max(0, Math.ceil((ref - now) / 86400000));

  return { status, entitled, expISO, daysLeft, boundDevice, wrongDevice, payment: PAYMENT_INFO };
}

async function activateLicense(key) {
  const payload = await verifyKey(key);
  if (!payload) {
    return Object.assign({ ok: false, error: 'INVALID_KEY' }, await getLicenseStatus());
  }
  if (payload.exp * 1000 <= Date.now()) {
    return Object.assign({ ok: false, error: 'EXPIRED_KEY' }, await getLicenseStatus());
  }
  const device = await getDeviceId();

  // When a license server is configured, it enforces one-computer binding
  // across machines (offline binding alone can't). Reject if bound elsewhere.
  if (LICENSE_SERVER_URL) {
    try {
      const resp = await fetch(LICENSE_SERVER_URL.replace(/\/$/, '') + '/activate', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: key.trim(), device })
      });
      const j = await resp.json().catch(() => ({}));
      if (!j.ok) return Object.assign({ ok: false, error: j.error || 'SERVER_REJECTED' }, await getLicenseStatus());
    } catch (_) {
      return Object.assign({ ok: false, error: 'SERVER_UNREACHABLE' }, await getLicenseStatus());
    }
  }

  // Bind the licence to this computer on activation.
  await chrome.storage.local.set({
    [LICENSE_KEY]: { key: key.trim(), exp: payload.exp, device, boundAt: Date.now() }
  });
  const status = await getLicenseStatus();
  broadcastToGameTabs({ type: 'LICENSE_UPDATED', license: status });
  return Object.assign({ ok: true }, status);
}

/* ---- External notifications (Telegram / Discord) ---- */
async function sendWebhooks(title, message) {
  const settings = mergeSettings((await chrome.storage.local.get(STORAGE_KEY))[STORAGE_KEY]);
  const w = settings.webhooks || {};
  const reqs = buildExternalNotifications({
    telegram: { enabled: w.telegramEnabled, botToken: w.telegramToken, chatId: w.telegramChat },
    discord: { enabled: w.discordEnabled, webhookUrl: w.discordWebhook }
  }, title, message);
  let sent = 0;
  for (const r of reqs) {
    try { const resp = await fetch(r.url, r.options); if (resp.ok) sent++; } catch (_) {}
  }
  return sent;
}

/* ---- Settings profiles (multi-account) ---- */
async function saveProfile(name) {
  if (!name) return { ok: false, error: 'NO_NAME' };
  const settings = mergeSettings((await chrome.storage.local.get(STORAGE_KEY))[STORAGE_KEY]);
  const profiles = (await chrome.storage.local.get(PROFILES_KEY))[PROFILES_KEY] || {};
  profiles[name] = settings;
  await chrome.storage.local.set({ [PROFILES_KEY]: profiles });
  return { ok: true, profiles: Object.keys(profiles) };
}
async function loadProfile(name) {
  const profiles = (await chrome.storage.local.get(PROFILES_KEY))[PROFILES_KEY] || {};
  if (!profiles[name]) return { ok: false, error: 'NOT_FOUND' };
  const merged = mergeSettings(profiles[name]);
  await chrome.storage.local.set({ [STORAGE_KEY]: merged });
  broadcastToGameTabs({ type: 'SETTINGS_UPDATED', settings: merged });
  return { ok: true, settings: merged };
}
async function deleteProfile(name) {
  const profiles = (await chrome.storage.local.get(PROFILES_KEY))[PROFILES_KEY] || {};
  delete profiles[name];
  await chrome.storage.local.set({ [PROFILES_KEY]: profiles });
  return { ok: true, profiles: Object.keys(profiles) };
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
