// Few-Few AdBlocker - anti-adblock neutralizer
// Маха модалните "изключи adblocker-а" прозорци, премахва наложените
// overlay-и и възстановява скрола/видимостта на страницата.

(function () {
  "use strict";

  let active = false;

  // Текстови сигнали в overlay-и, които искат изключване на adblocker.
  const HINTS = [
    "adblock",
    "ad blocker",
    "ad-blocker",
    "блокер на реклами",
    "изключете",
    "whitelist",
    "disable your ad",
  ];

  function looksLikeAabOverlay(el) {
    const t = (el.textContent || "").toLowerCase();
    if (t.length > 600) return false; // твърде голям -> вероятно цялата страница
    return HINTS.some((h) => t.includes(h));
  }

  function cleanup() {
    if (!active) return;

    // Премахни фиксирани overlay-и с anti-adblock текст.
    const candidates = document.querySelectorAll(
      "div, section, aside, dialog, [role='dialog']"
    );
    candidates.forEach((el) => {
      const style = getComputedStyle(el);
      const fixed = style.position === "fixed" || style.position === "sticky";
      const highZ = parseInt(style.zIndex || "0", 10) > 1000;
      if ((fixed || highZ) && looksLikeAabOverlay(el)) {
        el.remove();
      }
    });

    // Възстанови скрола/интеракцията, които overlay-ите често блокират.
    const html = document.documentElement;
    const body = document.body;
    [html, body].forEach((n) => {
      if (!n) return;
      n.style.setProperty("overflow", "auto", "important");
      n.style.setProperty("position", "static", "important");
      n.style.removeProperty("filter");
    });
  }

  function enable() {
    active = true;
    document.documentElement.classList.add("fewfew-aab");
    cleanup();
    const obs = new MutationObserver(() => cleanup());
    if (document.documentElement) {
      obs.observe(document.documentElement, { childList: true, subtree: true });
    }
    let n = 0;
    const iv = setInterval(() => {
      if (!active || n++ > 10) return clearInterval(iv);
      cleanup();
    }, 700);
  }

  chrome.storage?.local.get(["enabled", "features"], (data) => {
    const on = data.enabled !== false;
    const aab = (data.features || {}).antiAdblock !== false;
    if (on && aab) enable();
  });

  chrome.storage?.onChanged.addListener((changes) => {
    if (changes.features) {
      const aab = (changes.features.newValue || {}).antiAdblock !== false;
      if (aab && !active) enable();
      else if (!aab) {
        active = false;
        document.documentElement.classList.remove("fewfew-aab");
      }
    }
  });
})();
