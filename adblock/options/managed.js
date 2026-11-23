// 6.1: what an administrator's policy locks (docs/ENTERPRISE.md; lib/managed.js locks(), sent by getStats):
// those controls are drawn disabled with a note — the service worker refuses the change anyway. Uses $ and
// L from options.js (loaded before this file). Lists and allowed sites are drawn later, so a
// MutationObserver applies the locks to them as they appear (attributes only — it cannot loop).
(function () {
  let locks = null;
  const note = () => L("managedNote", "Set by your organization");
  const FEATURES = { cookies: "featCookies", antiAdblock: "featAab", meta: "featMeta", youtube: "featYoutube", smart: "featSmart",
    removeparam: "featRemoveparam", malware: "featMalware", topics: "featTopics", privacy: "featPrivacy", gpc: "featGpc" };
  const covered = (host, list) => list.some((d) => host === d || host.endsWith("." + d));
  function lock(el) {
    if (!el || el.disabled) return;
    el.disabled = true;
    el.title = note();
    const row = el.closest(".row");
    if (row) row.classList.add("managed");
  }
  function apply() {
    const k = locks;
    if (!k || !k.any) return;
    $("managedBanner").hidden = false;
    if (k.mode) lock($("modeSelect"));
    for (const f of k.features || []) lock($(FEATURES[f]));
    if (k.autoUpdate) lock($("autoUpdate"));
    if (k.reviewAsk) lock($("reviewAsk"));
    if (k.sync) lock($("syncToggle"));
    if (k.exceptions) { lock($("allowInput")); lock($("allowAdd")); }
    for (const input of document.querySelectorAll("input[data-list]")) if ((k.lists || []).includes(input.dataset.list)) lock(input);
    for (const btn of document.querySelectorAll("#allowList button[data-host]")) if (covered(btn.dataset.host, k.allowlist || [])) lock(btn);
  }
  window.saApplyLocks = (l) => { locks = l; apply(); };
  new MutationObserver(apply).observe(document.querySelector("main"), { childList: true, subtree: true });
})();
