// Few-Few AdBlocker - options page логика

const $ = (id) => document.getElementById(id);

function normalizeDomain(input) {
  let d = (input || "").trim().toLowerCase();
  d = d.replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/.*$/, "");
  return d;
}

function load() {
  chrome.storage.local.get(
    ["blockedTotal", "features", "allowlist", "customHidden"],
    (data) => {
      $("blockedTotal").textContent = (data.blockedTotal || 0).toLocaleString("bg-BG");

      const f = data.features || { cookies: true, antiAdblock: true };
      $("featCookies").checked = f.cookies !== false;
      $("featAab").checked = f.antiAdblock !== false;

      renderAllowlist(data.allowlist || []);
      renderCustom(data.customHidden || {});
    }
  );
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
      wrap.innerHTML = `<div class="domain">${domain}</div><div class="sel"></div>`;
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

$("featCookies").addEventListener("change", saveFeatures);
$("featAab").addEventListener("change", saveFeatures);

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
  });
});

document.addEventListener("DOMContentLoaded", load);
