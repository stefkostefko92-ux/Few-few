// Service worker: rule toggling, allowlist, stats and messaging.

const RULESET_IDS = ["ad_rules", "youtube_rules"];
const FILTER_COUNT = 247; // bundled static rules (ad_rules + youtube_rules)

// Dynamic-rule id ranges, kept clear of the static rulesets.
const USER_BLOCK_BASE = 80000;   // user "my filters" block rules
const ALLOW_RULE_BASE = 90000;   // allowlist (allowAllRequests)
const LEGACY_LIST_BASE = 100000; // old imported-filter rules, cleaned up on load

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
  await dropLegacyRules();
  createMenus();
});

chrome.runtime.onStartup.addListener(async () => {
  const { sync, pausedUntil } = await chrome.storage.local.get(["sync", "pausedUntil"]);
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
  await dropLegacyRules();
  createMenus();
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

// Remove any leftover dynamic rules from the old runtime filter import. These
// used to persist even when protection was toggled off and could break sites.
async function dropLegacyRules() {
  try {
    const rules = await chrome.declarativeNetRequest.getDynamicRules();
    const ids = rules.filter((r) => r.id >= LEGACY_LIST_BASE).map((r) => r.id);
    if (ids.length) {
      await chrome.declarativeNetRequest.updateDynamicRules({ removeRuleIds: ids });
    }
  } catch (e) {}
}

// Rebuild the allowlist rules (one allowAllRequests rule per whitelisted host).
async function syncAllowRules() {
  const { allowlist = [] } = await chrome.storage.local.get("allowlist");
  const existing = await chrome.declarativeNetRequest.getDynamicRules();
  const removeRuleIds = existing
    .filter((r) => r.id >= ALLOW_RULE_BASE && r.id < LEGACY_LIST_BASE)
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
        ["enabled", "blockedTotal", "savedBytes", "smartBlocked", "allowlist", "features", "theme", "sync", "pausedUntil"],
        async (data) => {
          let host = null;
          let allowed = false;
          if (msg.tabUrl) {
            host = hostFromUrl(msg.tabUrl);
            allowed = await isAllowlisted(host);
          }
          const blockedTotal = data.blockedTotal || 0;
          sendResponse({
            enabled: data.enabled !== false,
            blockedTotal,
            saved: savedStats(data.savedBytes || 0, blockedTotal),
            allowlist: data.allowlist || [],
            features: data.features || DEFAULTS.features,
            theme: data.theme || "carbon",
            filterCount: FILTER_COUNT,
            smartBlocked: data.smartBlocked || 0,
            sync: !!data.sync,
            pausedUntil: data.pausedUntil || 0,
            host,
            allowed,
          });
        }
      );
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

    case "importSettings":
      chrome.storage.local.set(msg.data || {}, async () => {
        await applyState();
        await syncAllowRules();
        await syncUserRules();
        sendResponse({ ok: true });
      });
      return true;

    case "smartHit": {
      const items = Array.isArray(msg.items) ? msg.items : [];
      const n = items.length || msg.n || 1;
      chrome.storage.local.get(["smartBlocked", "smartLog"], (d) => {
        const now = Date.now();
        const entries = items.map((it) => ({
          host: msg.host || "",
          w: it.w,
          h: it.h,
          reason: it.reason,
          time: now,
        }));
        const log = entries.concat(d.smartLog || []).slice(0, 50);
        chrome.storage.local.set({
          smartBlocked: (d.smartBlocked || 0) + n,
          smartLog: log,
        });
      });
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
