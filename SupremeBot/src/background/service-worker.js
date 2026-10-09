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
  REVOLUT_PAYMENT_URL, LICENSE_PUBLIC_KEY, LICENSE_PREFIX, LICENSE_SERVER_URL,
  MERCHANT_NAME, TERMS_URL, PRIVACY_URL, REFUND_URL
} from '../shared/payment.js';
import { buildExternalNotifications } from '../shared/notify.js';

const STORAGE_KEY = 'tanothBotSettings';
const STATS_KEY = 'tanothBotStats';
const LICENSE_KEY = 'tanothBotLicense';   // { key, exp, device }
const INSTALL_KEY = 'tanothBotInstall';   // { firstRun }
const DEVICE_KEY = 'tanothBotDevice';     // stable per-install device id
const PROFILES_KEY = 'tanothBotProfiles'; // { name: settings }
// Per-hero settings: { "<server>:<name>": { name, server, settings, lastSeen } }.
// Each hero (tab) runs on its own settings; the global STORAGE_KEY settings are
// the template a NEW hero starts from (and what an unidentified tab uses).
const HEROES_KEY = 'tanothBotHeroes';

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
    eventQuests: 0,
    shadowRuns: 0,
    goldDonated: 0,
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
  try {
  const tabs = await chrome.tabs.query({ url: '*://*.tanoth.gameforge.com/*' });
  for (const tab of tabs) {
    chrome.tabs.sendMessage(tab.id, { type: 'HEARTBEAT' }).catch(() => {});
  }
  } catch (_) {}
});

/* -------------------------------------------------------------------------- */
/* Message routing                                                             */
/* -------------------------------------------------------------------------- */

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  // All handlers go through one async dispatcher so the message port stays open
  // (worker kept alive) until a response is sent, and every path responds even
  // on error - no hung ports / dropped webhooks.
  handleMessage(msg, sender)
    .then((r) => sendResponse(r))
    .catch((e) => sendResponse({ ok: false, error: String((e && e.message) || e) }));
  return true;
});

async function handleMessage(msg, sender) {
  switch (msg?.type) {
    case 'GET_SETTINGS':
      return getSettingsFor(heroKeyOf(msg.heroKey));

    case 'SAVE_SETTINGS':
      return saveSettingsFor(heroKeyOf(msg.heroKey), msg.settings);

    case 'RESET_SETTINGS': {
      const fresh = structuredClone(DEFAULT_SETTINGS);
      await saveSettingsFor(heroKeyOf(msg.heroKey), fresh);
      return { ok: true, settings: fresh };
    }

    case 'BIND_HERO':     return bindHero(msg);
    case 'LIST_HEROES':   return listHeroes();
    case 'FORGET_HERO':   return forgetHero(heroKeyOf(msg.heroKey));

    case 'GET_STATS':
      return (await chrome.storage.local.get(STATS_KEY))[STATS_KEY] || emptyStats();

    case 'RESET_STATS':
      await chrome.storage.local.set({ [STATS_KEY]: emptyStats() });
      return { ok: true };

    case 'STATS_DELTA':
      return applyStatsDelta(msg.delta);

    case 'NOTIFY': {
      // Two independent channels: a Chrome desktop popup (only when the desktop
      // toggle is on) and the Telegram/Discord webhooks (gated by their own
      // config). So you can send everything to Discord WITHOUT any Chrome popups.
      // The sending hero's own settings decide where his alerts go.
      const settings = await getSettingsFor(heroKeyOf(msg.heroKey));
      if (settings.general?.notifications && msg.desktop !== false) raiseNotification(msg.title, msg.message);
      await sendWebhooks(msg.title, msg.message, msg.level, msg.fields, settings.webhooks);   // awaited so the SW survives the fetch
      return { ok: true };
    }

    case 'TEST_WEBHOOK':
      return { ok: true, sent: await sendWebhooks(
        msg.title || 'Tanoth Bot', msg.message || 'Test notification ✅', 'success',
        [{ name: 'Status', value: 'Connected', inline: true }, { name: 'Version', value: chrome.runtime.getManifest().version, inline: true }],
        // The options page sends what is typed in the form (not yet saved).
        msg.webhooks && typeof msg.webhooks === 'object' ? msg.webhooks : null
      ) };

    case 'LIST_PROFILES':
      return Object.keys((await chrome.storage.local.get(PROFILES_KEY))[PROFILES_KEY] || {});

    case 'SAVE_PROFILE':   return saveProfile(msg.name);
    case 'LOAD_PROFILE':   return loadProfile(msg.name, heroKeyOf(msg.heroKey));
    case 'DELETE_PROFILE': return deleteProfile(msg.name);

    case 'OPEN_OPTIONS':
      chrome.runtime.openOptionsPage();
      return { ok: true };

    case 'GET_LICENSE':       return getLicenseStatus();
    case 'ACTIVATE_LICENSE':  return activateLicense(msg.key);

    case 'OPEN_PAYMENT':
      chrome.tabs.create({ url: REVOLUT_PAYMENT_URL });
      return { ok: true };

    case 'OPEN_URL':
      // Only the vetted legal-doc URLs, never arbitrary input.
      if ([TERMS_URL, PRIVACY_URL, REFUND_URL].includes(msg.url)) chrome.tabs.create({ url: msg.url });
      return { ok: true };

    case 'CONTROL':     return forwardToActiveGameTab(msg);
    case 'GET_STATUS':  return forwardToActiveGameTab({ type: 'GET_STATUS', tabId: msg.tabId });

    default: return { ok: false, error: 'UNKNOWN_MESSAGE' };
  }
}

// Storage read-modify-write ops are chained so two near-simultaneous deltas
// (e.g. from two game tabs) can't interleave and lose an update.
let statsChain = Promise.resolve();

function applyStatsDelta(delta) {
  const run = statsChain.then(async () => {
    const cur = (await chrome.storage.local.get(STATS_KEY))[STATS_KEY] || emptyStats();
    const known = emptyStats();
    for (const [k, v] of Object.entries(delta || {})) {
      // Whitelist + finite check: NaN/Infinity or unknown keys must not
      // poison the stored counters.
      if (Number.isFinite(v) && k in known && k !== 'since') cur[k] = (Number(cur[k]) || 0) + v;
    }
    await chrome.storage.local.set({ [STATS_KEY]: cur });
    return cur;
  });
  statsChain = run.catch(() => {});
  return run;
}

async function broadcastToGameTabs(message) {
  const tabs = await chrome.tabs.query({ url: '*://*.tanoth.gameforge.com/*' });
  for (const tab of tabs) {
    chrome.tabs.sendMessage(tab.id, message).catch(() => {});
  }
}

async function forwardToActiveGameTab(message) {
  // The popup names the exact tab it controls (it knows its own window); only
  // fall back to guessing when no tab id was given.
  if (Number.isInteger(message.tabId)) {
    const t = await chrome.tabs.get(message.tabId).catch(() => null);
    if (t && /tanoth\.gameforge\.com/.test(t.url || '')) {
      try { return await chrome.tabs.sendMessage(t.id, message); }
      catch (e) { return { ok: false, error: 'TAB_UNREACHABLE' }; }
    }
  }
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
  paymentUrl: REVOLUT_PAYMENT_URL,
  merchant: MERCHANT_NAME,
  termsUrl: TERMS_URL,
  privacyUrl: PRIVACY_URL,
  refundUrl: REFUND_URL
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
// Public key only: the extension can VERIFY a licence signature but holds
// nothing that could create one (the private key never leaves the seller).
let publicKeyPromise = null;
function licensePublicKey() {
  if (!publicKeyPromise) {
    publicKeyPromise = crypto.subtle.importKey(
      'spki', b64urlToBytes(LICENSE_PUBLIC_KEY),
      { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']
    );
  }
  return publicKeyPromise;
}

// Key format: TZ2.<payloadB64url>.<sigB64url>, payload = {"exp":<epochSec>},
// sig = ECDSA P-256 / SHA-256 over the payload text (IEEE P1363, 64 bytes).
async function verifyKey(key) {
  try {
    if (typeof key !== 'string') return null;
    const parts = key.trim().split('.');
    if (parts.length !== 3 || parts[0] !== LICENSE_PREFIX) return null;
    const [, payloadB64, sigB64] = parts;
    const sig = b64urlToBytes(sigB64);
    if (sig.length !== 64) return null;
    const ok = await crypto.subtle.verify(
      { name: 'ECDSA', hash: 'SHA-256' }, await licensePublicKey(), sig, new TextEncoder().encode(payloadB64)
    );
    if (!ok) return null;
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

  if (licValid && licOnThisDevice) {
    entitled = true;
    boundDevice = !!lic.device;
    expISO = new Date(lic.exp * 1000).toISOString();
    status = (lic.exp * 1000 - now) > lifetimeMs ? 'lifetime' : 'active';
  } else if (licValid) {
    wrongDevice = true;   // bound elsewhere - note it, but still allow the trial below
  }
  // A valid trial entitles regardless of a foreign-bound key.
  if (!entitled && now < trialEnds) {
    status = 'trial';
    entitled = true;
    expISO = new Date(trialEnds).toISOString();
  }

  const ref = status === 'lifetime' || status === 'active' ? lic.exp * 1000 : trialEnds;
  const daysLeft = status === 'lifetime' ? null : (entitled ? Math.max(0, Math.ceil((ref - now) / 86400000)) : 0);

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
async function sendWebhooks(title, message, level, fields, override) {
  const settings = mergeSettings((await chrome.storage.local.get(STORAGE_KEY))[STORAGE_KEY]);
  const w = override || settings.webhooks || {};
  const reqs = buildExternalNotifications({
    telegram: { enabled: w.telegramEnabled, botToken: w.telegramToken, chatId: w.telegramChat },
    discord: {
      enabled: w.discordEnabled, webhookUrl: w.discordWebhook,
      username: w.discordUsername, avatarUrl: w.discordAvatarUrl,
      useEmbeds: w.discordUseEmbeds !== false, threadId: w.discordThreadId,
      mention: w.discordMention, footer: w.discordFooter
    }
  }, title, message, level, fields);
  let sent = 0;
  for (const r of reqs) {
    try { const resp = await fetch(r.url, r.options); if (resp.ok) sent++; } catch (_) {}
  }
  return sent;
}

/* ---- Settings profiles (multi-account) ---- */
// Own-property checks everywhere: a profile named "constructor" or "__proto__"
// must not hit Object.prototype (it would silently reset settings / no-op).
async function saveProfile(name) {
  if (!name || typeof name !== 'string') return { ok: false, error: 'NO_NAME' };
  const settings = mergeSettings((await chrome.storage.local.get(STORAGE_KEY))[STORAGE_KEY]);
  const profiles = (await chrome.storage.local.get(PROFILES_KEY))[PROFILES_KEY] || {};
  const clean = Object.assign(Object.create(null), profiles);
  clean[name] = settings;
  await chrome.storage.local.set({ [PROFILES_KEY]: Object.assign({}, clean) });
  return { ok: true, profiles: Object.keys(clean) };
}
async function loadProfile(name, heroKey) {
  const profiles = (await chrome.storage.local.get(PROFILES_KEY))[PROFILES_KEY] || {};
  if (!Object.hasOwn(profiles, name)) return { ok: false, error: 'NOT_FOUND' };
  const merged = mergeSettings(profiles[name]);
  await saveSettingsFor(heroKey, merged);
  return { ok: true, settings: merged };
}

/* ---- Per-hero settings ---- */
// "<server>:<name>" built by the content script; validated so it can never be
// "__proto__"/"constructor" or carry junk into storage keys.
function heroKeyOf(k) {
  return typeof k === 'string' && /^[\w-]{1,32}:[^\u0000-\u001f]{1,64}$/.test(k) && !/^(__proto__|constructor|prototype)$/.test(k) ? k : null;
}
let heroChain = Promise.resolve();       // serialise read-modify-write across tabs
function heroWrite(fn) {
  const run = heroChain.then(async () => {
    const heroes = Object.assign(Object.create(null), (await chrome.storage.local.get(HEROES_KEY))[HEROES_KEY] || {});
    const out = await fn(heroes);
    await chrome.storage.local.set({ [HEROES_KEY]: { ...heroes } });
    return out;
  });
  heroChain = run.catch(() => {});
  return run;
}
async function getSettingsFor(heroKey) {
  if (heroKey) {
    const heroes = (await chrome.storage.local.get(HEROES_KEY))[HEROES_KEY] || {};
    if (Object.hasOwn(heroes, heroKey) && heroes[heroKey].settings) return mergeSettings(heroes[heroKey].settings);
  }
  return mergeSettings((await chrome.storage.local.get(STORAGE_KEY))[STORAGE_KEY]);
}
async function saveSettingsFor(heroKey, settings) {
  const merged = mergeSettings(settings);
  if (heroKey) {
    await heroWrite((heroes) => {
      const cur = Object.hasOwn(heroes, heroKey) ? heroes[heroKey] : { name: heroKey.split(':').slice(1).join(':'), server: heroKey.split(':')[0] };
      heroes[heroKey] = { ...cur, settings: merged };
    });
  } else {
    await chrome.storage.local.set({ [STORAGE_KEY]: merged });
  }
  // Each tab applies only the settings of the hero it is bound to.
  broadcastToGameTabs({ type: 'SETTINGS_UPDATED', settings: merged, heroKey });
  return { ok: true };
}
// A tab identified its hero: return that hero's settings, creating them on the
// first visit as a copy of the current default settings.
async function bindHero(msg) {
  const key = heroKeyOf(msg.heroKey);
  if (!key) return { ok: false, error: 'BAD_HERO' };
  const global = mergeSettings((await chrome.storage.local.get(STORAGE_KEY))[STORAGE_KEY]);
  return heroWrite((heroes) => {
    const isNew = !Object.hasOwn(heroes, key);
    const cur = isNew ? { settings: global } : heroes[key];
    heroes[key] = { ...cur, name: String(msg.name || '').slice(0, 64), server: String(msg.server || '').slice(0, 32), lastSeen: Date.now() };
    return { ok: true, isNew, settings: mergeSettings(heroes[key].settings) };
  });
}
async function listHeroes() {
  const heroes = (await chrome.storage.local.get(HEROES_KEY))[HEROES_KEY] || {};
  return Object.keys(heroes).map((key) => ({ key, name: heroes[key].name, server: heroes[key].server, lastSeen: heroes[key].lastSeen || 0 }))
    .sort((a, b) => b.lastSeen - a.lastSeen);
}
async function forgetHero(heroKey) {
  if (!heroKey) return { ok: false, error: 'BAD_HERO' };
  await heroWrite((heroes) => { delete heroes[heroKey]; });
  return { ok: true };
}
async function deleteProfile(name) {
  const profiles = (await chrome.storage.local.get(PROFILES_KEY))[PROFILES_KEY] || {};
  if (Object.hasOwn(profiles, name)) delete profiles[name];
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
