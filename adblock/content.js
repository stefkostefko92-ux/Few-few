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
  let cosmeticsOff = false; // per-site "no cosmetic filtering" (network blocking unaffected)
  let allowed = false;       // site is on the allowlist: we do nothing here, on EVERY path
  let smartEnabled = true;
  let customSelectors = [];
  let procSelectors = [];
  let unhideSelectors = [];
  let genericHideHost = false; // EasyList $generichide за този хост

  // Live scriptlets (Level 2): hand the signed filters.json directives to the
  // MAIN-world engine as a JSON STRING (objects don't cross worlds). The engine
  // re-validates, filters by this frame's host and ignores duplicates. When the
  // extension is off / the site is allowlisted the engine isn't registered, so
  // the event simply has no listener.
  function deliverScriptlets(cfg) {
    // only from a signature-checked file (an older stored config may predate the check)
    const list = cfg && cfg.verified === true && Array.isArray(cfg.scriptlets) ? cfg.scriptlets : [];
    if (!list.length) return;
    try {
      document.dispatchEvent(new CustomEvent("sa-scriptlets", { detail: JSON.stringify(list) }));
    } catch {}
  }

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

  function classToken(t) {
    return [`[class^='${t}']`, `[class*=' ${t}']`, `[class*='-${t}']`, `[class*='_${t}']`];
  }
  const AD_SELECTORS = [
    "[id^='google_ads_']",
    "[id^='div-gpt-ad']",
    "[id^='gpt-']",
    "[id*='banner-ad']",
    "[id*='adsense']",
    "[id*='dfp-']",
    // Class names match as the START of a class token (or after "-"/"_"),
    // never as a bare substring: `[class*='ad-container']` also hid
    // thread-container, head-container, download-container, upload-container…
    // on every site (forums, download pages), and `sponsored` hid "unsponsored".
    ...classToken("ad-banner"),
    ...classToken("ad-container"),
    ...classToken("ad-wrapper"),
    ...classToken("ad-slot"),
    ...classToken("ad-unit"),
    ...classToken("ad-placeholder"),
    ...classToken("advertisement"),
    ...classToken("advert-"),
    ...classToken("sponsored"),
    "[class*='-sponsor']",
    "[class*='adsbygoogle']",
    ...classToken("dfp-"),
    ...classToken("gpt-ad"),
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
  // Действия (модифицират елемента) — стоят само на края на веригата.
  const ACTION_OPS = new Set(["remove", "style", "remove-attr", "remove-class"]);
  const OPS = "has-text|matches-css|matches-attr|matches-path|matches-media|matches-prop|watch-attr|min-text-length|upward|xpath|remove-attr|remove-class|remove|style";
  const PROC_RE = new RegExp(":(" + OPS + ")\\(");
  const OP_HEAD = new RegExp("^:(" + OPS + ")\\(");

  // "css:op(arg):op(arg)" -> { css, ops } or null when it's plain CSS.
  function parseProcedural(raw) {
    if (typeof raw !== "string" || !PROC_RE.test(raw)) return null;
    const ops = [];
    let css = "";
    let buf = "";
    let i = 0;
    while (i < raw.length) {
      const m = OP_HEAD.exec(raw.slice(i));
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
    // Действие (remove/style/remove-attr/remove-class) стои само на края.
    if (ops.slice(0, -1).some((o) => ACTION_OPS.has(o.op))) return null;
    // Изискваме CSS основа (перф), освен когато веригата тръгва от :xpath().
    if (!css && ops[0].op !== "xpath") return null;
    return { css, ops };
  }

  const toRegex = (s) => {
    const m = /^\/(.+)\/(i?)$/.exec(s);
    if (!m) return null;
    // ReDoS guard: капваме дължината И броя квантори (*, +, {n}). Един квантор
    // е линеен; два+ подредени (напр. [a-z]*[a-z]*x) дават полиномиален/
    // катастрофичен backtracking, който замразява таба.
    const q = (m[1].match(/[*+?]|\{\d/g) || []).length;
    if (m[1].length > 200 || q > 1) return null;
    if (/\)[*+?{]/.test(m[1])) return null; // any quantified group is ReDoS-prone (nested parens hide from [^)]* scans)
    try {
      return new RegExp(m[1], m[2]);
    } catch {
      return null;
    }
  };
  // Капваме тествания текст, за да ограничим backtracking върху дълъг textContent.
  const textOf = (el) => (el.textContent || "").slice(0, 20000);

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
        return { els: [], action: null };
      }
    }
    if (els.length > 1000) els = els.slice(0, 1000);
    let action = null;
    for (let k = start; k < p.ops.length && els.length; k++) {
      const { op, arg } = p.ops[k];
      if (op === "has-text") {
        const re = toRegex(arg);
        els = els.filter((el) => (re ? re.test(textOf(el)) : textOf(el).includes(arg)));
      } else if (op === "matches-attr") {
        // name  |  name="value"  |  name  и стойност могат да са /regex/
        const eq = arg.indexOf("=");
        const nameSpec = (eq === -1 ? arg : arg.slice(0, eq)).trim();
        const valSpec = eq === -1 ? null : arg.slice(eq + 1).trim().replace(/^["']|["']$/g, "");
        const nameRe = toRegex(nameSpec);
        const valRe = valSpec != null ? toRegex(valSpec) : null;
        const nameLc = nameSpec.toLowerCase();
        els = els.filter((el) => {
          const names = el.getAttributeNames ? el.getAttributeNames() : [];
          return names.some((a) => {
            if (nameRe ? !nameRe.test(a) : a !== nameLc) return false;
            if (valSpec == null) return true;
            const v = el.getAttribute(a) || "";
            return valRe ? valRe.test(v) : v === valSpec;
          });
        });
      } else if (op === "matches-path") {
        const re = toRegex(arg);
        const path = location.pathname + location.search;
        if (!(re ? re.test(path) : path.includes(arg))) els = [];
      } else if (op === "matches-media") {
        // :matches-media(query) — пази селекцията само ако media query-то мачва
        // (напр. "(max-width: 600px)"); без DOM обхождане.
        let mm = false;
        try { mm = window.matchMedia(arg).matches; } catch {}
        if (!mm) els = [];
      } else if (op === "matches-prop") {
        // :matches-prop(name=value) — JS свойство (dotted) на елемента; стойността
        // може да е /regex/. Цели рандомизирано DOM състояние. Само четене.
        const eq = arg.indexOf("=");
        const propSpec = (eq === -1 ? arg : arg.slice(0, eq)).trim();
        const valSpec = eq === -1 ? null : arg.slice(eq + 1).trim().replace(/^["']|["']$/g, "");
        const valRe = valSpec != null ? toRegex(valSpec) : null;
        if (!/^[a-zA-Z_$][\w$]*(\.[a-zA-Z_$][\w$]*){0,4}$/.test(propSpec)) return { els: [], action: null };
        const path = propSpec.split(".");
        els = els.filter((el) => {
          let v = el;
          try { for (const seg of path) { if (v == null) return false; v = v[seg]; } } catch { return false; }
          if (valSpec == null) return v !== undefined;
          const s = String(v);
          return valRe ? valRe.test(s) : s === valSpec;
        });
      } else if (op === "watch-attr") {
        // :watch-attr(attrs) — uBO преизчислява веригата при промяна на тези
        // атрибути; нашият MutationObserver и без това се пуска при attribute
        // промени, затова е приет като no-op филтър.
      } else if (op === "min-text-length") {
        const n = parseInt(arg, 10) || 0;
        els = els.filter((el) => el.textContent.length >= n);
      } else if (op === "matches-css") {
        const ci = arg.indexOf(":");
        if (ci < 1) return { els: [], action: null };
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
        action = { op: "remove" };
      } else if (op === "style" || op === "remove-attr" || op === "remove-class") {
        action = { op, arg };
      } else {
        return { els: [], action: null }; // :xpath() извън първа позиция и т.н.
      }
    }
    return { els, action };
  }

  // Прилага CSS декларации от :style(...) на елемент (напр. "display: block !important").
  function applyStyle(el, decl) {
    for (const part of decl.split(";")) {
      const ci = part.indexOf(":");
      if (ci < 1) continue;
      let prop = part.slice(0, ci).trim();
      let val = part.slice(ci + 1).trim();
      let prio = "";
      if (/!important$/i.test(val)) { val = val.replace(/!important$/i, "").trim(); prio = "important"; }
      if (/^[a-z-]+$/i.test(prop)) { try { el.style.setProperty(prop, val, prio); } catch {} }
    }
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
    // Never the whole page: a picker click on empty space selects <body>/<html>
    // (or an id on them), and hiding that blanks the site on every visit.
    if (el === document.documentElement || el === document.body) return;
    if (el.dataset.tbabHidden || el.dataset.tbabUnhide) return;
    el.dataset.tbabHidden = "1";
    el.style.setProperty("display", "none", "important");
  }

  // One querySelectorAll per LIST (one DOM walk) instead of one per selector —
  // hide() runs on DOM changes, and ~40 separate full-document queries per frame
  // were a measurable share of the main thread on busy pages. A list from the
  // filter lists / My filters may hold a selector the browser rejects; then (and
  // only then) that list is queried selector by selector.
  const joinedLists = new WeakMap(); // list → { n, sel } (sel null = query one by one)
  // A selector the parser silently "repairs" (`.a[title="x`, `:has(` without its
  // `)`, a trailing `\`) is valid on its own but, joined, swallows every selector
  // after it — so each one must prove it is self-contained: joined with a probe
  // id it must still match the probe.
  const probe = document.createElement("i");
  probe.id = "tbab-probe";
  const selfContained = (s) => { try { return probe.matches(s + ", #tbab-probe"); } catch { return false; } };
  function listEntry(list) {
    let j = joinedLists.get(list);
    if (!j || j.n !== list.length) {
      j = { n: list.length, sel: list.every(selfContained) ? list.join(", ") : null };
      joinedLists.set(list, j);
    }
    return j;
  }
  function listSel(list) {
    return listEntry(list).sel;
  }
  // Rules can match an ANCESTOR of what the page just added: `:has()` (EasyList has
  // ~800), a class put on an existing ad slot before its content arrives,
  // `[data-google-query-id]` set on the container. 5.0.4 caught those with a
  // whole-document pass per change; one closest() walk up from each added node
  // does the same for a fraction of the cost.
  function hideAncestors(n, list) {
    const sel = listSel(list);
    const walk = (one) => {
      try {
        for (let a = n.parentElement && n.parentElement.closest(one); a; a = a.parentElement && a.parentElement.closest(one)) hideEl(a);
      } catch {}
    };
    if (sel !== null) walk(sel);
    else for (const one of list) walk(one);
  }
  function queryList(root, list) {
    if (!list.length) return [];
    const sel = listSel(list);
    if (sel !== null) {
      try { return root.querySelectorAll(sel); } catch {}
    }
    const out = [];
    for (const one of list) {
      try { for (const el of root.querySelectorAll(one)) out.push(el); } catch {}
    }
    return out;
  }
  function matchesList(el, list) {
    if (!list.length) return false;
    const sel = listSel(list);
    if (sel !== null) {
      try { return el.matches(sel); } catch {}
    }
    return list.some((one) => { try { return el.matches(one); } catch { return false; } });
  }

  // Only the subtrees the page just added (a new ad can only be in there). The
  // whole-document hide() stays for start-up, the timed passes and filter
  // changes; procedural and #@# rules need the whole page, so they fall back to it.
  // `attrOnly`: elements whose class/id changed (not added) — the element itself
  // and its ancestors only, never its subtree: a class toggled on a big container
  // every frame must not turn into a whole-subtree query.
  let attrTargets = new WeakSet();
  function hideAdded(nodes, attrOnly = new WeakSet()) {
    if (!enabled || allowed || cosmeticsOff) return;
    if (procSelectors.length || unhideSelectors.length) return hide();
    for (const n of nodes) {
      if (!n.isConnected) continue;
      for (const list of genericHideHost ? [customSelectors] : [AD_SELECTORS, customSelectors]) {
        if (matchesList(n, list)) hideEl(n);
        if (!attrOnly.has(n)) for (const el of queryList(n, list)) hideEl(el);
        hideAncestors(n, list);
      }
    }
  }

  function hide(root = document) {
    if (!enabled || allowed || cosmeticsOff) return;
    applyUnhide();
    // $generichide (EasyList) for this host: no generic cosmetics at all — the
    // bundled AD_SELECTORS are generic too (Google sign-in, Ads Manager…).
    if (!genericHideHost) for (const el of queryList(root, AD_SELECTORS)) hideEl(el);
    for (const el of queryList(root, customSelectors)) hideEl(el);
    for (const p of procSelectors) {
      const { els, action } = evalProcedural(p, root);
      for (const el of els) {
        if (el === document.documentElement || el === document.body) continue;
        if (!action) {
          hideEl(el);
        } else if (action.op === "remove") {
          if (!el.dataset.tbabUnhide) el.remove();
        } else if (action.op === "style") {
          // No url()/image-set()/attr()/escapes: a cosmetic rule must not beacon.
          if (SA_POLICY.styleOk(action.arg)) applyStyle(el, action.arg);
        } else if (action.op === "remove-attr") {
          // Security-relevant attributes (sandbox, src, href, integrity…) are
          // never stripped, whatever the rule's source (lists, live, My filters).
          const re = toRegex(action.arg);
          for (const a of (el.getAttributeNames ? el.getAttributeNames() : []))
            if ((re ? re.test(a) : a === action.arg.toLowerCase()) && !SA_POLICY.ATTR_DENY.test(a)) { try { el.removeAttribute(a); } catch {} }
        } else if (action.op === "remove-class") {
          const re = toRegex(action.arg);
          for (const c of [...el.classList])
            if (re ? re.test(c) : c === action.arg) el.classList.remove(c);
        }
      }
    }
  }

  // Collapse wrappers left empty after their only (ad) child is hidden.
  function collapseEmpty() {
    if (!enabled || allowed || cosmeticsOff) return;
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
    if (!enabled || allowed || cosmeticsOff || !smartEnabled) return; // Smart Detection also hides → same per-site switch
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

  // YouTube session bypass (background.js ytBypassUntil): the page must be a
  // genuinely clean client, and EasyList's youtube.com cosmetics (ad-slot
  // containers hidden by us) are detectable too — so cosmetics are off on
  // YouTube for the bypass window, exactly like youtube.css gates itself.
  const isYtHost = /(^|\.)youtube(-nocookie)?\.com$/.test(host);
  let noCosmeticsSite = false;
  let ytBypassOn = false;
  // Switching cosmetics OFF must also reveal what was already hidden — an open
  // YouTube tab that did not trigger the bypass would otherwise keep its
  // manipulated DOM for the whole window while we claim a clean client.
  // (:remove()-d nodes are gone for good; only a reload brings those back.)
  function revealHidden() {
    try {
      document.querySelectorAll("[data-tbab-hidden]").forEach((el) => {
        el.style.removeProperty("display");
        delete el.dataset.tbabHidden;
      });
    } catch {}
  }
  const recomputeCosmeticsOff = () => {
    const was = cosmeticsOff;
    cosmeticsOff = noCosmeticsSite || ytBypassOn;
    if (cosmeticsOff && !was) revealHidden();
  };

  chrome.storage?.local.get(
    ["enabled", "allowlist", "customHidden", "userFilters", "features", "liveConfig", "noCosmetics", "ytBypassUntil"],
    (data) => {
      enabled = data.enabled !== false;
      noCosmeticsSite = (data.noCosmetics || []).some(hostMatches);
      ytBypassOn = isYtHost && !!data.ytBypassUntil && data.ytBypassUntil > Date.now();
      recomputeCosmeticsOff();
      if (cosmeticsOff) gate(false);
      smartEnabled = (data.features || {}).smart !== false;
      allowed = (data.allowlist || []).some(hostMatches);
      pickerMap = data.customHidden || {};
      userText = data.userFilters || "";
      liveCosmetic = (data.liveConfig && data.liveConfig.cosmetic) || [];
      deliverScriptlets(data.liveConfig);
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
        allowed = ((d && d.allowlist) || []).some(hostMatches);
        // Гейтът зачита и $generichide хоста, за да не върне генеричния CSS
        // при повторно включване без reload.
        // …и per-site „без козметика" — иначе повторното включване връща
        // генеричния CSS точно на сайта, който потребителят е обявил за счупен.
        gate(enabled && !allowed && !genericHideHost && !cosmeticsOff);
        if (enabled && !allowed) {
          start();
          hide();
        }
      });
    }
    if (changes.noCosmetics || (isYtHost && changes.ytBypassUntil)) {
      if (changes.noCosmetics) noCosmeticsSite = (changes.noCosmetics.newValue || []).some(hostMatches);
      if (isYtHost && changes.ytBypassUntil) {
        const until = changes.ytBypassUntil.newValue;
        ytBypassOn = !!until && until > Date.now();
      }
      recomputeCosmeticsOff();
      chrome.storage.local.get("allowlist", (d) => {
        allowed = ((d && d.allowlist) || []).some(hostMatches);
        gate(enabled && !allowed && !genericHideHost && !cosmeticsOff);
        if (enabled && !allowed && !cosmeticsOff) hide();
      });
    }
    if (changes.allowlist) {
      const was = allowed;
      allowed = (changes.allowlist.newValue || []).some(hostMatches);
      gate(enabled && !allowed && !genericHideHost && !cosmeticsOff);
      if (allowed && !was) revealHidden();              // just allowlisted: give the page back
      else if (!allowed && was && enabled) { start(); hide(); }
    }
    if (changes.features) {
      smartEnabled = (changes.features.newValue || {}).smart !== false;
      if (enabled && !allowed && smartEnabled) smartScan();
    }
    if (changes.customHidden || changes.userFilters || changes.liveConfig) {
      if (changes.customHidden) pickerMap = changes.customHidden.newValue || {};
      if (changes.userFilters) userText = changes.userFilters.newValue || "";
      if (changes.liveConfig) {
        liveCosmetic = (changes.liveConfig.newValue && changes.liveConfig.newValue.cosmetic) || [];
        deliverScriptlets(changes.liveConfig.newValue);
      }
      rebuildSelectors();
      if (enabled && !allowed) hide();
    }
  });

  let started = false;
  function start() {
    if (started) return; // guard against repeated enable toggles
    started = true;
    hide();
    smartScan();
    collapseEmpty();

    // Coalesce DOM mutations into at most one pass per frame, over the ADDED
    // subtrees only. Text-only churn (a clock, Speedtest's gauge, a live score)
    // used to cost a full-document scan every frame — and on a speed test that
    // main-thread time came straight out of the measured speed. Text matters
    // only to procedural :has-text() rules, so with those it triggers a full pass.
    // Smart Detection (layout reads) runs at most every 500 ms, trailing.
    let scheduled = false;
    let pending = new Set();
    let fullPass = false;
    let smartTimer = 0;
    let lastSmart = 0;
    const smartSoon = () => {
      if (smartTimer) return;
      smartTimer = setTimeout(() => {
        smartTimer = 0;
        lastSmart = Date.now();
        smartScan();
      }, Math.max(0, 500 - (Date.now() - lastSmart)));
    };
    new MutationObserver((records) => {
      if (!enabled) return;
      let added = false;
      for (const r of records) {
        if (r.type === "attributes") {
          // an existing element that just became an ad slot (`el.className = "ad-slot"`)
          const t = r.target;
          if (t.nodeType === 1 && t !== document.documentElement && t !== document.body && !t.dataset.tbabHidden) {
            added = true;
            if (!pending.has(t)) { attrTargets.add(t); if (pending.size < 300) pending.add(t); else fullPass = true; }
          }
          continue;
        }
        for (const n of r.addedNodes) {
          if (n.nodeType !== 1) continue;
          added = true;
          attrTargets.delete(n);
          if (pending.size < 300) pending.add(n);
          else fullPass = true; // a big re-render: one whole-page pass is cheaper
        }
      }
      if (!added) {
        if (!procSelectors.length) return;
        fullPass = true;
      }
      if (scheduled) return;
      scheduled = true;
      requestAnimationFrame(() => {
        scheduled = false;
        const nodes = pending;
        const full = fullPass;
        pending = new Set();
        fullPass = false;
        const attrs = attrTargets;
        attrTargets = new WeakSet();
        if (full) hide();
        else hideAdded(nodes, attrs);
        smartSoon();
      });
    }).observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ["class", "id"] });

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
