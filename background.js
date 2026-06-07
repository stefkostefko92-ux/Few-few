// Few-Few AdBlocker - background service worker
// Управлява брояча на блокирани заявки и глобалното включване/изключване.

const RULESET_ID = "ad_rules";

// Инициализация при инсталиране.
chrome.runtime.onInstalled.addListener(async () => {
  const { enabled } = await chrome.storage.local.get("enabled");
  if (enabled === undefined) {
    await chrome.storage.local.set({ enabled: true, blockedTotal: 0 });
  }
  await applyState();
});

chrome.runtime.onStartup.addListener(applyState);

// Прилага текущото състояние (включен/изключен) към статичния ruleset.
async function applyState() {
  const { enabled } = await chrome.storage.local.get("enabled");
  const on = enabled !== false;
  try {
    await chrome.declarativeNetRequest.updateEnabledRulesets(
      on
        ? { enableRulesetIds: [RULESET_ID], disableRulesetIds: [] }
        : { enableRulesetIds: [], disableRulesetIds: [RULESET_ID] }
    );
  } catch (e) {
    console.warn("Few-Few: неуспешно обновяване на ruleset", e);
  }
  updateBadgeColor(on);
}

function updateBadgeColor(on) {
  chrome.action.setBadgeBackgroundColor({ color: on ? "#e53935" : "#9e9e9e" });
}

// Брои блокираните заявки (изисква declarativeNetRequestFeedback).
if (chrome.declarativeNetRequest.onRuleMatchedDebug) {
  chrome.declarativeNetRequest.onRuleMatchedDebug.addListener(() => {
    incrementBlocked();
  });
}

// Алтернативно брояч чрез getMatchedRules периодично за per-tab статистика.
const tabBlocked = {};

async function incrementBlocked() {
  const { blockedTotal = 0 } = await chrome.storage.local.get("blockedTotal");
  await chrome.storage.local.set({ blockedTotal: blockedTotal + 1 });
}

// Обновява badge с броя блокирани реклами за активния таб.
async function refreshBadge(tabId) {
  try {
    const { enabled } = await chrome.storage.local.get("enabled");
    if (enabled === false) {
      chrome.action.setBadgeText({ text: "", tabId });
      return;
    }
    const info = await chrome.declarativeNetRequest.getMatchedRules({ tabId });
    const count = info?.rulesMatchedInfo?.length || 0;
    tabBlocked[tabId] = count;
    chrome.action.setBadgeText({
      text: count > 0 ? String(count) : "",
      tabId,
    });
  } catch (e) {
    // getMatchedRules може да изисква feedback permission - игнорираме тихо.
  }
}

chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (changeInfo.status === "complete") {
    refreshBadge(tabId);
  }
});

chrome.tabs.onActivated.addListener(({ tabId }) => {
  refreshBadge(tabId);
});

chrome.tabs.onRemoved.addListener((tabId) => {
  delete tabBlocked[tabId];
});

// Слуша съобщения от popup-а.
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === "toggle") {
    chrome.storage.local.set({ enabled: msg.enabled }, async () => {
      await applyState();
      sendResponse({ ok: true });
    });
    return true; // async response
  }
  if (msg.type === "getStats") {
    chrome.storage.local.get(["enabled", "blockedTotal"], (data) => {
      sendResponse({
        enabled: data.enabled !== false,
        blockedTotal: data.blockedTotal || 0,
      });
    });
    return true;
  }
});
