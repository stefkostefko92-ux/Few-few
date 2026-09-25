// Remove "disable your adblocker" walls and restore page scrolling/interaction.
(function () {
  let active = false;

  const HINTS = [
    "adblock",
    "ad blocker",
    "ad-blocker",
    "whitelist",
    "disable your ad",
    "turn off your ad",
  ];

  function isWall(el) {
    const t = (el.textContent || "").toLowerCase();
    if (t.length > 600) return false; // too big to be a modal
    return HINTS.some((h) => t.includes(h));
  }

  function cleanup() {
    if (!active) return;

    let removed = false;
    for (const el of document.querySelectorAll("div, section, aside, dialog, [role='dialog']")) {
      const s = getComputedStyle(el);
      const floating = s.position === "fixed" || s.position === "sticky";
      const elevated = parseInt(s.zIndex || "0", 10) > 1000;
      if ((floating || elevated) && isWall(el)) {
        el.remove();
        removed = true;
      }
    }

    // Only touch the page's scroll/layout after we actually removed a wall,
    // so we never force overflow/position on ordinary sites.
    if (!removed) return;
    for (const n of [document.documentElement, document.body]) {
      if (!n) continue;
      n.style.setProperty("overflow", "auto", "important");
      n.style.setProperty("position", "static", "important");
      n.style.removeProperty("filter");
    }
  }

  let wired = false;
  function enable() {
    active = true;
    document.documentElement.classList.add("tbab-aab");
    cleanup();
    if (wired) return; // observers / timers only once per page
    wired = true;
    // Throttle: scanning every element is costly, so cap it on busy pages. Only
    // added elements can bring a wall — text-only churn (a clock, a speed gauge)
    // must not trigger a scan of the whole page.
    let queued = false;
    const bringsElements = (r) => {
      for (const n of r.addedNodes) if (n.nodeType === 1) return true;
      return false;
    };
    new MutationObserver((records) => {
      if (queued || !records.some(bringsElements)) return;
      queued = true;
      setTimeout(() => {
        queued = false;
        cleanup();
      }, 500);
    }).observe(document.documentElement, { childList: true, subtree: true });
    let n = 0;
    const t = setInterval(() => {
      if (!active || n++ > 10) return clearInterval(t);
      cleanup();
    }, 700);
  }

  function disable() {
    active = false;
    document.documentElement.classList.remove("tbab-aab");
  }

  // Runs only when protection is on, the feature is on AND the site is not on
  // the allowlist — re-evaluated on every storage change (the allowlist is the
  // user's one per-site way out; it used to be ignored here).
  const pageHost = location.hostname.replace(/^www\./, "");
  const onList = (list) => (list || []).some((d) => pageHost === d || pageHost.endsWith("." + d));
  const st = { enabled: true, feature: true, allowed: false };
  function applyGate() {
    const want = st.enabled && st.feature && !st.allowed;
    if (want && !active) enable();
    else if (!want && active) disable();
  }
  chrome.storage?.local.get(["enabled", "features", "allowlist"], (data) => {
    st.enabled = data.enabled !== false;
    st.feature = (data.features || {}).antiAdblock !== false;
    st.allowed = onList(data.allowlist);
    applyGate();
  });
  chrome.storage?.onChanged.addListener((changes) => {
    if (changes.enabled) st.enabled = changes.enabled.newValue !== false;
    if (changes.features) st.feature = (changes.features.newValue || {}).antiAdblock !== false;
    if (changes.allowlist) st.allowed = onList(changes.allowlist.newValue);
    if (changes.enabled || changes.features || changes.allowlist) applyGate();
  });
})();
