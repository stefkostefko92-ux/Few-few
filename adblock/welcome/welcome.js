// Страницата „Добре дошли“ — отваря се веднъж, само при първа инсталация (background.js).
// Нищо не праща навън. Всичко тук е по желание: защитата вече работи. Бързите избори
// ползват същите съобщения като Настройките (setFeatures / setList), вносът от друг
// блокер — същия lib/foreign.js и същата проверка в service worker-а, клавишите идват
// от браузъра (потребителят може да ги е сменил).
const $ = (id) => document.getElementById(id);
const L = (key, fallback, subs) => (window.saI18n && window.saI18n.t(key, subs)) ||
  String(fallback || "").replace(/\$(\d)/g, (m, i) => (subs && subs[i - 1] != null ? subs[i - 1] : m));
const UI_LANG = (() => { try { return chrome.i18n.getUILanguage(); } catch { return "en"; } })();
const send = (msg) => new Promise((res) => chrome.runtime.sendMessage(msg, res));

$("settings").addEventListener("click", () => chrome.runtime.openOptionsPage());
$("done").addEventListener("click", () => {
  chrome.tabs.getCurrent((tab) => {
    if (tab && tab.id !== undefined) chrome.tabs.remove(tab.id);
    else window.close();
  });
});

// ---- is the icon pinned? ----
// Само отговорът на браузъра за тази лента (getUserSettings от Chrome 91, промяната на живо —
// onUserSettingsChanged от Chrome 130). Без API-то стъпката остава обикновен съвет.
function showPin(s, live) {
  const pinned = !!(s && s.isOnToolbar);
  $("pinStep").dataset.pin = pinned ? "done" : "todo";
  $("pinTitle").textContent = pinned ? L("welPinnedTitle", "Pinned to the toolbar") : L("welPinTitle", "Pin it to the toolbar");
  $("pinText").textContent = pinned
    ? L("welPinnedText", "One click on its icon shows what was blocked on the page.")
    : L("welPinText", "Click the puzzle-piece icon next to the address bar and pin Supreme AdBlock. One click then shows what was blocked on the page.");
  if (live && pinned) $("pinLive").textContent = L("welPinnedTitle", "Pinned to the toolbar");
}
try {
  if (chrome.action && chrome.action.getUserSettings) {
    Promise.resolve(chrome.action.getUserSettings()).then((s) => showPin(s, false), () => {});
    if (chrome.action.onUserSettingsChanged) chrome.action.onUserSettingsChanged.addListener((s) => showPin(s, true));
  }
} catch {}

// ---- quick choices ----
(async () => {
  const [stats, lists] = await Promise.all([send({ type: "getStats" }), send({ type: "getLists" })]);
  const features = (stats && stats.features) || {};
  const on = new Map(((lists && lists.lists) || []).map((e) => [e.id, !!e.on]));
  for (const box of document.querySelectorAll(".quick input[type=checkbox]")) {
    const f = box.dataset.feature, id = box.dataset.list;
    if (f) box.checked = features[f] !== false;
    else if (id) {
      if (!on.has(id)) { box.closest(".opt").hidden = true; continue; }
      box.checked = on.get(id);
    }
    box.addEventListener("change", async () => {
      box.disabled = true;
      if (f) {
        // setFeatures stores the whole object: read it fresh, change one key
        const cur = ((await send({ type: "getStats" })) || {}).features || {};
        await send({ type: "setFeatures", features: Object.assign({}, cur, { [f]: box.checked }) });
      } else {
        const r = await send({ type: "setList", id, on: box.checked });
        if (!r || !r.ok) box.checked = !box.checked;
      }
      box.disabled = false;
    });
  }
})();

// ---- import from another ad blocker ----
$("foreignBtn").addEventListener("click", () => $("foreignFile").click());
$("foreignFile").addEventListener("change", async (e) => {
  const file = e.target.files[0];
  e.target.value = "";
  if (!file) return;
  const hint = $("foreignHint");
  const bad = () => { hint.textContent = L("opt_import_foreign_bad", "This file isn't a backup we can read."); };
  if (file.size > 10 * 1024 * 1024) return bad();
  let parsed = null;
  try { parsed = window.ForeignImport.parse(await file.text(), file.name); } catch {}
  if (!parsed || parsed.error) return bad();
  const r = await send({ type: "importForeign", allowlist: parsed.allowlist, filters: parsed.filters });
  if (!r || !r.ok) return bad();
  const n = (v) => Number(v || 0).toLocaleString(UI_LANG);
  let text = L("opt_import_foreign_done", "Sites allowed: $1 · Filters added: $2", [n(r.sites), n(r.filters)]);
  if (r.skipped) text += " · " + L("opt_import_foreign_skipped", "Left out (can't be applied here): $1", [n(r.skipped)]);
  hint.textContent = text;
});

// ---- keyboard shortcuts (only the ones that have a key) ----
try {
  chrome.commands.getAll((cmds) => {
    const ul = $("keysList");
    for (const c of cmds || []) {
      if (!c.shortcut || !c.name || c.name.startsWith("_")) continue;
      const li = document.createElement("li");
      const k = document.createElement("kbd");
      k.textContent = c.shortcut;
      const d = document.createElement("span");
      d.textContent = c.description || c.name;
      li.append(k, d);
      ul.appendChild(li);
    }
    $("keysCard").hidden = !ul.children.length;
  });
} catch {}
