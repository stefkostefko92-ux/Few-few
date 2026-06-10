// Cosmetic filtering: hide ad containers that survive network blocking.
(function () {
  let enabled = true;
  let smartEnabled = true;
  let customSelectors = [];

  const host = location.hostname.replace(/^www\./, "");
  const baseHost = host.split(".").slice(-2).join(".");
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

  // Heuristic detection (no filter list). A cross-origin iframe sized to a
  // standard IAB ad slot is almost always an ad, so hide it on sight.
  const IAB_SIZES = [
    [300, 250], [336, 280], [728, 90], [970, 250], [970, 90], [320, 50],
    [320, 100], [160, 600], [300, 600], [468, 60], [234, 60], [250, 250],
    [120, 600], [125, 125], [180, 150], [300, 1050], [980, 120], [216, 36],
  ];
  const nearSize = (w, h) =>
    IAB_SIZES.some(([aw, ah]) => Math.abs(w - aw) <= 2 && Math.abs(h - ah) <= 2);

  const AD_TOKENS =
    /(^|[^a-z])(ads?|advert|sponsor|promo|banner|dfp|gpt|taboola|outbrain|adslot|adunit|adsense)([^a-z]|$)/i;

  function isThirdParty(src) {
    try {
      const h = new URL(src, location.href).hostname.replace(/^www\./, "");
      return !!h && h !== host && !h.endsWith("." + baseHost) && baseHost !== h;
    } catch {
      return false;
    }
  }

  function flagHidden(el, reason, r, items) {
    el.dataset.tbabHidden = "1";
    el.style.setProperty("display", "none", "important");
    items.push({ reason, w: Math.round(r.width), h: Math.round(r.height) });
  }

  // ad-sized cross-origin frames (works for any unknown network)
  function scanFrames(items) {
    for (const f of document.querySelectorAll("iframe[src]")) {
      if (f.dataset.tbabHidden) continue;
      const r = f.getBoundingClientRect();
      if (!nearSize(Math.round(r.width), Math.round(r.height))) continue;
      if (!isThirdParty(f.src)) continue;
      let target = f;
      const p = f.parentElement;
      if (p && p.children.length === 1) {
        const pr = p.getBoundingClientRect();
        if (Math.abs(pr.width - r.width) < 6 && Math.abs(pr.height - r.height) < 6) {
          target = p;
          target.dataset.tbabFrameSize = "1";
        }
      }
      flagHidden(target, "Ad-sized cross-origin frame", r, items);
    }
  }

  // edge-anchored sticky/fixed banner bars. only act when there's a real ad
  // signal so we don't touch sticky navbars or headers.
  function adSignal(el) {
    if (AD_TOKENS.test(" " + el.id + " " + el.className + " ")) return true;
    const f = el.querySelector("iframe[src]");
    if (f && isThirdParty(f.src)) return true;
    return false;
  }

  function scanSticky(items) {
    const body = document.body;
    if (!body) return;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    for (const el of body.children) {
      if (el.dataset.tbabHidden || el.tagName === "SCRIPT" || el.tagName === "STYLE")
        continue;
      let pos;
      try {
        pos = getComputedStyle(el).position;
      } catch {
        continue;
      }
      if (pos !== "fixed" && pos !== "sticky") continue;
      const r = el.getBoundingClientRect();
      const wide = r.width >= vw * 0.6;
      const bannerH = r.height >= 24 && r.height <= 260;
      const atEdge = r.top <= 4 || r.bottom >= vh - 4;
      if (wide && bannerH && atEdge && adSignal(el)) {
        flagHidden(el, "Sticky banner ad", r, items);
      }
    }
  }

  function smartScan() {
    if (!enabled || !smartEnabled) return;
    const items = [];
    scanFrames(items);
    scanSticky(items);
    if (items.length) {
      try {
        chrome.runtime.sendMessage({ type: "smartHit", host, items });
      } catch {}
    }
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
    ["enabled", "allowlist", "customHidden", "userFilters", "features"],
    (data) => {
      enabled = data.enabled !== false;
      smartEnabled = (data.features || {}).smart !== false;
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
    if (changes.features) {
      smartEnabled = (changes.features.newValue || {}).smart !== false;
      if (enabled && smartEnabled) smartScan();
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
    smartScan();
    collapseEmpty();

    // Coalesce DOM mutations into at most one scan per frame.
    let scheduled = false;
    new MutationObserver(() => {
      if (!enabled || scheduled) return;
      scheduled = true;
      requestAnimationFrame(() => {
        scheduled = false;
        hide();
        smartScan();
      });
    }).observe(document.documentElement, { childList: true, subtree: true });

    // A few delayed passes catch lazily injected ads.
    let runs = 0;
    const t = setInterval(() => {
      if (!enabled || runs++ > 10) return clearInterval(t);
      hide();
      smartScan();
      collapseEmpty();
    }, 1000);
  }
})();
