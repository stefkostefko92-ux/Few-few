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
// What the 3D shield shows: protected / paused (timed) / off / allowed (this site is on the allowlist).
const S = { enabled: true, paused: false, allowed: false };

// Numbers and units in the browser's language: "55 мин.", "4,6 GB", "43 709+".
const UI_LANG = (() => { try { return chrome.i18n.getUILanguage(); } catch { return "en"; } })();
function unit(v, u, digits = 0) {
  try { return new Intl.NumberFormat(UI_LANG, { style: "unit", unit: u, unitDisplay: "short", maximumFractionDigits: digits }).format(v); }
  catch { return v.toFixed(digits) + " " + u; }
}
function fmtData(mb) {
  if (mb >= 1024) return unit(mb / 1024, "gigabyte", 1);
  if (mb >= 1) return unit(Math.round(mb), "megabyte");
  return unit(Math.round(mb * 1024), "kilobyte");
}

function fmtTime(sec) {
  if (sec >= 3600) return unit(sec / 3600, "hour", 1);
  if (sec >= 60) return unit(Math.round(sec / 60), "minute");
  if (sec >= 10) return unit(Math.round(sec), "second");
  return unit(sec > 0 ? sec : 0, "second", 1);
}

function load() {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    const tabUrl = tabs[0]?.url || "";
    currentTabId = tabs[0]?.id ?? null;
    chrome.runtime.sendMessage({ type: "getStats", tabUrl }, (res) => {
      if (!res) return;
      toggle.checked = res.enabled;
      blockedTotal.textContent = res.blockedTotal.toLocaleString(UI_LANG);
      if (res.cookieRejections > 0) {
        $("rejText").textContent = t("cookieRejections", [res.cookieRejections.toLocaleString(UI_LANG)]);
        $("rejLine").hidden = false;
      }
      savedData.textContent = fmtData(res.saved.mb);
      savedTime.textContent = fmtTime(res.saved.seconds);
      currentHost = res.host;
      S.allowed = !!res.allowed;
      S.paused = (res.pausedUntil || 0) > Date.now();
      setStatus(res.enabled);

      listDot.textContent = t("filtersCount", [(res.filterCount || 0).toLocaleString(UI_LANG)]);
      renderPause(res.pausedUntil || 0);

      $("reportBtn").hidden = !currentHost;
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

// "What was blocked on this page": how many requests each filter list stopped
// in this tab, from declarativeNetRequestFeedback (local, nothing leaves the device).
function loadLog() {
  const list = $("logList");
  const empty = $("logEmpty");
  const count = $("logCount");
  if (currentTabId == null) return;
  chrome.runtime.sendMessage({ type: "getTabLog", tabId: currentTabId }, (res) => {
    list.innerHTML = "";
    if (res && res.reason === "unsupported") { $("logBox").hidden = true; return; } // Firefox: no getMatchedRules
    if (!res || !res.ok) {
      empty.textContent = res && res.reason === "quota" ? t("logUnavailable") : empty.textContent;
      empty.hidden = false;
      count.textContent = "0";
      return;
    }
    count.textContent = String(res.total);
    empty.hidden = res.items.length > 0;
    // Chrome reports WHICH rule matched, not the request URL (that exists only
    // for unpacked builds) — so the log is an honest per-list breakdown.
    const LIST_LABEL = {
      easylist: () => "EasyList", easyprivacy: () => "EasyPrivacy",
      core: () => t("logCore"), youtube: () => t("logYouTube"), params: () => t("logParams"),
      malware: () => t("logMalware"), surrogates: () => t("logSurrogates"), privacy: () => t("logPrivacy"),
      user: () => t("logUser"), live: () => t("logLive"),
      ubo: () => "uBlock Origin", plowe: () => "Peter Lowe", regional: () => t("logRegional"),
      focus: () => t("logFocus"), lists: () => t("logRegional"),
    };
    for (const it of res.items) {
      const li = document.createElement("li");
      const name = document.createElement("span");
      name.className = "host";
      name.textContent = (LIST_LABEL[it.list] || LIST_LABEL.core)();
      const n = document.createElement("span");
      n.className = "type";
      n.textContent = "×" + it.n;
      li.append(name, n);
      list.appendChild(li);
    }
  });
}

function setStatus(enabled) {
  S.enabled = enabled;
  const allowedHere = enabled && S.allowed && !!currentHost;
  heroTitle.textContent = allowedHere ? t("allowed") : enabled ? t("protected") : t("paused");
  statusText.textContent = allowedHere ? currentHost : enabled ? t("blockingHere") : t("protectionOff");
  hero.classList.toggle("off", !enabled);
  // read by popup.css and shield3d.js (colour + light of the shield)
  hero.dataset.state = !enabled ? (S.paused ? "paused" : "off") : allowedHere ? "allowed" : "protected";
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
  S.allowed = !blocking;
  setStatus(toggle.checked);
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
  S.paused = paused;
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

$("reportBtn").addEventListener("click", () => {
  chrome.tabs.create({ url: chrome.runtime.getURL("report/report.html?tab=" + currentTabId) });
  window.close();
});

// 3D щитът (popup/shield3d.js) се зарежда чак СЛЕД първото рисуване: още една заявка към
// разширението на критичния път струва ~40 ms до първия кадър (измерено), а статичният кадър
// е в CSS. Без reduced-motion/-data и без автоматизация файлът изобщо не се иска.
if (!navigator.webdriver && !matchMedia("(prefers-reduced-motion: reduce), (prefers-reduced-data: reduce)").matches) {
  addEventListener("load", () => requestAnimationFrame(() => setTimeout(() => {
    const s = document.createElement("script");
    s.src = "shield3d.js";
    document.head.appendChild(s);
  }, 0)));
}
