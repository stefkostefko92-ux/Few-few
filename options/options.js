// Few-Few AdBlocker - options page логика

const $ = (id) => document.getElementById(id);

function normalizeDomain(input) {
  let d = (input || "").trim().toLowerCase();
  d = d.replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/.*$/, "");
  return d;
}

function fmtData(mb) {
  if (mb >= 1024) return (mb / 1024).toFixed(1) + " GB";
  if (mb >= 1) return Math.round(mb) + " MB";
  return Math.round(mb * 1024) + " KB";
}
function fmtTime(sec) {
  if (sec >= 3600) return (sec / 3600).toFixed(1) + " ч";
  if (sec >= 60) return Math.round(sec / 60) + " мин";
  return Math.round(sec) + " сек";
}

const AVG_AD_KB = 55;
const AVG_AD_MS = 45;

function load() {
  chrome.storage.local.get(
    ["blockedTotal", "features", "allowlist", "customHidden", "theme", "autoUpdate", "listInfo"],
    (data) => {
      const total = data.blockedTotal || 0;
      $("blockedTotal").textContent = total.toLocaleString("bg-BG");
      $("savedData").textContent = fmtData((total * AVG_AD_KB) / 1024);
      $("savedTime").textContent = fmtTime((total * AVG_AD_MS) / 1000);

      $("theme").value = data.theme || "carbon";

      const f = data.features || { cookies: true, antiAdblock: true };
      $("featCookies").checked = f.cookies !== false;
      $("featAab").checked = f.antiAdblock !== false;

      $("autoUpdate").checked = data.autoUpdate !== false;
      renderListStatus(data.listInfo || { count: 0, updated: null });

      renderAllowlist(data.allowlist || []);
      renderCustom(data.customHidden || {});
    }
  );
}

function renderListStatus(info) {
  const el = $("listStatus");
  if (info.count && info.updated) {
    const d = new Date(info.updated);
    el.textContent = `${info.count.toLocaleString("bg-BG")} филтъра · обновени ${d.toLocaleString("bg-BG")}`;
  } else {
    el.textContent = "Тегли актуални филтри ежедневно (EasyList + EasyPrivacy)";
  }
}

function renderAllowlist(list) {
  const ul = $("allowList");
  ul.innerHTML = "";
  if (!list.length) {
    ul.innerHTML = '<li class="empty">Няма бели сайтове.</li>';
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
    btn.title = "Премахни";
    btn.onclick = () => {
      chrome.runtime.sendMessage(
        { type: "setAllow", host: domain, allow: false },
        (res) => renderAllowlist(res?.allowlist || [])
      );
    };
    li.append(span, btn);
    ul.appendChild(li);
  });
}

function renderCustom(map) {
  const ul = $("customList");
  ul.innerHTML = "";
  const domains = Object.keys(map);
  if (!domains.length) {
    ul.innerHTML = '<li class="empty">Още нямаш ръчно скрити елементи.</li>';
    return;
  }
  domains.forEach((domain) => {
    (map[domain] || []).forEach((sel, idx) => {
      const li = document.createElement("li");
      const wrap = document.createElement("div");
      wrap.innerHTML = `<div class="domain"></div><div class="sel"></div>`;
      wrap.querySelector(".domain").textContent = domain;
      wrap.querySelector(".sel").textContent = sel;
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
    if (map[domain]) {
      map[domain].splice(idx, 1);
      if (!map[domain].length) delete map[domain];
      chrome.storage.local.set({ customHidden: map }, () => renderCustom(map));
    }
  });
}

function saveFeatures() {
  const features = {
    cookies: $("featCookies").checked,
    antiAdblock: $("featAab").checked,
  };
  chrome.runtime.sendMessage({ type: "setFeatures", features });
}

$("theme").addEventListener("change", () => {
  chrome.runtime.sendMessage({ type: "setTheme", theme: $("theme").value });
});

$("featCookies").addEventListener("change", saveFeatures);
$("featAab").addEventListener("change", saveFeatures);

$("autoUpdate").addEventListener("change", () => {
  chrome.runtime.sendMessage({
    type: "setAutoUpdate",
    autoUpdate: $("autoUpdate").checked,
  });
});

$("updateNow").addEventListener("click", () => {
  const btn = $("updateNow");
  btn.disabled = true;
  btn.textContent = "Обновяване…";
  chrome.runtime.sendMessage({ type: "updateLists" }, (res) => {
    btn.disabled = false;
    btn.textContent = "Обнови сега";
    if (res?.listInfo) renderListStatus(res.listInfo);
  });
});

$("allowAdd").addEventListener("click", () => {
  const domain = normalizeDomain($("allowInput").value);
  if (!domain) return;
  chrome.runtime.sendMessage(
    { type: "setAllow", host: domain, allow: true },
    (res) => {
      $("allowInput").value = "";
      renderAllowlist(res?.allowlist || []);
    }
  );
});

$("allowInput").addEventListener("keydown", (e) => {
  if (e.key === "Enter") $("allowAdd").click();
});

$("resetStats").addEventListener("click", () => {
  chrome.runtime.sendMessage({ type: "resetStats" }, () => {
    $("blockedTotal").textContent = "0";
    $("savedData").textContent = "0 KB";
    $("savedTime").textContent = "0 сек";
  });
});

document.addEventListener("DOMContentLoaded", load);
