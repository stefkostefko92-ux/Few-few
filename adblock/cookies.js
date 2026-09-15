// Dismiss cookie / consent banners by clicking reject (or accept as a fallback),
// then make sure the page is USABLE: no leftover backdrop, dark filter, blur,
// scroll lock or `inert` — the things a consent manager only tears down when
// its own button is pressed. Handles open shadow DOM, where many modern consent
// managers live, and runs in every frame (Sourcepoint & co. render in an iframe).
//
// Order matters: cookies.css only CLOAKS a banner (visibility:hidden keeps its
// layout) while we try to click its button — a display:none'd banner can never
// be clicked, so the CMP never finishes and leaves the page dimmed and locked.
// Only after the click window do leftovers get display:none, and the cleanup
// below runs regardless of whether a click succeeded.
(function () {
  let active = false;
  let bannerSeen = false;
  let clicked = false;
  let hardened = false;

  // Same list as the first block of cookies.css (tests/cookies.test.mjs keeps
  // them in sync): what counts as "a consent banner is on this page".
  const BANNERS = [
    "#onetrust-banner-sdk", "#onetrust-consent-sdk", "#CybotCookiebotDialog",
    "#CybotCookiebotDialogBodyUnderlay", ".qc-cmp2-container", ".qc-cmp-cleanslate",
    "#didomi-host", ".didomi-popup-container", "#usercentrics-root", ".truste_overlay",
    ".truste_box_overlay", "#truste-consent-track", ".cc-window", ".cookie-consent",
    ".cookie-banner", ".cookie-notice", ".cookie-notification", ".cookies-popup",
    ".cmp-banner", ".gdpr-banner", ".gdpr-consent", ".cmpbox", ".fc-consent-root",
    ".cookiebanner", ".cookie-law-info-bar", "#cookie-law-info-bar", ".cmplz-cookiebanner",
    ".iubenda-cs-container", ".osano-cm-window", ".termly-styles-root",
    ".cky-consent-container", "#cookie-consent-banner", "#gdpr-consent-tool-wrapper",
    "[class*=\"cookie-consent\"]", "[class*=\"cookie-banner\"]", "[class*=\"cookie-notice\"]",
    "[class*=\"consent-banner\"]", "[class*=\"CookieConsent\"]", "[id*=\"cookie-banner\"]",
    "[id*=\"cookie-consent\"]", "[id*=\"cookieConsent\"]",
    "[aria-label*=\"cookie\" i][role=\"dialog\"]", "[aria-label*=\"consent\" i][role=\"dialog\"]",
    "[aria-describedby*=\"cookie\" i]",
  ];

  const REJECT = [
    "#onetrust-reject-all-handler",
    ".onetrust-close-btn-handler",
    "#CybotCookiebotDialogBodyButtonDecline",
    "#CybotCookiebotDialogBodyLevelButtonLevelOptinDeclineAll",
    "#CybotCookiebotDialogBodyButtonReject",
    ".qc-cmp2-summary-buttons button[mode='secondary']",
    ".didomi-continue-without-agreeing",
    "button#didomi-notice-disagree-button",
    ".uc-deny-button",
    "#uc-btn-deny-banner",
    "button[data-testid='uc-deny-all-button']",
    "[data-testid='reject-all-button']",
    "#truste-consent-required",
    ".truste-button2",
    ".cc-deny",
    ".cookie-decline",
    ".cmpboxbtnno",
    ".cky-btn-reject",
    ".cmplz-deny",
    ".iubenda-cs-reject-btn",
    ".osano-cm-denyAll",
    ".termly-reject-all",
    // Sourcepoint (Mediaset, many EU media sites), rendered inside an iframe
    ".sp_choice_type_13",
    ".sp_choice_type_REJECT_ALL",
    "button[title='Continua senza accettare']",
    "button[aria-label*='reject' i]",
    "button[aria-label*='decline' i]",
    "button[aria-label*='necessary' i]",
    "button[title*='Rifiut' i]",
  ];

  const ACCEPT = [
    "#onetrust-accept-btn-handler",
    "#CybotCookiebotDialogBodyButtonAccept",
    "#CybotCookiebotDialogBodyLevelButtonLevelOptinAllowAll",
    ".qc-cmp2-summary-buttons button[mode='primary']",
    "#didomi-notice-agree-button",
    ".uc-accept-button",
    "#uc-btn-accept-banner",
    "[data-testid='accept-all-button']",
    ".truste-button1",
    ".cc-allow",
    ".cc-dismiss",
    ".cookie-accept",
    ".accept-cookies",
    ".cmpboxbtnyes",
    ".cky-btn-accept",
    ".cmplz-accept",
    ".iubenda-cs-accept-btn",
    ".osano-cm-accept-all",
    "button[aria-label*='accept' i]",
    "button[aria-label*='agree' i]",
    "button[aria-label*='allow' i]",
    // Sourcepoint accept-all
    ".sp_choice_type_11",
    ".sp_choice_type_ACCEPT_ALL",
    "button[title*='Accett' i]",
    // Google / YouTube consent
    "form[action*='consent'] button",
    "button[jsname='b3VHJd']",
  ];

  const REJECT_TEXT = [
    "reject all", "reject", "decline", "disagree", "refuse", "necessary only",
    "only necessary", "continua senza accettare", "rifiuta", "rifiuta tutto",
    "отхвърли", "откажи", "само необходимите", "ablehnen", "alle ablehnen", "nur notwendige",
  ];
  const ACCEPT_TEXT = [
    "accept all", "accept", "agree", "i agree", "got it", "allow all", "ok",
    "accetta", "accetta tutto", "acconsenti", "ho capito",
    "приемам", "приеми", "разбрах", "akzeptieren", "alle akzeptieren", "zustimmen",
  ];

  // Classes consent managers (and the sites hosting them) put on <html>/<body>
  // to lock scrolling or dim the page while the dialog is open.
  const LOCK_CLASS_RE = /(^|[-_])(no|lock|locked|prevent|disable)[-_]?scroll(ing)?($|[-_])|scroll[-_]?(lock|locked|disabled|frozen)|modal[-_]?open|overflow[-_]?hidden|is[-_]?locked|body[-_]?lock(ed)?|(consent|cookie|cookies|gdpr|privacy|cmp|didomi|sp|cc|tp|ot|onetrust|uc|usercentrics|cky|osano|iubenda|cmplz|termly)[-_]?(popup|modal|message|dialog|banner|notice|wall)?[-_]?(open|active|shown|visible|showing)$|^(sp-message-open|didomi-popup-open|ot-overflow-hidden|onetrust-pc-open|cmp-modal-open|cc-modal-open|tp-modal-open|cky-modal-open|is-blurred|blurred|blur)$/i;
  const OVERLAY_NAME_RE = /overlay|backdrop|veil|scrim|dimmer|dim-layer|mask|curtain|blur|shade|dark-filter|darkfilter|cookie|consent|gdpr|cmp/i;

  // Query across the document and any open shadow roots.
  function deepQuery(selector, deep) {
    const out = [];
    const collect = (root) => {
      let found;
      try {
        found = root.querySelectorAll(selector);
      } catch {
        return;
      }
      for (const el of found) out.push(el);
      if (!deep) return;
      for (const el of root.querySelectorAll("*")) {
        if (el.shadowRoot) collect(el.shadowRoot);
      }
    };
    collect(document);
    return out;
  }

  // "Visible" = has layout. A banner cloaked by cookies.css (visibility:hidden)
  // still has layout on purpose, so its buttons stay clickable here.
  function visible(el) {
    return el && el.offsetParent !== null && el.getClientRects().length > 0;
  }

  function clickFirst(selectors, deep) {
    for (const sel of selectors) {
      for (const el of deepQuery(sel, deep)) {
        if (visible(el)) {
          try {
            el.click();
            return true;
          } catch {}
        }
      }
    }
    return false;
  }

  function clickByText(words, deep) {
    const buttons = deepQuery("button, a[role='button'], [role='button'], input[type='button'], input[type='submit']", deep);
    for (const b of buttons) {
      const t = (b.textContent || b.value || "").trim().toLowerCase();
      if (!t || t.length > 32 || !visible(b)) continue;
      if (words.some((w) => t === w || t.startsWith(w))) {
        try {
          b.click();
          return true;
        } catch {}
      }
    }
    return false;
  }

  function seeBanner(deep) {
    if (bannerSeen) return true;
    for (const sel of BANNERS) {
      if (deepQuery(sel, deep).length) {
        bannerSeen = true;
        break;
      }
    }
    if (bannerSeen) {
      try { document.documentElement.classList.add("tbab-cookies-seen"); } catch {}
    }
    return bannerSeen;
  }

  // ---- Page usability cleanup ---------------------------------------------
  // Only ever runs when a consent banner was seen on this page (or a consent
  // button was clicked): every step below is also what a legitimate modal
  // would need, and we must not touch those on unrelated pages.
  function cs(el) {
    try { return getComputedStyle(el); } catch { return null; }
  }
  function viewport() {
    return { w: window.innerWidth || document.documentElement.clientWidth || 0, h: window.innerHeight || document.documentElement.clientHeight || 0 };
  }
  function coversViewport(el, frac) {
    const { w, h } = viewport();
    if (!w || !h) return false;
    let r;
    try { r = el.getBoundingClientRect(); } catch { return false; }
    return r.width >= w * frac && r.height >= h * frac;
  }
  function hasInteractiveContent(el) {
    try {
      if ((el.textContent || "").trim().length > 40) return true;
      return !!el.querySelector("iframe, video, img, canvas, input, select, textarea, a[href], button, [role='button'], [contenteditable]");
    } catch { return true; }
  }
  function unlockScroll(el) {
    if (!el) return;
    try {
      for (const c of Array.from(el.classList)) {
        if (LOCK_CLASS_RE.test(c)) el.classList.remove(c);
      }
    } catch {}
    try {
      const st = el.style;
      if (st.overflow === "hidden" || st.overflowY === "hidden") { st.removeProperty("overflow"); st.removeProperty("overflow-y"); }
      if (st.position === "fixed") { st.removeProperty("position"); st.removeProperty("top"); st.removeProperty("left"); st.removeProperty("width"); }
      st.removeProperty("pointer-events");
      st.removeProperty("filter");
      st.removeProperty("backdrop-filter");
    } catch {}
    try { el.removeAttribute("inert"); } catch {}
    try { if (el.getAttribute("aria-hidden") === "true") el.removeAttribute("aria-hidden"); } catch {}
  }
  function unlock() {
    if (!bannerSeen && !clicked) return;
    const html = document.documentElement;
    const body = document.body;
    unlockScroll(html);
    unlockScroll(body);
    if (!body) return;

    // 1) Full-viewport fixed layers with no content of their own: backdrops,
    //    veils, dark filters and blur layers (by name, or by looking like one).
    let layers;
    try { layers = body.querySelectorAll("body > *, body > * > *"); } catch { layers = []; }
    for (const el of layers) {
      if (!(el instanceof Element)) continue;
      const id = el.id || "";
      if (/^tbab/.test(id)) continue; // our own picker/zapper UI
      const s = cs(el);
      if (!s || (s.position !== "fixed" && s.position !== "absolute")) continue;
      if (s.display === "none" || s.visibility === "hidden") continue;
      if (!coversViewport(el, 0.9)) continue;
      const name = id + " " + (typeof el.className === "string" ? el.className : "");
      const looksLikeVeil = OVERLAY_NAME_RE.test(name) || (s.backdropFilter && s.backdropFilter !== "none");
      if (!looksLikeVeil) continue;
      if (hasInteractiveContent(el)) continue;
      try {
        el.style.setProperty("display", "none", "important");
        el.dataset.tbabVeil = "1";
      } catch {}
    }

    // 2) Page wrappers blurred/dimmed "until you consent", or made inert.
    let wrappers;
    try { wrappers = body.querySelectorAll("body > *, body > * > *, main, #app, #root, #__next, #content, .page, .site, .wrapper, .container"); } catch { wrappers = []; }
    let n = 0;
    for (const el of wrappers) {
      if (n++ > 120) break;
      if (!(el instanceof Element)) continue;
      if (el.dataset && el.dataset.tbabVeil) continue;
      try { if (el.hasAttribute("inert")) el.removeAttribute("inert"); } catch {}
      const s = cs(el);
      if (!s) continue;
      const blurred = /blur\(/.test(s.filter || "") || /blur\(/.test(s.backdropFilter || "");
      const noPointer = s.pointerEvents === "none";
      if (!blurred && !noPointer) continue;
      if (!coversViewport(el, 0.5)) continue;
      try {
        if (blurred) { el.style.setProperty("filter", "none", "important"); el.style.setProperty("backdrop-filter", "none", "important"); }
        if (noPointer) el.style.setProperty("pointer-events", "auto", "important");
        for (const c of Array.from(el.classList)) if (/blur/i.test(c)) el.classList.remove(c);
      } catch {}
    }

    // 3) Scroll lock applied by stylesheet (class already removed above may not
    //    be the one): if the page still cannot scroll, force it.
    for (const el of [html, body]) {
      const s = cs(el);
      if (!s) continue;
      if (s.overflowY === "hidden" || s.overflow === "hidden") {
        try { el.style.setProperty("overflow", "auto", "important"); } catch {}
      }
      if (el === body && s.position === "fixed") {
        try { el.style.setProperty("position", "static", "important"); } catch {}
      }
    }
  }

  function dismiss(deep) {
    if (!active) return;
    seeBanner(deep);
    const ok =
      clickFirst(REJECT, deep) ||
      clickFirst(ACCEPT, deep) ||
      clickByText(REJECT_TEXT, deep) ||
      clickByText(ACCEPT_TEXT, deep);
    if (ok) {
      clicked = true;
      try { document.documentElement.classList.add("tbab-cookies-seen"); } catch {}
      // Let the CMP finish its own teardown, then sweep what it left behind.
      setTimeout(unlock, 350);
      setTimeout(unlock, 1500);
    }
    unlock();
  }

  function harden() {
    if (hardened || !active) return;
    hardened = true;
    try { document.documentElement.classList.add("tbab-cookies-hard"); } catch {}
    unlock();
  }

  function enable() {
    active = true;
    document.documentElement.classList.add("tbab-cookies");
    dismiss(true);

    // Light passes on DOM changes, throttled so busy pages stay smooth.
    let queued = false;
    new MutationObserver(() => {
      if (queued) return;
      queued = true;
      setTimeout(() => {
        queued = false;
        dismiss(false);
      }, 400);
    }).observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ["class", "style", "inert"] });

    // A few deeper passes catch shadow-DOM and late banners; after the click
    // window whatever is still there is removed from layout for good.
    let n = 0;
    const t = setInterval(() => {
      if (!active || n++ > 10) { clearInterval(t); harden(); return; }
      dismiss(true);
    }, 700);
    setTimeout(harden, 4000);
  }

  chrome.storage?.local.get(["enabled", "features"], (data) => {
    if (data.enabled !== false && (data.features || {}).cookies !== false) enable();
  });

  chrome.storage?.onChanged.addListener((changes) => {
    if (!changes.features) return;
    const on = (changes.features.newValue || {}).cookies !== false;
    if (on && !active) enable();
    else if (!on) {
      active = false;
      document.documentElement.classList.remove("tbab-cookies", "tbab-cookies-hard", "tbab-cookies-seen");
    }
  });
})();
