// Cosmetic filtering: hide ad containers that survive network blocking.
//
// Four selector sources, merged per page:
//  - the built-in AD_SELECTORS below
//  - the bundled EasyList cosmetic rules (generic ones ship as a static CSS
//    file gated behind html[data-tbab-on]; domain-specific ones arrive from
//    the background per host)
//  - the user's picker/"My filters" selectors
//  - the live filter update (liveConfig)
// Selectors may be plain CSS (incl. native :has()) or procedural, uBlock
// style: :has-text(), :matches-css(), :upward(), :xpath(), :min-text-length()
// and the :remove() action. Procedural ones are evaluated in JS, everything
// is data, nothing is executed.
(function () {
  let enabled = true;
  let smartEnabled = true;
  let customSelectors = [];
  let procSelectors = [];
  let unhideSelectors = [];
  let genericHideHost = false; // EasyList $generichide за този хост

  const host = location.hostname.replace(/^www\./, "");
  // Multi-part публични суфикси (co.uk, com.au, ...) — иначе isThirdParty би
  // третирал всички *.co.uk като first-party.
  const MULTI_TLD = /\.(co|com|net|org|gov|ac|edu)\.[a-z]{2}$/;
  const baseHost = host.split(".").slice(MULTI_TLD.test(host) ? -3 : -2).join(".");
  const hostMatches = (d) => host === d || host.endsWith("." + d);

  // Gate for the bundled generic cosmetic CSS. Set optimistically at
  // document_start (ads never flash in); removed a moment later if the
  // extension turns out to be off or the site allowlisted.
  const gate = (on) => {
    try {
      if (on) document.documentElement.setAttribute("data-tbab-on", "1");
      else document.documentElement.removeAttribute("data-tbab-on");
    } catch {}
  };
  gate(true);

  const AD_SELECTORS = [
    "[id^='google_ads_']",
    "[id^='div-gpt-ad']",
    "[id^='gpt-']",
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

  // ---- Procedural selectors (uBlock-style, data-driven) ----
  const PROC_RE = /:(has-text|matches-css|upward|xpath|min-text-length|remove)\(/;

  // "css:op(arg):op(arg)" -> { css, ops } or null when it's plain CSS.
  function parseProcedural(raw) {
    if (typeof raw !== "string" || !PROC_RE.test(raw)) return null;
    const ops = [];
    let css = "";
    let buf = "";
    let i = 0;
    while (i < raw.length) {
      const m = /^:(has-text|matches-css|upward|xpath|min-text-length|remove)\(/.exec(raw.slice(i));
      if (!m) {
        buf += raw[i++];
        continue;
      }
      if (!ops.length) css = buf.trim();
      else if (buf.trim()) return null; // css между операторите не поддържаме
      buf = "";
      let depth = 1;
      let j = i + m[0].length;
      let arg = "";
      while (j < raw.length && depth) {
        const ch = raw[j];
        if (ch === "(") depth++;
        else if (ch === ")") {
          depth--;
          if (!depth) break;
        }
        arg += ch;
        j++;
      }
      if (depth) return null; // небалансирани скоби
      ops.push({ op: m[1], arg: arg.trim() });
      i = j + 1;
    }
    if (buf.trim() || !ops.length) return null;
    // :remove() е действие и стои само в края
    if (ops.slice(0, -1).some((o) => o.op === "remove")) return null;
    // Изискваме CSS основа (перф), освен когато веригата тръгва от :xpath().
    if (!css && ops[0].op !== "xpath") return null;
    return { css, ops };
  }

  const toRegex = (s) => {
    const m = /^\/(.+)\/(i?)$/.exec(s);
    try {
      return m ? new RegExp(m[1], m[2]) : null;
    } catch {
      return null;
    }
  };

  function xpathAll(expr, ctx) {
    const out = [];
    try {
      const r = document.evaluate(expr, ctx || document, null, XPathResult.ORDERED_NODE_SNAPSHOT_TYPE, null);
      for (let i = 0; i < r.snapshotLength && i < 1000; i++) {
        const n = r.snapshotItem(i);
        if (n && n.nodeType === 1) out.push(n);
      }
    } catch {}
    return out;
  }

  // Изпълнява една процедурна верига; връща { els, remove }.
  function evalProcedural(p, root) {
    let els;
    let start = 0;
    if (!p.css && p.ops[0].op === "xpath") {
      els = xpathAll(p.ops[0].arg, root === document ? document : root);
      start = 1;
    } else {
      try {
        els = [...(root || document).querySelectorAll(p.css)];
      } catch {
        return { els: [], remove: false };
      }
    }
    if (els.length > 1000) els = els.slice(0, 1000);
    let remove = false;
    for (let k = start; k < p.ops.length && els.length; k++) {
      const { op, arg } = p.ops[k];
      if (op === "has-text") {
        const re = toRegex(arg);
        els = els.filter((el) => (re ? re.test(el.textContent) : el.textContent.includes(arg)));
      } else if (op === "min-text-length") {
        const n = parseInt(arg, 10) || 0;
        els = els.filter((el) => el.textContent.length >= n);
      } else if (op === "matches-css") {
        const ci = arg.indexOf(":");
        if (ci < 1) return { els: [], remove: false };
        const prop = arg.slice(0, ci).trim();
        const want = arg.slice(ci + 1).trim();
        const re = toRegex(want);
        els = els.filter((el) => {
          let v;
          try {
            v = getComputedStyle(el).getPropertyValue(prop);
          } catch {
            return false;
          }
          return re ? re.test(v) : v.trim() === want;
        });
      } else if (op === "upward") {
        if (/^\d+$/.test(arg)) {
          const n = Math.min(parseInt(arg, 10), 20);
          els = els.map((el) => {
            let cur = el;
            for (let i = 0; i < n && cur; i++) cur = cur.parentElement;
            return cur;
          });
        } else {
          els = els.map((el) => {
            try {
              return el.parentElement ? el.parentElement.closest(arg) : null;
            } catch {
              return null;
            }
          });
        }
        els = [...new Set(els.filter((el) => el && el !== document.documentElement && el !== document.body))];
      } else if (op === "remove") {
        remove = true;
      } else {
        return { els: [], remove: false }; // :xpath() извън първа позиция и т.н.
      }
    }
    return { els, remove };
  }

  // EasyList #@# exceptions за този домейн: маркираме елементите, така hide()
  // ги прескача, а inline display:revert надделява над генеричния CSS файл.
  function applyUnhide() {
    for (const sel of unhideSelectors) {
      let nodes;
      try {
        nodes = document.querySelectorAll(sel);
      } catch {
        continue;
      }
      for (const el of nodes) {
        if (el.dataset.tbabUnhide) continue;
        el.dataset.tbabUnhide = "1";
        el.style.setProperty("display", "revert", "important");
      }
    }
  }

  function hideEl(el) {
    if (el.dataset.tbabHidden || el.dataset.tbabUnhide) return;
    el.dataset.tbabHidden = "1";
    el.style.setProperty("display", "none", "important");
  }

  function hide(root = document) {
    if (!enabled) return;
    applyUnhide();
    for (const sel of AD_SELECTORS.concat(customSelectors)) {
      let nodes;
      try {
        nodes = root.querySelectorAll(sel);
      } catch {
        continue;
      }
      for (const el of nodes) hideEl(el);
    }
    for (const p of procSelectors) {
      const { els, remove } = evalProcedural(p, root);
      for (const el of els) {
        if (el === document.documentElement || el === document.body) continue;
        if (remove) {
          if (!el.dataset.tbabUnhide) el.remove();
        } else {
          hideEl(el);
        }
      }
    }
  }

  // Collapse wrappers left empty after their only (ad) child is hidden.
  function collapseEmpty() {
    if (!enabled) return;
    document.querySelectorAll("[data-tbab-hidden]").forEach((el) => {
      const p = el.parentElement;
      if (!p || p.children.length !== 1 || p.offsetHeight >= 5) return;
      // Не колабсирай контейнер, който тепърва ще lazy-load-не съдържание.
      if (
        p.hasAttribute("data-lazy") || p.hasAttribute("data-src") ||
        /\blazy\b/i.test(p.className || "") || p.querySelector("[loading='lazy']")
      ) return;
      p.style.setProperty("display", "none", "important");
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

  // Токени за sticky ad-сигнал. "banner"/"promo" НЕ са тук — те са прекалено
  // чести за легитимни sticky ленти (promo-bar, top-banner, hero-banner) и
  // даваха false positives; истинските ad-ленти носят по-специфичен маркер.
  const AD_TOKENS =
    /(^|[^a-z])(ads?|advert|sponsor|dfp|gpt|taboola|outbrain|adslot|adunit|adsense)([^a-z]|$)/i;

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

  // Cosmetic selectors come from the picker (customHidden), the user's
  // "My filters" cosmetic lines, the live filter update (liveConfig) and the
  // bundled EasyList domain-specific rules (via the background).
  let pickerMap = {};
  let userText = "";
  let liveCosmetic = [];
  let bundleCosmetic = [];

  function addSelector(sel) {
    const p = parseProcedural(sel);
    if (p) {
      if (procSelectors.length < 400) procSelectors.push(p);
    } else {
      customSelectors.push(sel);
    }
  }

  function rebuildSelectors() {
    customSelectors = [];
    procSelectors = [];
    for (const sel of bundleCosmetic) addSelector(sel);
    for (const sel of liveCosmetic) addSelector(sel);
    for (const [domain, sels] of Object.entries(pickerMap || {})) {
      if (hostMatches(domain)) for (const sel of sels) addSelector(sel);
    }
    for (let line of (userText || "").split("\n")) {
      line = line.trim();
      const i = line.indexOf("##");
      if (i === -1 || line.startsWith("!")) continue;
      const dom = line.slice(0, i).trim();
      const sel = line.slice(i + 2).trim();
      if (sel && (!dom || hostMatches(dom))) addSelector(sel);
    }
  }

  chrome.storage?.local.get(
    ["enabled", "allowlist", "customHidden", "userFilters", "features", "liveConfig"],
    (data) => {
      enabled = data.enabled !== false;
      smartEnabled = (data.features || {}).smart !== false;
      const allowed = (data.allowlist || []).some(hostMatches);
      pickerMap = data.customHidden || {};
      userText = data.userFilters || "";
      liveCosmetic = (data.liveConfig && data.liveConfig.cosmetic) || [];
      rebuildSelectors();
      if (enabled && !allowed) {
        start();
        // домейн-специфичната EasyList козметика идва от bundle-а per host
        try {
          chrome.runtime.sendMessage({ type: "getCosmetic", host }, (res) => {
            if (!res) return;
            bundleCosmetic = Array.isArray(res.hide) ? res.hide : [];
            unhideSelectors = Array.isArray(res.unhide) ? res.unhide : [];
            // EasyList $generichide за този хост → не прилагай генеричния CSS
            // (иначе скриваме легитимен UI, напр. Google sign-in, Ads Manager).
            genericHideHost = !!res.genericHide;
            if (genericHideHost) gate(false);
            rebuildSelectors();
            hide();
          });
        } catch {}
      } else {
        gate(false); // изключено или allowlisted: маха генеричния CSS гейт
      }
    }
  );

  chrome.storage?.onChanged.addListener((changes) => {
    if (changes.enabled) {
      enabled = changes.enabled.newValue !== false;
      // Пре-проверяваме allowlist-а: включване на защитата не бива да пусне
      // генеричната козметика на allowlist-нат сайт.
      chrome.storage.local.get("allowlist", (d) => {
        const allowed = ((d && d.allowlist) || []).some(hostMatches);
        // Гейтът зачита и $generichide хоста, за да не върне генеричния CSS
        // при повторно включване без reload.
        gate(enabled && !allowed && !genericHideHost);
        if (enabled && !allowed) {
          start();
          hide();
        }
      });
    }
    if (changes.features) {
      smartEnabled = (changes.features.newValue || {}).smart !== false;
      if (enabled && smartEnabled) smartScan();
    }
    if (changes.customHidden || changes.userFilters || changes.liveConfig) {
      if (changes.customHidden) pickerMap = changes.customHidden.newValue || {};
      if (changes.userFilters) userText = changes.userFilters.newValue || "";
      if (changes.liveConfig)
        liveCosmetic = (changes.liveConfig.newValue && changes.liveConfig.newValue.cosmetic) || [];
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
