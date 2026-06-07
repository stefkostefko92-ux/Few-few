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

  function loadCustom(map) {
    customSelectors = [];
    for (const [domain, sels] of Object.entries(map || {})) {
      if (hostMatches(domain)) customSelectors = customSelectors.concat(sels);
    }
  }

  chrome.storage?.local.get(["enabled", "allowlist", "customHidden"], (data) => {
    enabled = data.enabled !== false;
    const allowed = (data.allowlist || []).some(hostMatches);
    loadCustom(data.customHidden);
    if (enabled && !allowed) start();
  });

  chrome.storage?.onChanged.addListener((changes) => {
    if (changes.enabled) {
      enabled = changes.enabled.newValue !== false;
      if (enabled) start();
    }
    if (changes.customHidden) {
      loadCustom(changes.customHidden.newValue);
      if (enabled) hide();
    }
  });

  function start() {
    hide();
    collapseEmpty();

    new MutationObserver((mutations) => {
      if (!enabled) return;
      for (const m of mutations) {
        for (const node of m.addedNodes) {
          if (node.nodeType === 1) hide(node.parentNode || document);
        }
      }
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
