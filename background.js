// Few-Few AdBlocker - background service worker
// Управлява: глобален toggle, allowlist, брояч на блокирани заявки + спестени
// данни/време, динамични allow-правила, авто-обновяване на филтрите (EasyList),
// тема и комуникация с popup/options/picker.

const RULESET_IDS = ["ad_rules", "youtube_rules"];

// Диапазони за динамичните правила (далеч от статичните id-та).
const ALLOW_RULE_BASE = 90000; // allowlist (allowAllRequests)
const LIST_RULE_BASE = 100000; // импортирани филтри (EasyList и др.)
const LIST_RULE_MAX = 5000; // таван на импортираните правила

// Източници за авто-обновяване (мрежови филтри в Adblock Plus формат).
const FILTER_SOURCES = [
  "https://easylist.to/easylist/easylist.txt",
  "https://easylist.to/easylist/easyprivacy.txt",
];

// Среден размер/време спестени на блокирана заявка (за статистиката).
const AVG_AD_KB = 55;
const AVG_AD_MS = 45;

const DEFAULTS = {
  enabled: true,
  blockedTotal: 0,
  allowlist: [],
  features: { cookies: true, antiAdblock: true },
  customHidden: {},
  theme: "carbon",
  autoUpdate: true,
  listInfo: { count: 0, updated: null },
};

// ---- Инициализация ----
chrome.runtime.onInstalled.addListener(async () => {
  const stored = await chrome.storage.local.get(Object.keys(DEFAULTS));
  const patch = {};
  for (const [k, v] of Object.entries(DEFAULTS)) {
    if (stored[k] === undefined) patch[k] = v;
  }
  if (Object.keys(patch).length) await chrome.storage.local.set(patch);
  await applyState();
  await syncAllowRules();
  scheduleUpdates();
  // Първоначално обновяване на филтрите (ако е разрешено).
  const { autoUpdate } = await chrome.storage.local.get("autoUpdate");
  if (autoUpdate !== false) updateBlocklists();
});

chrome.runtime.onStartup.addListener(async () => {
  await applyState();
  await syncAllowRules();
  scheduleUpdates();
});

// ---- Глобален toggle на статичните рулсети ----
async function applyState() {
  const { enabled } = await chrome.storage.local.get("enabled");
  const on = enabled !== false;
  try {
    await chrome.declarativeNetRequest.updateEnabledRulesets(
      on
        ? { enableRulesetIds: RULESET_IDS, disableRulesetIds: [] }
        : { enableRulesetIds: [], disableRulesetIds: RULESET_IDS }
    );
  } catch (e) {
    console.warn("Few-Few: неуспешно обновяване на ruleset", e);
  }
  chrome.action.setBadgeBackgroundColor({ color: on ? "#c8102e" : "#5a5a5a" });
}

// ---- Allowlist: динамични allow-правила ----
async function syncAllowRules() {
  const { allowlist = [] } = await chrome.storage.local.get("allowlist");
  const existing = await chrome.declarativeNetRequest.getDynamicRules();
  const removeIds = existing
    .filter((r) => r.id >= ALLOW_RULE_BASE && r.id < LIST_RULE_BASE)
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
    await chrome.declarativeNetRequest.updateDynamicRules({
      removeRuleIds: removeIds,
      addRules,
    });
  } catch (e) {
    console.warn("Few-Few: неуспешно обновяване на allow-правила", e);
  }
}

// ---- Авто-обновяване на филтрите (EasyList) ----
function scheduleUpdates() {
  chrome.alarms.create("ff-update", { periodInMinutes: 60 * 24 }); // дневно
}

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name !== "ff-update") return;
  const { autoUpdate } = await chrome.storage.local.get("autoUpdate");
  if (autoUpdate !== false) updateBlocklists();
});

// Парсва Adblock Plus мрежови правила от вида ||domain^ в домейни.
function parseFilterText(text) {
  const domains = new Set();
  const lines = text.split("\n");
  for (let line of lines) {
    line = line.trim();
    if (!line || line[0] === "!" || line[0] === "[") continue; // коментар/хедър
    if (line.startsWith("@@")) continue; // изключение
    if (line.includes("##") || line.includes("#?#") || line.includes("#@#"))
      continue; // козметично
    // ||domain^ (по желание с $опции, които игнорираме)
    const m = line.match(/^\|\|([a-z0-9][a-z0-9.\-_]*\.[a-z]{2,})\^/i);
    if (m) {
      const d = m[1].toLowerCase();
      if (!d.includes("*") && !d.includes("/")) domains.add(d);
    }
  }
  return [...domains];
}

async function updateBlocklists() {
  const all = new Set();
  for (const url of FILTER_SOURCES) {
    try {
      const res = await fetch(url, { cache: "no-cache" });
      if (!res.ok) continue;
      const text = await res.text();
      parseFilterText(text).forEach((d) => all.add(d));
    } catch (e) {
      console.warn("Few-Few: неуспешно теглене на филтър", url, e);
    }
  }

  let domains = [...all];
  if (!domains.length) return; // мрежова грешка -> запази старите правила
  if (domains.length > LIST_RULE_MAX) domains = domains.slice(0, LIST_RULE_MAX);

  const addRules = domains.map((domain, i) => ({
    id: LIST_RULE_BASE + i,
    priority: 1,
    action: { type: "block" },
    condition: {
      urlFilter: "||" + domain + "^",
      resourceTypes: [
        "script",
        "image",
        "sub_frame",
        "xmlhttprequest",
        "media",
        "ping",
        "font",
        "stylesheet",
        "object",
      ],
    },
  }));

  // Махни старите импортирани правила и сложи новите.
  const existing = await chrome.declarativeNetRequest.getDynamicRules();
  const removeIds = existing
    .filter((r) => r.id >= LIST_RULE_BASE)
    .map((r) => r.id);

  try {
    await chrome.declarativeNetRequest.updateDynamicRules({
      removeRuleIds: removeIds,
      addRules,
    });
    await chrome.storage.local.set({
      listInfo: { count: domains.length, updated: Date.now() },
    });
  } catch (e) {
    console.warn("Few-Few: неуспешно прилагане на филтрите", e);
  }
}

// ---- Брояч на блокирани заявки ----
if (chrome.declarativeNetRequest.onRuleMatchedDebug) {
  chrome.declarativeNetRequest.onRuleMatchedDebug.addListener((info) => {
    if (info?.rule?.ruleId >= ALLOW_RULE_BASE && info?.rule?.ruleId < LIST_RULE_BASE)
      return; // allow-правило, не броим
    incrementBlocked();
  });
}

let pending = 0;
let flushTimer = null;
function incrementBlocked() {
  pending++;
  if (flushTimer) return;
  flushTimer = setTimeout(async () => {
    const n = pending;
    pending = 0;
    flushTimer = null;
    const { blockedTotal = 0 } = await chrome.storage.local.get("blockedTotal");
    await chrome.storage.local.set({ blockedTotal: blockedTotal + n });
  }, 1000);
}

// ---- Badge брояч за активния таб ----
async function refreshBadge(tabId) {
  try {
    const { enabled } = await chrome.storage.local.get("enabled");
    if (enabled === false) {
      chrome.action.setBadgeText({ text: "", tabId });
      return;
    }
    const info = await chrome.declarativeNetRequest.getMatchedRules({ tabId });
    const count = info?.rulesMatchedInfo?.length || 0;
    chrome.action.setBadgeText({ text: count > 0 ? String(count) : "", tabId });
  } catch (e) {}
}

chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (changeInfo.status === "complete") refreshBadge(tabId);
});
chrome.tabs.onActivated.addListener(({ tabId }) => refreshBadge(tabId));

// ---- Помощни ----
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

function savedStats(blockedTotal) {
  return {
    mb: (blockedTotal * AVG_AD_KB) / 1024,
    seconds: (blockedTotal * AVG_AD_MS) / 1000,
  };
}

// ---- Съобщения ----
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
        ["enabled", "blockedTotal", "allowlist", "features", "theme", "autoUpdate", "listInfo"],
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
            saved: savedStats(blockedTotal),
            allowlist: data.allowlist || [],
            features: data.features || DEFAULTS.features,
            theme: data.theme || "carbon",
            autoUpdate: data.autoUpdate !== false,
            listInfo: data.listInfo || DEFAULTS.listInfo,
            host,
            allowed,
          });
        }
      );
      return true;

    case "setAllow":
      chrome.storage.local.get("allowlist", async (data) => {
        let list = data.allowlist || [];
        const host = msg.host;
        if (!host) return sendResponse({ ok: false });
        if (msg.allow) {
          if (!list.includes(host)) list.push(host);
        } else {
          list = list.filter((d) => d !== host);
        }
        await chrome.storage.local.set({ allowlist: list });
        await syncAllowRules();
        sendResponse({ ok: true, allowlist: list });
      });
      return true;

    case "setFeatures":
      chrome.storage.local.set({ features: msg.features }, () =>
        sendResponse({ ok: true })
      );
      return true;

    case "setTheme":
      chrome.storage.local.set({ theme: msg.theme }, () =>
        sendResponse({ ok: true })
      );
      return true;

    case "setAutoUpdate":
      chrome.storage.local.set({ autoUpdate: !!msg.autoUpdate }, () =>
        sendResponse({ ok: true })
      );
      return true;

    case "updateLists":
      updateBlocklists().then(async () => {
        const { listInfo } = await chrome.storage.local.get("listInfo");
        sendResponse({ ok: true, listInfo });
      });
      return true;

    case "resetStats":
      chrome.storage.local.set({ blockedTotal: 0 }, () =>
        sendResponse({ ok: true })
      );
      return true;

    case "saveCustomSelector":
      chrome.storage.local.get("customHidden", async (data) => {
        const map = data.customHidden || {};
        const host = msg.host;
        if (!host || !msg.selector) return sendResponse({ ok: false });
        map[host] = map[host] || [];
        if (!map[host].includes(msg.selector)) map[host].push(msg.selector);
        await chrome.storage.local.set({ customHidden: map });
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
