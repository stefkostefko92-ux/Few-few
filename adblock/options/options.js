const $ = (id) => document.getElementById(id);

function normalizeDomain(input) {
  return (input || "")
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .replace(/\/.*$/, "");
}

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
  // Real saved figures come from the background (computed from per-type bytes).
  chrome.runtime.sendMessage({ type: "getStats" }, (res) => {
    if (!res) return;
    $("blockedTotal").textContent = res.blockedTotal.toLocaleString();
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
    $("smartCount").textContent = (res.smartBlocked || 0).toLocaleString();
    $("autoUpdate").checked = res.autoUpdate !== false;
    renderUpdateStatus(res.liveVersion || 0, res.liveUpdated || 0);
    renderAllowlist(res.allowlist || []);
  });

  chrome.storage.local.get(["customHidden", "userFilters", "smartLog"], (data) => {
    renderCustom(data.customHidden || {});
    $("userFilters").value = data.userFilters || "";
    renderSmartLog(data.smartLog || []);
  });
}

function renderUpdateStatus(version, updated) {
  if (!updated) return;
  $("updateStatus").textContent = `Filter set v${version}, updated ${ago(updated)}. Data only, nothing about you is sent.`;
}

function ago(ts) {
  const s = Math.max(0, (Date.now() - ts) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return Math.floor(s / 60) + "m ago";
  if (s < 86400) return Math.floor(s / 3600) + "h ago";
  return Math.floor(s / 86400) + "d ago";
}

function renderSmartLog(log) {
  const ul = $("smartLog");
  ul.innerHTML = "";
  if (!log.length) {
    ul.innerHTML = '<li class="empty">Nothing caught heuristically yet.</li>';
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
    s.textContent = `${e.reason} · ${e.w}×${e.h}`;
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
    ul.innerHTML = '<li class="empty">No allowlisted sites yet.</li>';
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
    ul.innerHTML = '<li class="empty">Nothing hidden manually yet.</li>';
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

$("autoUpdate").addEventListener("change", () =>
  chrome.runtime.sendMessage({ type: "setAutoUpdate", on: $("autoUpdate").checked })
);

$("updateNow").addEventListener("click", () => {
  const hint = $("updateHint");
  hint.textContent = "Updating…";
  chrome.runtime.sendMessage({ type: "updateFilters" }, (r) => {
    if (r && r.ok) {
      hint.textContent = `Updated (v${r.version}, ${r.domains} extra rules)`;
      load();
    } else {
      hint.textContent = "Update failed (" + ((r && r.reason) || "no response") + ")";
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
    hint.textContent = "Saved ✓";
    setTimeout(() => (hint.textContent = ""), 2500);
  });
});

$("resetStats").addEventListener("click", () => {
  chrome.runtime.sendMessage({ type: "resetStats" }, () => {
    $("blockedTotal").textContent = "0";
    $("savedData").textContent = "0 KB";
    $("savedTime").textContent = "0 s";
  });
});

// ---- Backup ----
const EXPORT_KEYS = ["enabled", "allowlist", "features", "customHidden", "theme"];

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
      alert("Invalid settings file.");
    }
  };
  reader.readAsText(file);
});

document.addEventListener("DOMContentLoaded", load);
