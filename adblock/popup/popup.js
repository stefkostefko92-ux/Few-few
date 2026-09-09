const $ = (id) => document.getElementById(id);
const t = (key, subs) => (window.saI18n ? window.saI18n.t(key, subs) : "") || FALLBACK[key] || key;
// English fallback keeps the popup readable even if a locale misses a key.
const FALLBACK = {
  protected: "Protected", paused: "Paused", blockingHere: "Blocking ads on this page",
  protectionOff: "Protection is off", pause30: "Pause for 30 minutes",
  pausedResume: "Paused, resume now ($1m left)", blocking: "Blocking", allowed: "Allowed",
  on: "On", off: "Off", thisPage: "this page", filtersCount: "$1+ filters",
  logUnavailable: "Log unavailable right now (browser quota) — try again in a minute.",
};

const toggle = $("toggle");
const hero = $("hero");
const heroTitle = $("heroTitle");
const statusText = $("statusText");
const blockedTotal = $("blockedTotal");
const savedData = $("savedData");
const savedTime = $("savedTime");
const siteHost = $("siteHost");
const allowToggle = $("allowToggle");
const allowLabel = $("allowLabel");
const cosmToggle = $("cosmToggle");
const cosmLabel = $("cosmLabel");
const listDot = $("listDot");

let currentHost = null;
let currentTabId = null;

function fmtData(mb) {
  if (mb >= 1024) return (mb / 1024).toFixed(1) + " GB";
  if (mb >= 1) return Math.round(mb) + " MB";
  return Math.round(mb * 1024) + " KB";
}

function fmtTime(sec) {
  if (sec >= 3600) return (sec / 3600).toFixed(1) + " h";
  if (sec >= 60) return Math.round(sec / 60) + " min";
  if (sec >= 10) return Math.round(sec) + " s";
  if (sec > 0) return sec.toFixed(1) + " s";
  return "0 s";
}

function load() {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    const tabUrl = tabs[0]?.url || "";
    currentTabId = tabs[0]?.id ?? null;
    chrome.runtime.sendMessage({ type: "getStats", tabUrl }, (res) => {
      if (!res) return;
      toggle.checked = res.enabled;
      blockedTotal.textContent = res.blockedTotal.toLocaleString();
      savedData.textContent = fmtData(res.saved.mb);
      savedTime.textContent = fmtTime(res.saved.seconds);
      setStatus(res.enabled);

      listDot.textContent = t("filtersCount", [String(res.filterCount || 0)]);
      renderPause(res.pausedUntil || 0);

      currentHost = res.host;
      if (currentHost) {
        siteHost.textContent = currentHost;
        allowToggle.checked = !res.allowed;
        setAllowLabel(!res.allowed);
        cosmToggle.checked = !res.noCosmetics;
        setCosmLabel(!res.noCosmetics);
        cosmToggle.disabled = !!res.allowed;
      } else {
        siteHost.textContent = t("thisPage");
        allowToggle.disabled = true;
        cosmToggle.disabled = true;
      }
    });
    loadLog();
  });
}

// "What was blocked on this page": our own matched rules for this tab, from
// declarativeNetRequestFeedback (local, nothing leaves the device).
function loadLog() {
  const list = $("logList");
  const empty = $("logEmpty");
  const count = $("logCount");
  if (currentTabId == null) return;
  chrome.runtime.sendMessage({ type: "getTabLog", tabId: currentTabId }, (res) => {
    list.innerHTML = "";
    if (!res || !res.ok) {
      empty.textContent = res && res.reason === "quota" ? t("logUnavailable") : empty.textContent;
      empty.hidden = false;
      count.textContent = "0";
      return;
    }
    count.textContent = String(res.total);
    empty.hidden = res.items.length > 0;
    for (const it of res.items) {
      const li = document.createElement("li");
      const host = document.createElement("span");
      host.className = "host";
      host.textContent = it.host;
      const type = document.createElement("span");
      type.className = "type";
      type.textContent = it.type + (it.n > 1 ? " ×" + it.n : "");
      li.append(host, type);
      list.appendChild(li);
    }
  });
}

function setStatus(enabled) {
  heroTitle.textContent = enabled ? t("protected") : t("paused");
  statusText.textContent = enabled ? t("blockingHere") : t("protectionOff");
  hero.classList.toggle("off", !enabled);
}

function setAllowLabel(blocking) {
  allowLabel.textContent = blocking ? t("blocking") : t("allowed");
}

function setCosmLabel(on) {
  cosmLabel.textContent = on ? t("on") : t("off");
}

toggle.addEventListener("change", () => {
  setStatus(toggle.checked);
  chrome.runtime.sendMessage({ type: "toggle", enabled: toggle.checked });
});

function reloadActiveTab() {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (tabs[0]) chrome.tabs.reload(tabs[0].id);
  });
}

allowToggle.addEventListener("change", () => {
  if (!currentHost) return;
  const blocking = allowToggle.checked;
  setAllowLabel(blocking);
  chrome.runtime.sendMessage({ type: "setAllow", host: currentHost, allow: !blocking }, reloadActiveTab);
});

cosmToggle.addEventListener("change", () => {
  if (!currentHost) return;
  const on = cosmToggle.checked;
  setCosmLabel(on);
  chrome.runtime.sendMessage({ type: "setNoCosmetics", host: currentHost, off: !on }, reloadActiveTab);
});

const pauseBtn = $("pauseBtn");
const pauseLabel = $("pauseLabel");
let paused = false;

function renderPause(until) {
  paused = until > Date.now();
  pauseBtn.classList.toggle("paused", paused);
  if (paused) {
    const mins = Math.max(1, Math.round((until - Date.now()) / 60000));
    pauseLabel.textContent = t("pausedResume", [String(mins)]);
  } else {
    pauseLabel.textContent = t("pause30");
  }
}

pauseBtn.addEventListener("click", () => {
  const type = paused ? "resume" : "pause";
  chrome.runtime.sendMessage({ type, minutes: 30 }, () => load());
});

$("pickBtn").addEventListener("click", () => {
  chrome.runtime.sendMessage({ type: "startPicker" }, () => window.close());
});

$("settingsBtn").addEventListener("click", () => chrome.runtime.openOptionsPage());

document.addEventListener("DOMContentLoaded", load);
