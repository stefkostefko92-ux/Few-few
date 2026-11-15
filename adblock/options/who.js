// "Who we stopped" (6.0): the companies whose servers we kept the browser from contacting in the
// last 30 days — counted in the service worker (lib/who.js), shown here. Uses $, L and UI_LANG from
// options.js (loaded before this file). Hidden where the browser does not report our blocks (Firefox).
function renderWho(items) {
  const list = $("whoList");
  list.textContent = "";
  const max = Math.max(1, ...items.map((x) => x.n));
  for (const it of items) {
    const li = document.createElement("li");
    const head = document.createElement("div");
    head.className = "who-head";
    const name = document.createElement("span");
    name.className = "who-name";
    name.textContent = it.name;
    const n = document.createElement("span");
    n.className = "who-n";
    n.textContent = L("opt_who_row", "$1 requests · $2 days", [it.n.toLocaleString(UI_LANG), it.days.toLocaleString(UI_LANG)]);
    head.append(name, n);
    const bar = document.createElement("span");
    bar.className = "who-bar";
    bar.setAttribute("aria-hidden", "true");
    bar.style.setProperty("--w", Math.max(2, Math.round((it.n / max) * 100)) + "%");
    li.append(head, bar);
    list.appendChild(li);
  }
  $("whoEmpty").hidden = items.length > 0;
}

function loadWho() {
  chrome.runtime.sendMessage({ type: "getWho" }, (res) => {
    void chrome.runtime.lastError;
    if (!res || !res.ok || !res.supported) { $("whoCard").hidden = true; return; }
    $("whoCard").hidden = false;
    renderWho(Array.isArray(res.items) ? res.items : []);
  });
}

loadWho();
$("resetStats").addEventListener("click", () => renderWho([]));
