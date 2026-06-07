// Few-Few AdBlocker - background service worker
// Управлява: глобален toggle, allowlist (бели сайтове), брояч на блокирани
// заявки, динамични allow-правила и комуникация с popup/options/picker.

const RULESET_IDS = ["ad_rules", "youtube_rules"];

// Диапазон за динамичните allow-правила (allowlist). Стои далеч от статичните id-та.
const ALLOW_RULE_BASE = 90000;

const DEFAULTS = {
  enabled: true,
  blockedTotal: 0,
  allowlist: [],
  features: { cookies: true, antiAdblock: true },
  customHidden: {}, // { "domain.com": ["selector", ...] }
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
});

chrome.runtime.onStartup.addListener(async () => {
  await applyState();
  await syncAllowRules();
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
  chrome.action.setBadgeBackgroundColor({ color: on ? "#e53935" : "#9e9e9e" });
}

// ---- Allowlist: динамични allow-правила ----
// За всеки бял домейн добавяме allowAllRequests правило с висок приоритет,
// което пуска цялата йерархия от заявки на този сайт.
async function syncAllowRules() {
  const { allowlist = [] } = await chrome.storage.local.get("allowlist");

  const existing = await chrome.declarativeNetRequest.getDynamicRules();
  const removeIds = existing
    .filter((r) => r.id >= ALLOW_RULE_BASE)
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

// ---- Брояч на блокирани заявки ----
if (chrome.declarativeNetRequest.onRuleMatchedDebug) {
  chrome.declarativeNetRequest.onRuleMatchedDebug.addListener((info) => {
    // Не броим самите allow-правила.
    if (info?.rule?.ruleId >= ALLOW_RULE_BASE) return;
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

// ---- Помощни функции за allowlist ----
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

// ---- Съобщения от popup / options / content ----
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
        ["enabled", "blockedTotal", "allowlist", "features"],
        async (data) => {
          let host = null;
          let allowed = false;
          if (msg.tabUrl) {
            host = hostFromUrl(msg.tabUrl);
            allowed = await isAllowlisted(host);
          }
          sendResponse({
            enabled: data.enabled !== false,
            blockedTotal: data.blockedTotal || 0,
            allowlist: data.allowlist || [],
            features: data.features || DEFAULTS.features,
            host,
            allowed,
          });
        }
      );
      return true;

    case "setAllow": {
      // msg.host, msg.allow (true = разреши реклами тук => добави в allowlist)
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
    }

    case "setFeatures":
      chrome.storage.local.set({ features: msg.features }, () =>
        sendResponse({ ok: true })
      );
      return true;

    case "resetStats":
      chrome.storage.local.set({ blockedTotal: 0 }, () =>
        sendResponse({ ok: true })
      );
      return true;

    case "saveCustomSelector": {
      // От element picker-а: запазва селектор за дадения домейн.
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
    }

    case "startPicker":
      // Препраща към активния таб да активира picker режима.
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs[0]) {
          chrome.tabs.sendMessage(tabs[0].id, { type: "activatePicker" });
        }
        sendResponse({ ok: true });
      });
      return true;
  }
});
