// Hide sponsored posts on Facebook, Instagram and Threads.
//
// Meta serves sponsored posts inline from its own domains and obfuscates the
// "Sponsored" label, so they can't be blocked at the network layer without
// breaking the site (the data-level part — Marketplace, search, the right column,
// in-stream video ads — is done by the uBlock Origin directives in the scriptlet
// engine). This is the cosmetic pass over the feed, built on what Meta cannot hide
// without breaking accessibility law: the label a screen reader announces.
//
//   1. the label itself: an element whose whole text is "Sponsored" in one of
//      Meta's languages, an aria-label, an aria-labelledby target, or an SVG <use>
//      that points at a <text> with that word;
//   2. the obfuscated form: a box of one-letter spans (shuffled with CSS, padded
//      with decoy letters) that holds every letter of the word;
//   3. links into Meta's ad surfaces (/ads/about, ad_preferences).
// A hit hides the FEED UNIT that owns it: a known feed container, or the nearest
// ancestor that sits among look-alike siblings. No unit → nothing is hidden.
// Only added subtrees are scanned (never the whole document on every change).
(function () {
  let run = false;
  let debug = false; // chrome.storage.local.metaDebug = true → outline instead of hide (for checking a feed)

  const host = location.hostname.replace(/^www\./, "");
  const hostMatches = (d) => host === d || host.endsWith("." + d);

  // "Sponsored" as Meta writes it in the languages it ships (feed, Reels, Threads).
  const LABELS = new Set([
    "sponsored", "sponsorisé", "sponsorisée", "gesponsert", "gesponsord", "patrocinado", "patrocinada",
    "publicidad", "sponsorizzato", "sponsorizzata", "sponsorowane", "sponzorováno", "sponzorované",
    "sponzorirano", "sponzorisano", "спонзорисано", "спонзорирано", "sponsorizat", "hirdetés",
    "χορηγούμενη", "χορηγούμενο", "sponsorlu", "sponsoreret", "sponsrad", "sponset", "sponsoroitu",
    "sponsitud", "apmaksāta reklāma", "remiama", "e sponsorizuar", "patrocinat", "babestua", "kostað",
    "реклама", "спонсорирано", "спонсорска", "рэклама", "demeushilik", "демеушілік", "reklama",
    "ممول", "مُموَّل", "ממומן", "دارای پشتیبانی مالی", "تبلیغ", "سپانسر شدہ", "प्रायोजित",
    "স্পনসর করা", "স্পনসর্ড", "விளம்பரம்", "ప్రాయోజితం", "ಪ್ರಾಯೋಜಿತ", "സ്‌പോൺസർ ചെയ്‌തത്",
    "પ્રાયોજિત", "ਸਪਾਂਸਰ ਕੀਤਾ", "ਸਪਾਂਸਰਡ", "අනුග්‍රහය දක්වන ලද", "ได้รับการสนับสนุน", "được tài trợ",
    "bersponsor", "ditaja", "imedhaminiwa", "広告", "광고", "스폰서", "赞助内容", "贊助", "贊助內容",
    "დაფინანსებული", "հովանավորված", "ስፖንሰር የተደረገ", "ឧបត្ថម្ភ", "ивээн тэтгэсэн",
  ]);
  const norm = (t) => String(t || "").normalize("NFC").replace(/[​-‍⁠﻿]/g, "").replace(/\s+/g, " ").trim().toLowerCase();
  const isLabel = (t) => { const n = norm(t); return n.length > 0 && n.length <= 30 && LABELS.has(n); };
  // the words long enough for the shuffled-letters test (a 2-letter word would match anything)
  const LETTER_WORDS = [...LABELS].filter((w) => w.length >= 5 && !/\s/.test(w)).map((w) => {
    const c = new Map();
    for (const ch of w) c.set(ch, (c.get(ch) || 0) + 1);
    return { len: w.length, count: c };
  });
  function shuffledLabel(box) {
    const kids = box.children;
    if (kids.length < 5 || kids.length > 60) return false;
    const have = new Map();
    for (const k of kids) {
      const t = norm(k.textContent);
      if (t.length !== 1) return false;
      have.set(t, (have.get(t) || 0) + 1);
    }
    return LETTER_WORDS.some((w) => kids.length <= w.len * 3 && [...w.count].every(([ch, n]) => (have.get(ch) || 0) >= n));
  }
  function textOfId(id) {
    const el = id && document.getElementById(id);
    return el ? el.textContent : "";
  }

  // The feed unit a label belongs to.
  const KNOWN_UNIT = '[data-pagelet^="FeedUnit"], [aria-posinset], div[role="feed"] > div, article, [data-pressable-container="true"]';
  function feedUnit(el) {
    const known = el.closest(KNOWN_UNIT);
    if (known && known !== document.body) return known;
    let cur = el;
    for (let i = 0; i < 20 && cur && cur.parentElement && cur.parentElement !== document.body && cur.parentElement !== document.documentElement; i++) {
      const p = cur.parentElement;
      if (p.childElementCount >= 3) {
        let same = 0;
        for (const s of p.children) if (s.tagName === cur.tagName && s.childElementCount > 0) same++;
        if (same >= 3) {
          const h = cur.getBoundingClientRect().height;
          if (h > 60 && h < 4000) return cur;
        }
      }
      cur = p;
    }
    return null;
  }

  const hidden = new WeakSet();
  function kill(unit, why) {
    if (!unit || hidden.has(unit)) return;
    hidden.add(unit);
    unit.dataset.tbabHidden = "1";
    if (debug) {
      unit.style.setProperty("outline", "3px dashed #e5484d", "important");
      unit.setAttribute("data-tbab-why", why);
      unit.title = "Supreme AdBlock — sponsored (" + why + ")";
    } else {
      unit.style.setProperty("display", "none", "important");
    }
  }
  function hit(el, why) {
    const unit = feedUnit(el);
    if (unit) kill(unit, why);
  }

  function scanRoot(root) {
    if (!run || !root || root.nodeType !== 1 || !root.isConnected) return;
    // 1a. visible text that is exactly the word
    const tw = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    const boxes = new Set();
    for (let n = tw.nextNode(); n; n = tw.nextNode()) {
      const t = n.nodeValue;
      if (!t || t.length > 40) continue;
      const p = n.parentElement;
      if (!p) continue;
      // a leaf element whose whole text is the word (cheap: a leaf's text is its own)
      if (p.childElementCount === 0 && isLabel(p.textContent)) { hit(p, "label"); continue; }
      if (norm(t).length === 1 && p.parentElement) boxes.add(p.parentElement);
    }
    // 2. shuffled one-letter boxes
    for (const b of boxes) if (shuffledLabel(b)) hit(b, "letters");
    // 1b. aria-label / aria-labelledby / <use> → the word
    const scoped = (sel) => (root.matches(sel) ? [root] : []).concat([...root.querySelectorAll(sel)]);
    for (const el of scoped("[aria-labelledby], [aria-label], use")) {
      const al = el.getAttribute("aria-label");
      if (al && isLabel(al)) { hit(el, "aria-label"); continue; }
      const lb = el.getAttribute("aria-labelledby");
      if (lb && lb.split(/\s+/).some((id) => isLabel(textOfId(id)))) { hit(el, "aria-labelledby"); continue; }
      if (el.tagName.toLowerCase() === "use") {
        const ref = (el.getAttribute("href") || el.getAttribute("xlink:href") || "").replace(/^#/, "");
        if (ref && isLabel(textOfId(ref))) hit(el, "svg");
      }
    }
    // 3. links into Meta's ad surfaces
    for (const a of scoped("a[href*='/ads/about'], a[href*='ad_preferences']")) hit(a, "ad link");
  }

  // Added subtrees, coalesced; text filled in later (Meta renders a post in stages)
  // arrives as characterData/childList inside an existing node and is scanned there.
  let pending = new Set();
  let timer = 0;
  function queue(node) {
    const el = node && (node.nodeType === 1 ? node : node.parentElement);
    if (el) pending.add(el);
    if (!timer) timer = setTimeout(flush, 250);
  }
  function flush() {
    timer = 0;
    const roots = pending;
    pending = new Set();
    // only the outermost of nested roots
    for (const r of roots) {
      let p = r.parentElement, inner = false;
      while (p) { if (roots.has(p)) { inner = true; break; } p = p.parentElement; }
      if (!inner) { try { scanRoot(r); } catch (e) {} }
    }
  }

  let wired = false;
  function start() {
    run = true;
    queue(document.documentElement);
    if (wired) return; // one observer per page, however often the gate flips
    wired = true;
    new MutationObserver((records) => {
      if (!run) return;
      for (const r of records) {
        if (r.type === "characterData") queue(r.target);
        else for (const n of r.addedNodes) queue(n);
      }
    }).observe(document.documentElement, { childList: true, subtree: true, characterData: true });
  }

  // Same gate as the other cosmetic scripts: protection on, feature on, site
  // not allowlisted and cosmetics not switched off for it — on every change.
  const st = { enabled: true, feature: true, allowed: false, noCosm: false };
  function applyGate() {
    const want = st.enabled && st.feature && !st.allowed && !st.noCosm;
    if (want && !run) start();
    else if (!want) run = false;
  }
  chrome.storage?.local.get(["enabled", "features", "allowlist", "noCosmetics", "metaDebug"], (data) => {
    st.enabled = data.enabled !== false;
    st.feature = (data.features || {}).meta !== false;
    st.allowed = (data.allowlist || []).some(hostMatches);
    st.noCosm = (data.noCosmetics || []).some(hostMatches);
    debug = data.metaDebug === true;
    applyGate();
  });
  chrome.storage?.onChanged.addListener((c) => {
    if (c.enabled) st.enabled = c.enabled.newValue !== false;
    if (c.features) st.feature = (c.features.newValue || {}).meta !== false;
    if (c.allowlist) st.allowed = (c.allowlist.newValue || []).some(hostMatches);
    if (c.noCosmetics) st.noCosm = (c.noCosmetics.newValue || []).some(hostMatches);
    if (c.metaDebug) debug = c.metaDebug.newValue === true;
    if (c.enabled || c.features || c.allowlist || c.noCosmetics) applyGate();
  });
})();
