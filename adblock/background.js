// Service worker: rule toggling, allowlist, stats and messaging.

const RULESET_IDS = ["ad_rules", "youtube_rules"];
const FILTER_COUNT = 248; // bundled static rules (ad_rules + youtube_rules)

// Dynamic-rule id ranges, kept clear of the static rulesets.
const USER_BLOCK_BASE = 80000;   // user "my filters" block rules
const ALLOW_RULE_BASE = 90000;   // allowlist (allowAllRequests)
const LIVE_RULE_BASE = 100000;   // block domains from the live filter update

// Live filter updates: DATA only (domains + CSS selectors), never code.
// Update this JSON on the server and every install refreshes itself, no
// Web Store re-review needed. MV3 forbids remote CODE, not remote data.
const CONFIG_URL = "https://carbonstealth.eu/adblock/filters.json";
const LIVE_RULE_MAX = 3000;

// never block these from a user filter, even by mistake
const NEVER_BLOCK = [
  "googlevideo.com", "ytimg.com", "youtube.com", "ggpht.com", "gstatic.com",
  "googleapis.com", "google.com", "fbcdn.net", "cdninstagram.com",
];
const isProtected = (d) => NEVER_BLOCK.some((p) => d === p || d.endsWith("." + p));

// avg bytes per blocked resource type. count is exact, size is approximate
// (the request never loads, so its real size is unknown)
const SIZE_BY_TYPE = {
  script: 95 * 1024,
  image: 38 * 1024,
  sub_frame: 75 * 1024,
  xmlhttprequest: 9 * 1024,
  media: 620 * 1024,
  ping: 1 * 1024,
  font: 28 * 1024,
  stylesheet: 16 * 1024,
  object: 110 * 1024,
  websocket: 2 * 1024,
  other: 20 * 1024,
};
const BLENDED_SIZE = 55 * 1024;
const BANDWIDTH = 1.6 * 1024 * 1024; // bytes/s, for the time estimate
const LATENCY_MS = 40; // per-request round-trip overhead

const DEFAULTS = {
  enabled: true,
  blockedTotal: 0,
  savedBytes: 0,
  smartBlocked: 0,
  smartLog: [],
  allowlist: [],
  features: { cookies: true, antiAdblock: true, meta: true, youtube: true, smart: true },
  customHidden: {},
  userFilters: "",
  theme: "carbon",
  sync: false,
  pausedUntil: 0,
  autoUpdate: true,
  liveConfig: null,
  liveUpdated: 0,
};

// Settings mirrored to chrome.storage.sync when cross-device sync is on.
const SYNC_KEYS = ["enabled", "features", "theme", "allowlist", "userFilters"];

chrome.runtime.onInstalled.addListener(async () => {
  const stored = await chrome.storage.local.get(Object.keys(DEFAULTS));
  const patch = {};
  for (const [k, v] of Object.entries(DEFAULTS)) {
    if (stored[k] === undefined) patch[k] = v;
  }
  if (Object.keys(patch).length) await chrome.storage.local.set(patch);
  await applyState();
  await syncAllowRules();
  await syncUserRules();
  createMenus();
  chrome.alarms.create("config-update", { periodInMinutes: 720 }); // every 12h
  fetchLiveConfig();
});

chrome.runtime.onStartup.addListener(async () => {
  const { sync, pausedUntil, liveConfig } = await chrome.storage.local.get([
    "sync",
    "pausedUntil",
    "liveConfig",
  ]);
  if (sync) await pullFromSync();
  // Restore or expire a pending pause.
  if (pausedUntil && pausedUntil > Date.now()) {
    chrome.alarms.create("resume", { when: pausedUntil });
  } else if (pausedUntil) {
    await chrome.storage.local.set({ enabled: true, pausedUntil: 0 });
  }
  await applyState();
  await syncAllowRules();
  await syncUserRules();
  await syncLiveRules(liveConfig?.blockDomains || []); // re-apply + clear stale
  createMenus();
  chrome.alarms.create("config-update", { periodInMinutes: 720 });
});

// right-click entry that fires the element picker
function createMenus() {
  try {
    chrome.contextMenus.removeAll(() => {
      chrome.contextMenus.create({
        id: "tbab-pick",
        title: "Block an element here",
        contexts: ["page", "image", "video", "link", "frame"],
      });
    });
  } catch (e) {}
}

// cross-device sync via chrome.storage.sync
async function pushToSync() {
  try {
    await chrome.storage.sync.set(await chrome.storage.local.get(SYNC_KEYS));
  } catch (e) {
    console.warn("sync push failed", e);
  }
}

async function pullFromSync() {
  try {
    const data = await chrome.storage.sync.get(SYNC_KEYS);
    const patch = {};
    for (const k of SYNC_KEYS) if (data[k] !== undefined) patch[k] = data[k];
    if (Object.keys(patch).length) await chrome.storage.local.set(patch);
  } catch (e) {}
}

// Cache the sync flag so we don't hit storage on every change (the stats
// counter writes once a second).
let syncOn = false;
chrome.storage.local.get("sync", (d) => (syncOn = !!d.sync));

chrome.storage.onChanged.addListener(async (changes, area) => {
  if (area === "local" && changes.sync) syncOn = !!changes.sync.newValue;
  if (!syncOn) return;

  if (area === "local") {
    const patch = {};
    for (const k of SYNC_KEYS) if (k in changes) patch[k] = changes[k].newValue;
    if (Object.keys(patch).length) {
      try {
        await chrome.storage.sync.set(patch);
      } catch (e) {}
    }
  } else if (area === "sync") {
    const patch = {};
    for (const k of SYNC_KEYS) if (k in changes) patch[k] = changes[k].newValue;
    if (!Object.keys(patch).length) return;
    // Only write differing values, so the local<->sync mirror can't loop.
    const cur = await chrome.storage.local.get(Object.keys(patch));
    const diff = {};
    for (const k in patch) {
      if (JSON.stringify(cur[k]) !== JSON.stringify(patch[k])) diff[k] = patch[k];
    }
    if (Object.keys(diff).length) {
      await chrome.storage.local.set(diff);
      await applyState();
      await syncAllowRules();
      await syncUserRules();
    }
  }
});

// temporary pause, auto-resumes via alarm
async function pauseFor(minutes) {
  const until = Date.now() + minutes * 60000;
  await chrome.storage.local.set({ enabled: false, pausedUntil: until });
  await applyState();
  chrome.alarms.create("resume", { when: until });
}

async function resumeNow() {
  await chrome.alarms.clear("resume");
  await chrome.storage.local.set({ enabled: true, pausedUntil: 0 });
  await applyState();
}

chrome.alarms.onAlarm.addListener((a) => {
  if (a.name === "resume") resumeNow();
  if (a.name === "config-update") fetchLiveConfig();
});

chrome.contextMenus?.onClicked.addListener((info, tab) => {
  if (info.menuItemId === "tbab-pick" && tab?.id) {
    chrome.tabs.sendMessage(tab.id, { type: "activatePicker" });
  }
});

// Enable or disable the bundled static rulesets. The YouTube ruleset also
// follows the "youtube" feature toggle so it can be turned off independently.
async function applyState() {
  const { enabled, features } = await chrome.storage.local.get(["enabled", "features"]);
  const on = enabled !== false;
  const ytOn = on && (features || DEFAULTS.features).youtube !== false;

  const enable = [];
  const disable = [];
  (on ? enable : disable).push("ad_rules");
  (ytOn ? enable : disable).push("youtube_rules");

  try {
    await chrome.declarativeNetRequest.updateEnabledRulesets({
      enableRulesetIds: enable,
      disableRulesetIds: disable,
    });
  } catch (e) {
    console.warn("ruleset toggle failed", e);
  }
  chrome.action.setBadgeBackgroundColor({ color: on ? "#00838f" : "#5a5a5a" });
}

// ---- Live filter update (remote DATA, never code) ----
const strArr = (x, cap) =>
  Array.isArray(x)
    ? x.filter((s) => typeof s === "string" && s.length < 400).slice(0, cap)
    : [];

// Selectors too broad to ever be a legitimate ad rule; rejecting them stops a
// compromised/mistyped config from hiding whole pages.
const UNSAFE_SELECTORS = new Set([
  "*", "html", "body", ":root", "head", "div", "span", "a", "img",
  "main", "section", "article", "video", "iframe",
]);
const safeSelector = (s) => {
  s = s.trim();
  return s.length >= 3 && !UNSAFE_SELECTORS.has(s.toLowerCase());
};
const selArr = (x, cap) => strArr(x, cap).filter(safeSelector);

// Player-response fields the config must never be able to delete (would break
// playback), so ad-field pruning can only touch genuine ad fields.
const PROTECTED_YT_FIELDS = new Set([
  "videoDetails", "streamingData", "playerConfig", "playabilityStatus",
  "captions", "storyboards", "microformat", "trackingParams", "responseContext",
]);

// Reduce the fetched JSON to a strict, known shape. Everything is treated as
// inert data (domain strings, CSS selectors); nothing is ever executed.
function sanitizeConfig(cfg) {
  const yt = cfg && typeof cfg.youtube === "object" ? cfg.youtube : {};
  return {
    version: Number.isFinite(cfg?.version) ? cfg.version : 0,
    blockDomains: strArr(cfg?.blockDomains, LIVE_RULE_MAX)
      .map((d) => d.toLowerCase().replace(/^\|\|/, "").replace(/[\^/].*$/, ""))
      .filter((d) => /^[a-z0-9.-]+\.[a-z]{2,}$/.test(d) && !isProtected(d)),
    cosmetic: selArr(cfg?.cosmetic, 2000),
    youtube: {
      hide: selArr(yt.hide, 300),
      skip: selArr(yt.skip, 100),
      enforcement: selArr(yt.enforcement, 50),
      adFields: strArr(yt.adFields, 50).filter(
        (f) => /^[a-zA-Z]+$/.test(f) && !PROTECTED_YT_FIELDS.has(f)
      ),
    },
  };
}

async function syncLiveRules(domains = []) {
  const existing = await chrome.declarativeNetRequest.getDynamicRules();
  const removeRuleIds = existing.filter((r) => r.id >= LIVE_RULE_BASE).map((r) => r.id);
  const addRules = domains.slice(0, LIVE_RULE_MAX).map((d, i) => ({
    id: LIVE_RULE_BASE + i,
    priority: 1,
    action: { type: "block" },
    condition: {
      urlFilter: "||" + d + "^",
      resourceTypes: [
        "script", "image", "sub_frame", "xmlhttprequest",
        "media", "ping", "font", "stylesheet", "object",
      ],
    },
  }));
  try {
    await chrome.declarativeNetRequest.updateDynamicRules({ removeRuleIds, addRules });
  } catch (e) {
    console.warn("live rules failed", e);
  }
}

async function fetchLiveConfig(force) {
  const { autoUpdate } = await chrome.storage.local.get("autoUpdate");
  if (!force && autoUpdate === false) return { ok: false, reason: "off" };
  let raw;
  try {
    const res = await fetch(CONFIG_URL, { cache: "no-cache" });
    if (!res.ok) return { ok: false, reason: "http " + res.status };
    raw = await res.json();
  } catch (e) {
    return { ok: false, reason: "network" };
  }
  const cfg = sanitizeConfig(raw);
  await chrome.storage.local.set({ liveConfig: cfg, liveUpdated: Date.now() });
  await syncLiveRules(cfg.blockDomains);
  return { ok: true, version: cfg.version, domains: cfg.blockDomains.length };
}

// Rebuild the allowlist rules (one allowAllRequests rule per whitelisted host).
async function syncAllowRules() {
  const { allowlist = [] } = await chrome.storage.local.get("allowlist");
  const existing = await chrome.declarativeNetRequest.getDynamicRules();
  const removeRuleIds = existing
    .filter((r) => r.id >= ALLOW_RULE_BASE && r.id < LIVE_RULE_BASE)
    .map((r) => r.id);

  const addRules = allowlist.map((domain, i) => ({
    id: ALLOW_RULE_BASE + i,
    priority: 10000,
    action: { type: "allowAllRequests" },
    condition: {
      requestDomains: [domain],
      resourceTypes: ["main_frame", "sub_frame"],
    },
  }));

  try {
    await chrome.declarativeNetRequest.updateDynamicRules({ removeRuleIds, addRules });
  } catch (e) {
    console.warn("allow rules update failed", e);
  }
}

// "My filters": lines that aren't cosmetic (no "##") and look like a domain
// become block rules. uBlock-style ||domain^ and bare domains both work.
function parseUserDomains(text) {
  const set = new Set();
  for (let line of (text || "").split("\n")) {
    line = line.trim();
    if (!line || line.startsWith("!") || line.includes("##")) continue;
    const d = line
      .replace(/^\|\|/, "")
      .replace(/[\^/].*$/, "")
      .replace(/^https?:\/\//, "")
      .toLowerCase();
    if (/^[a-z0-9.-]+\.[a-z]{2,}$/.test(d) && !isProtected(d)) set.add(d);
  }
  return [...set];
}

async function syncUserRules() {
  const { userFilters = "" } = await chrome.storage.local.get("userFilters");
  const domains = parseUserDomains(userFilters).slice(0, 2000);
  const existing = await chrome.declarativeNetRequest.getDynamicRules();
  const removeRuleIds = existing
    .filter((r) => r.id >= USER_BLOCK_BASE && r.id < ALLOW_RULE_BASE)
    .map((r) => r.id);

  const addRules = domains.map((d, i) => ({
    id: USER_BLOCK_BASE + i,
    priority: 1,
    action: { type: "block" },
    condition: {
      urlFilter: "||" + d + "^",
      resourceTypes: [
        "script", "image", "sub_frame", "xmlhttprequest",
        "media", "ping", "font", "stylesheet", "object",
      ],
    },
  }));

  try {
    await chrome.declarativeNetRequest.updateDynamicRules({ removeRuleIds, addRules });
  } catch (e) {
    console.warn("user rules update failed", e);
  }
}

// blocked-request counters
const tabMatched = new Map();
let pendingCount = 0;
let pendingBytes = 0;
let flushTimer = null;

function record(count, bytes) {
  pendingCount += count;
  pendingBytes += bytes;
  if (flushTimer) return;
  flushTimer = setTimeout(async () => {
    const c = pendingCount;
    const b = pendingBytes;
    pendingCount = pendingBytes = 0;
    flushTimer = null;
    const { blockedTotal = 0, savedBytes = 0 } = await chrome.storage.local.get([
      "blockedTotal",
      "savedBytes",
    ]);
    await chrome.storage.local.set({
      blockedTotal: blockedTotal + c,
      savedBytes: savedBytes + b,
    });
  }, 1000);
}

// Smart Detection hits arrive from every frame (content.js is all_frames), so
// serialise the read-modify-write through one chain to avoid lost updates.
let smartChain = Promise.resolve();
function recordSmart(host, items) {
  smartChain = smartChain
    .then(async () => {
      const { smartBlocked = 0, smartLog = [] } = await chrome.storage.local.get([
        "smartBlocked",
        "smartLog",
      ]);
      const now = Date.now();
      const entries = items.map((it) => ({ host, w: it.w, h: it.h, reason: it.reason, time: now }));
      await chrome.storage.local.set({
        smartBlocked: smartBlocked + items.length,
        smartLog: entries.concat(smartLog).slice(0, 50),
      });
    })
    .catch(() => {});
}

const DEBUG_COUNTING = !!chrome.declarativeNetRequest.onRuleMatchedDebug;

if (DEBUG_COUNTING) {
  chrome.declarativeNetRequest.onRuleMatchedDebug.addListener((info) => {
    const id = info?.rule?.ruleId;
    if (id >= ALLOW_RULE_BASE) return; // allow rule, don't count
    record(1, SIZE_BY_TYPE[info?.request?.type] ?? BLENDED_SIZE);
  });
}

async function refreshBadge(tabId) {
  try {
    const { enabled } = await chrome.storage.local.get("enabled");
    if (enabled === false) {
      chrome.action.setBadgeText({ text: "", tabId });
      return;
    }
    const info = await chrome.declarativeNetRequest.getMatchedRules({ tabId });
    const count = info?.rulesMatchedInfo?.length || 0;
    if (!DEBUG_COUNTING) {
      const prev = tabMatched.get(tabId) || 0;
      if (count > prev) record(count - prev, (count - prev) * BLENDED_SIZE);
    }
    tabMatched.set(tabId, count);
    chrome.action.setBadgeText({ text: count > 0 ? String(count) : "", tabId });
  } catch (e) {}
}

chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (changeInfo.status === "loading" && changeInfo.url) tabMatched.set(tabId, 0);
  if (changeInfo.status === "complete") refreshBadge(tabId);
});
chrome.tabs.onActivated.addListener(({ tabId }) => refreshBadge(tabId));
chrome.tabs.onRemoved.addListener((tabId) => tabMatched.delete(tabId));

// helpers
function hostFromUrl(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}

async function isAllowlisted(host) {
  if (!host) return false;
  const { allowlist = [] } = await chrome.storage.local.get("allowlist");
  return allowlist.some((d) => host === d || host.endsWith("." + d));
}

function savedStats(bytes, count) {
  return {
    bytes,
    mb: bytes / (1024 * 1024),
    seconds: bytes / BANDWIDTH + (count * LATENCY_MS) / 1000,
  };
}

// messages from popup / options / content
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  switch (msg.type) {
    case "toggle":
      // A manual toggle cancels any active timed pause.
      chrome.alarms.clear("resume");
      chrome.storage.local.set({ enabled: msg.enabled, pausedUntil: 0 }, async () => {
        await applyState();
        sendResponse({ ok: true });
      });
      return true;

    case "pause":
      pauseFor(msg.minutes || 30).then(() => sendResponse({ ok: true }));
      return true;

    case "resume":
      resumeNow().then(() => sendResponse({ ok: true }));
      return true;

    case "setSync":
      chrome.storage.local.set({ sync: !!msg.on }, async () => {
        if (msg.on) await pushToSync();
        sendResponse({ ok: true });
      });
      return true;

    case "getStats":
      chrome.storage.local.get(
        ["enabled", "blockedTotal", "savedBytes", "smartBlocked", "allowlist", "features", "theme", "sync", "pausedUntil", "autoUpdate", "liveConfig", "liveUpdated"],
        async (data) => {
          let host = null;
          let allowed = false;
          if (msg.tabUrl) {
            host = hostFromUrl(msg.tabUrl);
            allowed = await isAllowlisted(host);
          }
          const blockedTotal = data.blockedTotal || 0;
          const live = data.liveConfig || null;
          sendResponse({
            enabled: data.enabled !== false,
            blockedTotal,
            saved: savedStats(data.savedBytes || 0, blockedTotal),
            allowlist: data.allowlist || [],
            features: data.features || DEFAULTS.features,
            theme: data.theme || "carbon",
            filterCount: FILTER_COUNT + (live?.blockDomains?.length || 0),
            smartBlocked: data.smartBlocked || 0,
            sync: !!data.sync,
            pausedUntil: data.pausedUntil || 0,
            autoUpdate: data.autoUpdate !== false,
            liveVersion: live?.version || 0,
            liveUpdated: data.liveUpdated || 0,
            host,
            allowed,
          });
        }
      );
      return true;

    case "updateFilters":
      fetchLiveConfig(true).then((r) => sendResponse(r));
      return true;

    case "setAutoUpdate":
      chrome.storage.local.set({ autoUpdate: !!msg.on }, () => sendResponse({ ok: true }));
      return true;

    case "setAllow":
      chrome.storage.local.get("allowlist", async (data) => {
        let list = data.allowlist || [];
        if (!msg.host) return sendResponse({ ok: false });
        if (msg.allow) {
          if (!list.includes(msg.host)) list.push(msg.host);
        } else {
          list = list.filter((d) => d !== msg.host);
        }
        await chrome.storage.local.set({ allowlist: list });
        await syncAllowRules();
        sendResponse({ ok: true, allowlist: list });
      });
      return true;

    case "setFeatures":
      chrome.storage.local.set({ features: msg.features }, async () => {
        await applyState(); // youtube ruleset follows the youtube toggle
        sendResponse({ ok: true });
      });
      return true;

    case "setTheme":
      chrome.storage.local.set({ theme: msg.theme }, () => sendResponse({ ok: true }));
      return true;

    case "resetStats":
      chrome.storage.local.set(
        { blockedTotal: 0, savedBytes: 0, smartBlocked: 0, smartLog: [] },
        () => sendResponse({ ok: true })
      );
      return true;

    case "saveCustomSelector":
      chrome.storage.local.get("customHidden", async (data) => {
        const map = data.customHidden || {};
        if (!msg.host || !msg.selector) return sendResponse({ ok: false });
        map[msg.host] = map[msg.host] || [];
        if (!map[msg.host].includes(msg.selector)) map[msg.host].push(msg.selector);
        await chrome.storage.local.set({ customHidden: map });
        sendResponse({ ok: true });
      });
      return true;

    case "importSettings": {
      // Only accept known setting keys from the imported file.
      const clean = {};
      for (const k of Object.keys(DEFAULTS)) {
        if (msg.data && k in msg.data) clean[k] = msg.data[k];
      }
      chrome.storage.local.set(clean, async () => {
        await applyState();
        await syncAllowRules();
        await syncUserRules();
        sendResponse({ ok: true });
      });
      return true;
    }

    case "smartHit": {
      const items = Array.isArray(msg.items) ? msg.items : [];
      if (items.length) recordSmart(msg.host || "", items);
      return false;
    }

    case "setUserFilters":
      chrome.storage.local.set({ userFilters: msg.text || "" }, async () => {
        await syncUserRules();
        sendResponse({ ok: true });
      });
      return true;

    case "startPicker":
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs[0]) chrome.tabs.sendMessage(tabs[0].id, { type: "activatePicker" });
        sendResponse({ ok: true });
      });
      return true;
  }
});
