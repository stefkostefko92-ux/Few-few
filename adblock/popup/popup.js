const $ = (id) => document.getElementById(id);
const t = (key, subs) => (window.saI18n ? window.saI18n.t(key, subs) : "") || FALLBACK[key] || key;
// English fallback keeps the popup readable even if a locale misses a key.
const FALLBACK = {
  protected: "Protected", paused: "Paused", blockingHere: "Blocking ads on this page",
  protectionOff: "Protection is off", pause30: "Pause for 30 minutes",
  pausedResume: "Paused, resume now ($1m left)", blocking: "Blocking", allowed: "Allowed",
  on: "On", off: "Off", thisPage: "this page", filtersCount: "$1+ filters",
  logUnavailable: "Log unavailable right now (browser quota) — try again in a minute.",
  reviewBlocked: "$1 requests blocked so far",
  allowedFor: "Allowed · $1 min left", hiddenHere: "Elements you hid here: $1 · Undo the last",
  conn_block: "Block here", conn_blocked: "Blocked here", conn_hint: "Block what this site loads from $1",
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
let siteBlocked = []; // hosts blocked on this site from "Connections on this page"
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
        // allowed for a while (the repair page's "for 1 hour"): the label says how long is left
        if (res.allowed && res.allowedUntil > Date.now()) {
          allowLabel.textContent = t("allowedFor", [String(Math.max(1, Math.round((res.allowedUntil - Date.now()) / 60000)))]);
        }
      } else {
        siteHost.textContent = t("thisPage");
        allowToggle.disabled = true;
        cosmToggle.disabled = true;
      }

      // what the picker hid on this site: one click brings the last one back
      renderUndo(currentHost ? res.hiddenHere || 0 : 0);
      siteBlocked = Array.isArray(res.siteBlocked) ? res.siteBlocked : [];
      // ★ преди мерене (заема място в долната лента), картата след него (покрива каквото покрива)
      renderRate(res.review);
      fitPopup();
      showReviewCard(res.review, res.blockedTotal);
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

// Chrome показва popup-а най-много 600 px висок; на дългите езици текстът се пренася и съдържанието
// минава тавана → скролбар. Тогава — по-стегнати отстояния (html.tight); а ако надписите в долната
// лента не се събират — само иконите (.foot.compact; текстът остава името на линка, title — подсказка).
function fitPopup() {
  const root = document.documentElement;
  root.classList.remove("tight");
  if (document.body.getBoundingClientRect().bottom > 600) root.classList.add("tight");
  const foot = document.querySelector(".foot");
  foot.classList.remove("compact");
  const labels = [...foot.querySelectorAll(".links a:not([hidden]) span")];
  if (labels.some((s) => s.scrollWidth > s.clientWidth + 1)) {
    foot.classList.add("compact");
    for (const s of labels) if (!s.parentElement.title) s.parentElement.title = s.textContent.trim();
  }
  // ↶ N next to the picker: a one-word label that cannot wrap ("Կարգավորումներ", "Einstellungen")
  // would push the row wider than the popup — then Settings shows only its gear (the word stays
  // its name and tooltip), like the footer above
  const actions = document.querySelector(".actions");
  const settings = $("settingsBtn");
  actions.classList.remove("squeeze");
  if (actions.scrollWidth > actions.clientWidth + 1) {
    actions.classList.add("squeeze");
    if (!settings.title) settings.title = settings.textContent.trim();
  }
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

// "Connections on this page": asked from the page only when the box is opened (no cost
// otherwise). A blocked host loads nothing any more, so it is added from the stored list.
function loadConnections() {
  if (currentTabId == null || !currentHost) { $("conns").hidden = true; return; }
  chrome.tabs.sendMessage(currentTabId, { type: "getConnections" }, { frameId: 0 }, (res) => {
    void chrome.runtime.lastError; // no content script there (store pages, chrome://): just the stored ones
    const rows = new Map();
    for (const it of res && res.ok && Array.isArray(res.hosts) ? res.hosts : []) rows.set(it.host, it.n);
    for (const h of siteBlocked) if (!rows.has(h)) rows.set(h, 0);
    renderConnections([...rows]);
  });
}
function renderConnections(rows) {
  const ul = $("connList");
  ul.textContent = "";
  $("conns").hidden = false;
  $("connEmpty").hidden = rows.length > 0;
  for (const [host, n] of rows) {
    const li = document.createElement("li");
    const name = document.createElement("span");
    name.className = "host";
    name.textContent = host;
    name.title = host;
    const cnt = document.createElement("span");
    cnt.className = "type";
    cnt.textContent = n ? "×" + n.toLocaleString(UI_LANG) : "";
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "conn-block";
    const show = (blocked) => {
      btn.setAttribute("aria-pressed", String(blocked));
      btn.textContent = blocked ? t("conn_blocked") : t("conn_block");
      btn.title = t("conn_hint", [host]);
    };
    show(siteBlocked.includes(host));
    btn.addEventListener("click", () => {
      const block = btn.getAttribute("aria-pressed") !== "true";
      btn.disabled = true;
      chrome.runtime.sendMessage({ type: "siteBlock", site: currentHost, host, block }, (r) => {
        btn.disabled = false;
        if (r && r.ok) { siteBlocked = r.hosts; show(block); }
      });
    });
    if (n) li.append(name, cnt, btn); else li.append(name, btn);
    ul.appendChild(li);
  }
}
$("logBox").addEventListener("toggle", () => { if ($("logBox").open) loadConnections(); });

function renderUndo(n) {
  const b = $("undoBtn");
  b.hidden = !n;
  if (!n) return;
  const count = n.toLocaleString(UI_LANG);
  const label = t("hiddenHere", [count]);
  $("undoCount").textContent = count;
  b.title = label;
  b.setAttribute("aria-label", label);
}
$("undoBtn").addEventListener("click", () => {
  if (!currentHost) return;
  chrome.runtime.sendMessage({ type: "undoHidden", host: currentHost }, (r) => {
    renderUndo(r && r.ok ? r.left : 0);
    fitPopup();
    if ($("undoBtn").hidden) $("pickBtn").focus(); // the button the keyboard was on is gone
  });
});

// Keyboard shortcuts in the tooltips (chrome.commands; the user may have changed or removed them).
try {
  chrome.commands.getAll((cmds) => {
    const keys = {};
    for (const c of cmds || []) if (c.shortcut) keys[c.name] = c.shortcut;
    const hint = (el, name) => { if (el && keys[name]) el.title = (el.title || el.textContent.trim()) + " (" + keys[name] + ")"; };
    hint(pauseBtn, "pause");
    hint($("pickBtn"), "picker");
    hint(allowToggle.closest("label"), "toggle-site");
  });
} catch {}

document.addEventListener("DOMContentLoaded", load);

$("reportBtn").addEventListener("click", () => {
  chrome.tabs.create({ url: chrome.runtime.getURL("report/report.html?tab=" + currentTabId) });
  window.close();
});

// Отзив в Chrome Web Store: тиха ★ в долната лента + най-много два пъти карта след реална полза.
// Кога — решава service worker-ът (reviewDue в background.js), тук само се рисува; Настройки махат
// и двете. Нищо не се праща никъде: линкът отваря страницата с отзивите в магазина, нищо повече.
const review = $("review");
let reviewShown = false;

function renderRate(rv) {
  if (!rv || !rv.url || !rv.on) return;
  $("rate").href = rv.url;
  $("rate").hidden = false;
}

function showReviewCard(rv, blocked) {
  if (!rv || !rv.url || !rv.on || !rv.ask || reviewShown) return; // load() се вика пак след пауза — веднъж на отваряне
  reviewShown = true;
  $("reviewTitle").textContent = t("reviewBlocked", [blocked.toLocaleString(UI_LANG)]);
  $("reviewGo").href = rv.url;
  review.hidden = false;
  // каквото листът покрива, не взема фокус (WCAG 2.4.11) — става inert, докато листът е тук
  // (offsetTop, не getBoundingClientRect: анимацията на влизане го отмества с transform)
  const top = review.offsetTop;
  for (const el of document.querySelectorAll("main > *, .foot")) {
    if (!el.hidden && el.getBoundingClientRect().bottom > top) el.inert = true;
  }
  chrome.runtime.sendMessage({ type: "review", action: "shown" });
}

function closeReview() {
  if (review.hidden || review.classList.contains("out")) return;
  const hadFocus = review.contains(document.activeElement);
  const done = () => {
    review.hidden = true;
    review.classList.remove("out");
    document.querySelectorAll("[inert]").forEach((el) => (el.inert = false));
    if (hadFocus) document.querySelector("main").focus({ preventScroll: true }); // не на body: Tab продължава от съдържанието
  };
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) return done();
  review.classList.add("out");
  setTimeout(done, 200);
}

// отзивът е оставен (или поне отворен) — картата повече не идва; ★ остава, ако някой иска да го смени
function goReview(e) {
  e.preventDefault();
  const url = e.currentTarget.href;
  chrome.runtime.sendMessage({ type: "review", action: "done" }, () => {
    void chrome.runtime.lastError;
    chrome.tabs.create({ url });
    window.close();
  });
}
$("reviewGo").addEventListener("click", goReview);
$("rate").addEventListener("click", goReview);
$("reviewLater").addEventListener("click", closeReview);
$("reviewNever").addEventListener("click", () => {
  chrome.runtime.sendMessage({ type: "review", action: "done" });
  closeReview();
});
addEventListener("keydown", (e) => { if (e.key === "Escape" && !review.hidden) { e.preventDefault(); closeReview(); } });

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

// Liquid Glass: отблясъкът по стъклото следва курсора (CSS --mx/--my), веднъж на кадър.
// Без движение при reduced-motion — тогава остава на мястото си горе вляво.
if (!matchMedia("(prefers-reduced-motion: reduce)").matches) {
  let raf = 0, px = 0, py = 0;
  addEventListener("pointermove", (e) => {
    px = e.clientX; py = e.clientY;
    if (raf) return;
    raf = requestAnimationFrame(() => {
      raf = 0;
      const root = document.documentElement.style;
      root.setProperty("--mx", Math.round((px / innerWidth) * 100) + "%");
      root.setProperty("--my", Math.round((py / innerHeight) * 60 - 40) + "%");
    });
  }, { passive: true });
}
