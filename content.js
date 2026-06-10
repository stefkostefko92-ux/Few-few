// Cosmetic filtering: hide ad containers that survive network blocking.
(function () {
  let enabled = true;
  let customSelectors = [];

  const host = location.hostname.replace(/^www\./, "");
  const hostMatches = (d) => host === d || host.endsWith("." + d);

  const AD_SELECTORS = [
    "[id^='google_ads_']",
    "[id^='div-gpt-ad']",
    "[id^='gpt-']",
    "[id*='-ad-']",
    "[id*='_ad_']",
    "[id^='ad-']",
    "[id$='-ad']",
    "[id*='banner-ad']",
    "[id*='adsense']",
    "[id*='dfp-']",
    "[class*='ad-banner']",
    "[class*='ad-container']",
    "[class*='ad-wrapper']",
    "[class*='ad-slot']",
    "[class*='ad-unit']",
    "[class*='ad-placeholder']",
    "[class*='advertisement']",
    "[class*='advert-']",
    "[class*='sponsored']",
    "[class*='-sponsor']",
    "[class*='adsbygoogle']",
    "[class^='ad-']",
    "[class$='-ad']",
    "[class$='-ads']",
    "[class*=' ad ']",
    "[class*='dfp-']",
    "[class*='gpt-ad']",
    "[class*='outbrain']",
    "[class*='taboola']",
    "[data-ad-slot]",
    "[data-ad-client]",
    "[data-ad-unit]",
    "[data-ad]",
    "[data-google-query-id]",
    "[data-adunit]",
    "ins.adsbygoogle",
    "iframe[src*='doubleclick']",
    "iframe[src*='googlesyndication']",
    "iframe[src*='googleads']",
    "iframe[src*='/ads/']",
    "iframe[src*='adserver']",
    "iframe[src*='adservice']",
    "iframe[src*='amazon-adsystem']",
    "iframe[src*='taboola']",
    "iframe[src*='outbrain']",
    "iframe[id*='google_ads']",
    "iframe[id*='ad_iframe']",
    "iframe[name*='google_ads']",
    "[aria-label='Advertisement']",
    "[aria-label='Ad']",
    ".taboola",
    ".outbrain",
    ".trc_related_container",
    "#taboola-below-article",
    ".OUTBRAIN",
    ".ob-widget",
    ".mgbox",
    ".revcontent",
    ".sponsored-content",
    ".promoted-content",
  ];

  function hide(root = document) {
    if (!enabled) return;
    for (const sel of AD_SELECTORS.concat(customSelectors)) {
      let nodes;
      try {
        nodes = root.querySelectorAll(sel);
      } catch {
        continue;
      }
      for (const el of nodes) {
        if (el.dataset.tbabHidden) continue;
        el.dataset.tbabHidden = "1";
        el.style.setProperty("display", "none", "important");
      }
    }
  }

  // Collapse wrappers left empty after their only (ad) child is hidden.
  function collapseEmpty() {
    if (!enabled) return;
    document.querySelectorAll("[data-tbab-hidden]").forEach((el) => {
      const p = el.parentElement;
      if (p && p.children.length === 1 && p.offsetHeight < 5) {
        p.style.setProperty("display", "none", "important");
      }
    });
  }

  // Cosmetic selectors come from the picker (customHidden) and the user's
  // "My filters" cosmetic lines (`##selector` or `domain##selector`).
  let pickerMap = {};
  let userText = "";

  function rebuildSelectors() {
    customSelectors = [];
    for (const [domain, sels] of Object.entries(pickerMap || {})) {
      if (hostMatches(domain)) customSelectors = customSelectors.concat(sels);
    }
    for (let line of (userText || "").split("\n")) {
      line = line.trim();
      const i = line.indexOf("##");
      if (i === -1 || line.startsWith("!")) continue;
      const dom = line.slice(0, i).trim();
      const sel = line.slice(i + 2).trim();
      if (sel && (!dom || hostMatches(dom))) customSelectors.push(sel);
    }
  }

  chrome.storage?.local.get(
    ["enabled", "allowlist", "customHidden", "userFilters"],
    (data) => {
      enabled = data.enabled !== false;
      const allowed = (data.allowlist || []).some(hostMatches);
      pickerMap = data.customHidden || {};
      userText = data.userFilters || "";
      rebuildSelectors();
      if (enabled && !allowed) start();
    }
  );

  chrome.storage?.onChanged.addListener((changes) => {
    if (changes.enabled) {
      enabled = changes.enabled.newValue !== false;
      if (enabled) {
        start();
        hide();
      }
    }
    if (changes.customHidden || changes.userFilters) {
      if (changes.customHidden) pickerMap = changes.customHidden.newValue || {};
      if (changes.userFilters) userText = changes.userFilters.newValue || "";
      rebuildSelectors();
      if (enabled) hide();
    }
  });

  let started = false;
  function start() {
    if (started) return; // guard against repeated enable toggles
    started = true;
    hide();
    collapseEmpty();

    // Coalesce DOM mutations into at most one scan per frame.
    let scheduled = false;
    new MutationObserver(() => {
      if (!enabled || scheduled) return;
      scheduled = true;
      requestAnimationFrame(() => {
        scheduled = false;
        hide();
      });
    }).observe(document.documentElement, { childList: true, subtree: true });

    // A few delayed passes catch lazily injected ads.
    let runs = 0;
    const t = setInterval(() => {
      if (!enabled || runs++ > 10) return clearInterval(t);
      hide();
      collapseEmpty();
    }, 1000);
  }
})();
