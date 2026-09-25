const $ = (id) => document.getElementById(id);

// A host exactly as Chrome and declarativeNetRequest see it: lowercase ASCII,
// IDN converted to punycode (URL does that), no scheme / path / port / www.
// "пример.бг" used to be stored raw — DNR rejects it, and because allowlist
// rule updates are atomic, every later allowlist change silently failed too.
function normalizeDomain(input) {
  let s = (input || "").trim();
  if (!s) return "";
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(s)) s = "http://" + s;
  try {
    return new URL(s).hostname.replace(/^www\./, "").replace(/\.$/, "");
  } catch {
    return "";
  }
}

// Localised text (fallback: the English source string) and numbers/units/relative
// times in the browser's own language — "55 мин.", "4,6 GB", "преди 5 минути".
const L = (key, fallback, subs) => (window.saI18n && window.saI18n.t(key, subs)) || fallback;
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

// The footer version comes from the manifest — it said "v5.0.0" through 5.0.5.
try { $("extVersion").textContent = chrome.runtime.getManifest().version; } catch {}

function load() {
  // Real saved figures come from the background (computed from per-type bytes).
  chrome.runtime.sendMessage({ type: "getStats" }, (res) => {
    if (!res) return;
    $("blockedTotal").textContent = res.blockedTotal.toLocaleString(UI_LANG);
    $("savedData").textContent = fmtData(res.saved.mb);
    $("savedTime").textContent = fmtTime(res.saved.seconds);

    $("theme").value = res.theme || "carbon";
    $("syncToggle").checked = !!res.sync;
    $("featCookies").checked = res.features.cookies !== false;
    $("featAab").checked = res.features.antiAdblock !== false;
    $("featMeta").checked = res.features.meta !== false;
    $("featYoutube").checked = res.features.youtube !== false;
    $("featSmart").checked = res.features.smart !== false;
    $("featRemoveparam").checked = res.features.removeparam !== false;
    $("featMalware").checked = res.features.malware === true;
    $("featTopics").checked = res.features.topics !== false;
    $("featPrivacy").checked = res.features.privacy !== false;
    $("smartCount").textContent = (res.smartBlocked || 0).toLocaleString(UI_LANG);
    $("autoUpdate").checked = res.autoUpdate !== false;
    renderUpdateStatus(res.liveVersion || 0, res.liveUpdated || 0);
    renderHealth();
    renderSubs();
    renderAllowlist(res.allowlist || []);
  });

  chrome.storage.local.get(["customHidden", "userFilters", "smartLog"], (data) => {
    renderCustom(data.customHidden || {});
    $("userFilters").value = data.userFilters || "";
    renderSmartLog(data.smartLog || []);
  });
}

function renderHealth() {
  chrome.runtime.sendMessage({ type: "getHealth" }, (h) => {
    const ul = $("healthList");
    if (!ul) return;
    ul.innerHTML = "";
    if (!h) { emptyRow(ul, L("opt_no_sw", "No response from the service worker.")); return; }
    const rows = [
      [L("opt_h_engine", "Anti-adblock engine"), h.engineRegistered ? "registered (MAIN world, document_start)" : "NOT registered" + (h.scriptletsError ? " — " + h.scriptletsError : ""), h.engineRegistered],
      [L("opt_h_rulesets", "Static rulesets on"), h.enabledRulesets.length ? h.enabledRulesets.join(", ") : "none", h.enabledRulesets.length > 0],
      [L("opt_h_live", "Live filter domains"), String(h.dynamic.live) + (h.liveVersion ? " (filter set v" + h.liveVersion + ", " + ago(h.liveUpdated) + ")" : " (no update yet)"), !h.liveError],
      [L("opt_h_last", "Last update"), h.liveError ? "failed: " + h.liveError : h.liveUpdated ? "ok, " + ago(h.liveUpdated) : "not yet", !h.liveError],
      [L("opt_h_sig", "Update signatures"), h.ed25519 ? "Ed25519 verified (" + h.keys + " key" + (h.keys === 1 ? "" : "s") + ")" : "browser cannot verify Ed25519 — best-effort", h.ed25519],
      [L("opt_h_user", "My filters / allowlist rules"), h.dynamic.user + " / " + h.dynamic.allow, true],
      [L("opt_h_popup", "Popup-ad hosts baked"), String(h.popupHosts), h.popupHosts > 0],
      [L("opt_h_yt", "YouTube bypass"), h.dynamic.ytBypass ? "ACTIVE (ads allowed on YouTube until it expires)" : "inactive", !h.dynamic.ytBypass],
    ];
    for (const [k, v, good] of rows) {
      const li = document.createElement("li");
      const left = document.createElement("div");
      const d = document.createElement("div"); d.className = "domain"; d.textContent = k;
      const s = document.createElement("div"); s.className = "sel"; s.textContent = v;
      left.append(d, s);
      const dot = document.createElement("span"); dot.className = "status"; dot.textContent = good ? "OK" : "!"; dot.style.color = good ? "#00e5ff" : "#ff5a5a";
      li.append(left, dot);
      ul.appendChild(li);
    }
  });
}

// ---- Filter lists / Focus mode ----
// Rows come from rules/lists.json via the service worker. Language names are the
// browser's own (Intl.DisplayNames), list names are proper names (not translated).
const LIST_TEXT = {
  ubo: ["opt_list_ubo", "uBlock Origin filters", "opt_list_ubo_desc", "Ads, trackers, anti-adblock fixes and site repairs from the uBlock Origin team."],
  plowe: ["opt_list_plowe", "Peter Lowe's list", "opt_list_plowe_desc", "A long-running list of ad and tracking servers."],
  "focus-social": ["opt_focus_social", "Social media buttons and widgets", "opt_focus_social_desc", "Share buttons, like boxes and embedded feeds."],
  "focus-chat": ["opt_focus_chat", "Chat and support widgets", "opt_focus_chat_desc", "The floating chat bubbles in the corner of the page."],
  "focus-newsletters": ["opt_focus_newsletters", "Newsletter and sign-up pop-ups", "opt_focus_newsletters_desc", "“Subscribe to our newsletter” boxes and overlays."],
  "focus-notifications": ["opt_focus_notifications", "Notification prompts", "opt_focus_notifications_desc", "“Allow notifications?” boxes that sites show before the browser asks."],
  "focus-ai": ["opt_focus_ai", "AI assistant pop-ups", "opt_focus_ai_desc", "Chatbot bubbles and AI suggestion panels added to pages."],
  "focus-other": ["opt_focus_other", "Other annoyances", "opt_focus_other_desc", "Sticky bars, “open in app” banners and similar clutter."],
};
let langNames = null;
try { langNames = new Intl.DisplayNames([UI_LANG], { type: "language" }); } catch {}
const langName = (code) => { try { return (langNames && langNames.of(code)) || code; } catch { return code; } };

function listRow(e) {
  const row = document.createElement("label");
  row.className = "row";
  const left = document.createElement("div");
  const title = document.createElement("div");
  title.className = "row-title";
  const sub = document.createElement("div");
  sub.className = "row-sub";
  const txt = LIST_TEXT[e.id];
  if (txt) {
    title.textContent = L(txt[0], txt[1]);
    sub.textContent = L(txt[2], txt[3]);
  } else {
    const names = (e.langs || []).slice(0, 4).map(langName);
    const t = names.join(", ") + ((e.langs || []).length > 4 ? "…" : "");
    title.textContent = t.charAt(0).toLocaleUpperCase(UI_LANG) + t.slice(1);
    sub.textContent = e.title;
  }
  if (e.group === "regional" && (e.defaultOn || e.langMatch)) {
    const b = document.createElement("span");
    b.className = "badge-lang";
    b.textContent = e.defaultOn ? L("opt_badge_lang", "your language") : L("opt_badge_recommended", "recommended for your language");
    title.appendChild(b);
  }
  const meta = [];
  if (e.delivery === "remote") {
    const b = document.createElement("span");
    b.className = "badge-remote";
    let host = "";
    try { host = new URL(e.url).hostname; } catch {}
    b.textContent = L("opt_badge_remote", "from its author");
    b.title = L("opt_remote_hint", "Not bundled (no licence to redistribute it): your browser downloads it from " + host + " when you turn it on.", [host]);
    title.appendChild(b);
    if (e.on && e.remoteError) meta.push(L("opt_failed_colon", "failed: " + e.remoteError, [e.remoteError]));
    else if (e.on && e.fetched) meta.push(L("opt_rules_count", e.remoteRules + " rules", [e.remoteRules.toLocaleString(UI_LANG)]) + " · " + L("opt_updated_ago", "updated " + ago(e.fetched), [ago(e.fetched)]));
    else meta.push(L("opt_downloaded_from", "Downloaded from " + host, [host]));
  } else if (typeof e.network === "number") {
    meta.push(L("opt_rules_count", e.network + " rules", [e.network.toLocaleString(UI_LANG)]));
  }
  const lic = document.createElement("a");
  lic.href = e.homepage;
  lic.target = "_blank";
  lic.rel = "noopener";
  lic.textContent = e.license;
  const metaEl = document.createElement("div");
  metaEl.className = "row-sub";
  metaEl.append(meta.join(" · ") + (meta.length ? " · " : ""), lic);
  left.append(title, sub, metaEl);
  const sw = document.createElement("label");
  sw.className = "switch";
  const input = document.createElement("input");
  input.type = "checkbox";
  input.checked = !!e.on;
  input.setAttribute("aria-label", title.textContent);
  input.addEventListener("change", () => {
    input.disabled = true;
    chrome.runtime.sendMessage({ type: "setList", id: e.id, on: input.checked }, () => renderLists());
  });
  const slider = document.createElement("span");
  slider.className = "slider";
  sw.append(input, slider);
  row.append(left, sw);
  return row;
}

function renderLists() {
  chrome.runtime.sendMessage({ type: "getLists" }, (res) => {
    if (!res) return;
    const err = $("listsError");
    err.hidden = !res.error;
    err.textContent = res.error ? L("opt_lists_error", "Chrome refused this combination of lists (" + res.error + "). Turn some off.", [res.error]) : "";
    const byGroup = { core: [], regional: [], focus: [] };
    for (const e of res.lists) (byGroup[e.group] || []).push(e);
    const rank = (e) => (e.defaultOn || e.langMatch ? 1 : 0);
    byGroup.regional.sort((a, b) => (rank(b) - rank(a)) || langName(a.langs[0]).localeCompare(langName(b.langs[0]), UI_LANG));
    for (const [g, id] of [["core", "listsCore"], ["regional", "listsRegional"], ["focus", "listsFocus"]]) {
      const box = $(id);
      box.textContent = "";
      for (const e of byGroup[g]) box.appendChild(listRow(e));
    }
  });
}
renderLists();

function renderUpdateStatus(version, updated) {
  if (!updated) return;
  $("updateStatus").textContent = L("opt_filter_status", `Filter set v${version}, updated ${ago(updated)}. Data only, nothing about you is sent.`, [String(version), ago(updated)]);
}

function ago(ts) {
  const s = Math.max(0, (Date.now() - ts) / 1000);
  let rtf;
  try { rtf = new Intl.RelativeTimeFormat(UI_LANG, { numeric: "auto" }); } catch { rtf = null; }
  const f = (v, u) => (rtf ? rtf.format(-v, u) : v + " " + u + " ago");
  if (s < 60) return rtf ? rtf.format(0, "second") : "just now";
  if (s < 3600) return f(Math.floor(s / 60), "minute");
  if (s < 86400) return f(Math.floor(s / 3600), "hour");
  return f(Math.floor(s / 86400), "day");
}

function emptyRow(ul, text) {
  const li = document.createElement("li");
  li.className = "empty";
  li.textContent = text;
  ul.appendChild(li);
}

function renderSmartLog(log) {
  const ul = $("smartLog");
  ul.innerHTML = "";
  if (!log.length) {
    emptyRow(ul, L("opt_empty_smart", "Nothing caught heuristically yet."));
    return;
  }
  log.forEach((e) => {
    const li = document.createElement("li");
    const left = document.createElement("div");
    const d = document.createElement("div");
    d.className = "domain";
    d.textContent = e.host || "(frame)";
    const s = document.createElement("div");
    s.className = "sel";
    const reason = { "Ad-sized cross-origin frame": L("opt_reason_frame", e.reason), "Sticky banner ad": L("opt_reason_sticky", e.reason) }[e.reason] || e.reason;
    s.textContent = `${reason} · ${e.w}×${e.h}`;
    left.append(d, s);
    const t = document.createElement("span");
    t.className = "sel";
    t.textContent = ago(e.time);
    li.append(left, t);
    ul.appendChild(li);
  });
}

function renderAllowlist(list) {
  const ul = $("allowList");
  ul.innerHTML = "";
  if (!list.length) {
    emptyRow(ul, L("opt_empty_allow", "No allowlisted sites yet."));
    return;
  }
  list.forEach((domain) => {
    const li = document.createElement("li");
    const span = document.createElement("span");
    span.className = "domain";
    span.textContent = domain;
    const btn = document.createElement("button");
    btn.className = "remove";
    btn.textContent = "×";
    btn.title = "Remove";
    btn.onclick = () =>
      chrome.runtime.sendMessage({ type: "setAllow", host: domain, allow: false }, (res) =>
        renderAllowlist(res?.allowlist || [])
      );
    li.append(span, btn);
    ul.appendChild(li);
  });
}

function renderCustom(map) {
  const ul = $("customList");
  ul.innerHTML = "";
  const domains = Object.keys(map);
  if (!domains.length) {
    emptyRow(ul, L("opt_empty_hidden", "Nothing hidden manually yet."));
    return;
  }
  domains.forEach((domain) => {
    (map[domain] || []).forEach((sel, idx) => {
      const li = document.createElement("li");
      const wrap = document.createElement("div");
      const d = document.createElement("div");
      d.className = "domain";
      d.textContent = domain;
      const s = document.createElement("div");
      s.className = "sel";
      s.textContent = sel;
      wrap.append(d, s);
      const btn = document.createElement("button");
      btn.className = "remove";
      btn.textContent = "×";
      btn.onclick = () => removeCustom(domain, idx);
      li.append(wrap, btn);
      ul.appendChild(li);
    });
  });
}

function removeCustom(domain, idx) {
  chrome.storage.local.get("customHidden", (data) => {
    const map = data.customHidden || {};
    if (!map[domain]) return;
    map[domain].splice(idx, 1);
    if (!map[domain].length) delete map[domain];
    chrome.storage.local.set({ customHidden: map }, () => renderCustom(map));
  });
}

function saveFeatures() {
  chrome.runtime.sendMessage({
    type: "setFeatures",
    features: {
      cookies: $("featCookies").checked,
      antiAdblock: $("featAab").checked,
      meta: $("featMeta").checked,
      youtube: $("featYoutube").checked,
      smart: $("featSmart").checked,
      removeparam: $("featRemoveparam").checked,
      malware: $("featMalware").checked,
      topics: $("featTopics").checked,
      privacy: $("featPrivacy").checked,
    },
  });
}

$("theme").addEventListener("change", () =>
  chrome.runtime.sendMessage({ type: "setTheme", theme: $("theme").value })
);
$("syncToggle").addEventListener("change", () =>
  chrome.runtime.sendMessage({ type: "setSync", on: $("syncToggle").checked })
);
$("featCookies").addEventListener("change", saveFeatures);
$("featAab").addEventListener("change", saveFeatures);
$("featMeta").addEventListener("change", saveFeatures);
$("featYoutube").addEventListener("change", saveFeatures);
$("featSmart").addEventListener("change", saveFeatures);
$("featRemoveparam").addEventListener("change", saveFeatures);
$("featMalware").addEventListener("change", saveFeatures);
$("featTopics").addEventListener("change", saveFeatures);
$("featPrivacy").addEventListener("change", saveFeatures);

$("autoUpdate").addEventListener("change", () =>
  chrome.runtime.sendMessage({ type: "setAutoUpdate", on: $("autoUpdate").checked })
);

$("updateNow").addEventListener("click", () => {
  const hint = $("updateHint");
  hint.textContent = L("opt_updating", "Updating…");
  chrome.runtime.sendMessage({ type: "updateFilters" }, (r) => {
    if (r && r.ok) {
      hint.textContent = L("opt_updated", `Updated (v${r.version}, ${r.domains} extra rules)`, [String(r.version), String(r.domains)]);
      load();
    } else {
      const why = (r && r.reason) || L("opt_no_response", "no response");
      hint.textContent = L("opt_update_failed", "Update failed (" + why + ")", [why]);
    }
    setTimeout(() => (hint.textContent = ""), 4000);
  });
});

$("allowAdd").addEventListener("click", () => {
  const domain = normalizeDomain($("allowInput").value);
  if (!domain) return;
  chrome.runtime.sendMessage({ type: "setAllow", host: domain, allow: true }, (res) => {
    $("allowInput").value = "";
    renderAllowlist(res?.allowlist || []);
  });
});
$("allowInput").addEventListener("keydown", (e) => {
  if (e.key === "Enter") $("allowAdd").click();
});

$("saveFilters").addEventListener("click", () => {
  chrome.runtime.sendMessage({ type: "setUserFilters", text: $("userFilters").value }, () => {
    const hint = $("filtersSaved");
    hint.textContent = L("opt_saved", "Saved ✓");
    setTimeout(() => (hint.textContent = ""), 2500);
  });
});

// Subscriptions: the service worker fetches the list as TEXT, keeps only the
// lines it can apply (sanitised), writes them as a managed block into "My
// filters" and refreshes daily.
function renderSubs() {
  chrome.runtime.sendMessage({ type: "getSubscriptions" }, (res) => {
    const ul = $("subList");
    if (!ul) return;
    ul.innerHTML = "";
    const subs = (res && res.subscriptions) || [];
    if (!subs.length) { emptyRow(ul, L("opt_empty_subs", "No subscribed lists yet.")); return; }
    for (const s of subs) {
      const li = document.createElement("li");
      const wrap = document.createElement("div");
      const d = document.createElement("div"); d.className = "domain"; d.textContent = s.url;
      const meta = document.createElement("div"); meta.className = "sel";
      meta.textContent = s.error
        ? L("opt_failed_colon", "failed: " + s.error, [s.error])
        : L("opt_rules_count", s.count + " rules", [String(s.count)]) + " · " +
          (s.fetched ? L("opt_updated_ago", "updated " + ago(s.fetched), [ago(s.fetched)]) : L("opt_not_fetched", "not fetched yet"));
      wrap.append(d, meta);
      const btn = document.createElement("button"); btn.className = "remove"; btn.textContent = "×"; btn.title = L("opt_remove", "Remove");
      btn.onclick = () => chrome.runtime.sendMessage({ type: "removeSubscription", url: s.url }, () => { renderSubs(); load(); });
      li.append(wrap, btn);
      ul.appendChild(li);
    }
  });
}

$("importList").addEventListener("click", () => {
  const hint = $("importHint");
  const url = ($("listUrl").value || "").trim();
  if (!/^https:\/\/[^ ]+$/.test(url)) { hint.textContent = L("opt_enter_https", "Enter a valid https:// URL"); return; }
  hint.textContent = L("opt_fetching", "Fetching…");
  chrome.runtime.sendMessage({ type: "addSubscription", url }, (r) => {
    if (r && r.ok) { hint.textContent = L("opt_subscribed_ok", "Subscribed: " + r.count + " rules ✓", [String(r.count)]); $("listUrl").value = ""; renderSubs(); load(); }
    else { const why = (r && r.reason) || L("opt_no_response", "no response"); hint.textContent = L("opt_failed_paren", "Failed (" + why + ")", [why]); }
    setTimeout(() => (hint.textContent = ""), 4000);
  });
});
$("subsRefresh").addEventListener("click", () => {
  const hint = $("importHint");
  hint.textContent = L("opt_refreshing", "Refreshing…");
  chrome.runtime.sendMessage({ type: "refreshSubscriptions" }, () => { hint.textContent = L("opt_refreshed", "Refreshed ✓"); renderSubs(); load(); setTimeout(() => (hint.textContent = ""), 3000); });
});

$("healthRefresh").addEventListener("click", renderHealth);

$("resetStats").addEventListener("click", () => {
  chrome.runtime.sendMessage({ type: "resetStats" }, () => {
    $("blockedTotal").textContent = "0";
    $("savedData").textContent = fmtData(0);
    $("savedTime").textContent = fmtTime(0);
  });
});

// ---- Backup ----
const EXPORT_KEYS = ["enabled", "allowlist", "features", "customHidden", "theme", "subscriptions", "noCosmetics", "userFilters"];

$("exportBtn").addEventListener("click", () => {
  chrome.storage.local.get(EXPORT_KEYS, (data) => {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "supreme-adblock-settings.json";
    a.click();
    URL.revokeObjectURL(a.href);
  });
});

$("importBtn").addEventListener("click", () => $("importFile").click());
$("importFile").addEventListener("change", (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const data = JSON.parse(reader.result);
      chrome.runtime.sendMessage({ type: "importSettings", data }, () => load());
    } catch {
      alert(L("opt_invalid_file", "Invalid settings file."));
    }
  };
  reader.readAsText(file);
});

document.addEventListener("DOMContentLoaded", load);
