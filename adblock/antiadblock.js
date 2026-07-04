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

    for (const el of document.querySelectorAll("div, section, aside, dialog, [role='dialog']")) {
      const s = getComputedStyle(el);
      const floating = s.position === "fixed" || s.position === "sticky";
      const elevated = parseInt(s.zIndex || "0", 10) > 1000;
      if ((floating || elevated) && isWall(el)) el.remove();
    }

    for (const n of [document.documentElement, document.body]) {
      if (!n) continue;
      n.style.setProperty("overflow", "auto", "important");
      n.style.setProperty("position", "static", "important");
      n.style.removeProperty("filter");
    }
  }

  function enable() {
    active = true;
    document.documentElement.classList.add("tbab-aab");
    cleanup();
    // Throttle: scanning every element is costly, so cap it on busy pages.
    let queued = false;
    new MutationObserver(() => {
      if (queued) return;
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

  chrome.storage?.local.get(["enabled", "features"], (data) => {
    if (data.enabled !== false && (data.features || {}).antiAdblock !== false) enable();
  });

  chrome.storage?.onChanged.addListener((changes) => {
    if (!changes.features) return;
    const on = (changes.features.newValue || {}).antiAdblock !== false;
    if (on && !active) enable();
    else if (!on) {
      active = false;
      document.documentElement.classList.remove("tbab-aab");
    }
  });
})();
