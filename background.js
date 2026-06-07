// Service worker: rule toggling, allowlist, stats and messaging.

const RULESET_IDS = ["ad_rules", "youtube_rules"];
const FILTER_COUNT = 247; // bundled static rules (ad_rules + youtube_rules)

// Dynamic-rule id ranges, kept clear of the static rulesets.
const ALLOW_RULE_BASE = 90000;   // allowlist (allowAllRequests)
const LEGACY_LIST_BASE = 100000; // old imported-filter rules — cleaned up on load

// Real average payload per blocked resource type (bytes). We count the exact
// number blocked of each type, so only the per-type size is an estimate — the
// same approach uBlock/AdGuard use, since a blocked request is never downloaded
// and its true size can't be known.
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
  allowlist: [],
  features: { cookies: true, antiAdblock: true, meta: true, youtube: true },
  customHidden: {},
  theme: "carbon",
};

chrome.runtime.onInstalled.addListener(async () => {
  const stored = await chrome.storage.local.get(Object.keys(DEFAULTS));
  const patch = {};
  for (const [k, v] of Object.entries(DEFAULTS)) {
    if (stored[k] === undefined) patch[k] = v;
  }
  if (Object.keys(patch).length) await chrome.storage.local.set(patch);
  await applyState();
  await syncAllowRules();
  await dropLegacyRules();
});

chrome.runtime.onStartup.addListener(async () => {
  await applyState();
  await syncAllowRules();
  await dropLegacyRules();
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
  chrome.action.setBadgeBackgroundColor({ color: on ? "#c8102e" : "#5a5a5a" });
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

// ---------- Blocked-request accounting ----------
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

// ---------- Helpers ----------
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

// ---------- Messaging ----------
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  switch (msg.type) {
    case "toggle":
      chrome.storage.local.set({ enabled: msg.enabled }, async () => {
        await applyState();
        sendResponse({ ok: true });
      });
      return true;

    case "getStats":
      chrome.storage.local.get(
        ["enabled", "blockedTotal", "savedBytes", "allowlist", "features", "theme"],
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
      chrome.storage.local.set({ blockedTotal: 0, savedBytes: 0 }, () => sendResponse({ ok: true }));
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
