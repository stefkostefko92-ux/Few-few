// Dismiss cookie / consent banners by clicking reject (or accept as a fallback),
// then make sure the page is USABLE: no leftover backdrop, blur, scroll lock or
// `inert` — the things a consent manager only tears down when its own button is
// pressed. Handles open shadow DOM and runs in every frame (Sourcepoint & co.
// render their dialog in an iframe).
//
// Three rules keep this from ever acting on anything that is not a consent
// banner (all three were broken before 5.0.4):
//  1. WHAT we click. Consent-manager-specific controls (#onetrust-…, .cmpbox…)
//     name a CMP button and nothing else, so they are clicked wherever they
//     appear. Everything generic — aria-label/title/test-id selectors and the
//     "Accept"/"Decline"/"OK" text match — is ONLY looked for inside a consent
//     root (consentRoots()). It used to run over the whole page, so it could
//     accept a LinkedIn invitation, decline a Teams call or confirm an "OK"
//     dialog in any web app.
//  2. WHEN we clean up. unlock() only runs inside a short window around a real
//     banner sighting or our own click, and the page-wide backdrop CSS is
//     dropped when the window closes — a modal the user opens later is theirs.
//  3. HOW we hide. cookies.css only CLOAKS a banner (visibility:hidden keeps its
//     layout) so its button stays clickable; a banner we could not dismiss is
//     removed from layout per element, HARD_MS after it first showed up — so a
//     banner that appears late still gets its full click window.
(function () {
  "use strict";
  let active = false;
  let windowUntil = 0; // cleanup (unlock) is allowed until this timestamp
  let finalizeTimer = 0;
  let lastDeep = 0;
  let rejected = false; // we pressed a Reject on this page — Accept is off from now on
  const HARD_MS = 4000;  // an undismissed banner leaves layout this long after it first rendered
  const GRACE_MS = 6000; // cleanup keeps running this long after the last sighting / click
  const firstSeen = new WeakMap();
  const clickedEls = new WeakSet();

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
    ".iubenda-cs-container", "#iubenda-cs-banner", ".osano-cm-window", ".termly-styles-root",
    ".cky-consent-container", "#cookie-consent-banner", "#gdpr-consent-tool-wrapper",
    "ytd-consent-bump-v2-lightbox", "[id^=\"sp_message_container_\"]",
    "[class*=\"cookie-consent\"]", "[class*=\"cookie-banner\"]", "[class*=\"cookie-notice\"]",
    "[class*=\"consent-banner\"]", "[class*=\"CookieConsent\"]", "[id*=\"cookie-banner\"]",
    "[id*=\"cookie-consent\"]", "[id*=\"cookieConsent\"]",
    "[aria-label*=\"cookie\" i][role=\"dialog\"]", "[aria-label*=\"consent\" i][role=\"dialog\"]",
    "[aria-describedby*=\"cookie\" i]",
  ];

  // Same list as the html.tbab-cookies-seen backdrop block of cookies.css.
  const BACKDROPS = [
    ".modal-backdrop", ".cookie-overlay", ".cc-overlay", ".cc-backdrop", ".sp_veil",
    ".sp_dialog_overlay", "#onetrust-pc-dark-filter", ".onetrust-pc-dark-filter",
    ".didomi-popup-backdrop", ".fc-dialog-overlay", ".cky-overlay", ".cmplz-overlay",
    ".iubenda-cs-overlay", ".osano-cm-dialog__backdrop", ".termly-overlay", ".cmpboxBG",
    ".uc-overlay", ".usercentrics-overlay", ".tp-backdrop", ".gdpr-overlay",
    ".cookie-modal-backdrop", ".cookiewall-overlay", ".cookie-wall-overlay", ".consent-overlay",
    "[class*=\"cookie-overlay\"]", "[class*=\"cookie-backdrop\"]", "[class*=\"consent-overlay\"]",
    "[class*=\"consent-backdrop\"]", "[id*=\"cookie-overlay\"]", "[id*=\"consent-overlay\"]",
  ];

  // Tier A — consent-manager-specific controls. Each one names a CMP button and
  // nothing else, so it is safe to click wherever it is found (also inside a CMP
  // iframe). NEVER add a generic selector here (tests/cookies.test.mjs guards it).
  const REJECT_CMP = [
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
    "#truste-consent-required",
    ".truste-button2",
    ".cookie-decline",
    ".cmpboxbtnno",
    ".cky-btn-reject",
    ".cmplz-deny",
    ".iubenda-cs-reject-btn",
    ".iubenda-cs-close-btn", // «Continua senza accettare» — iubenda's own free reject
    ".osano-cm-denyAll",
    // Sourcepoint (Mediaset, many EU media sites), rendered inside an iframe
    ".sp_choice_type_13",
    ".sp_choice_type_REJECT_ALL",
  ];
  const ACCEPT_CMP = [
    "#onetrust-accept-btn-handler",
    "#CybotCookiebotDialogBodyButtonAccept",
    "#CybotCookiebotDialogBodyLevelButtonLevelOptinAllowAll",
    ".qc-cmp2-summary-buttons button[mode='primary']",
    "#didomi-notice-agree-button",
    ".uc-accept-button",
    "#uc-btn-accept-banner",
    ".truste-button1",
    ".cookie-accept",
    ".accept-cookies",
    ".cmpboxbtnyes",
    ".cky-btn-accept",
    ".cmplz-accept",
    ".iubenda-cs-accept-btn",
    ".osano-cm-accept-all",
    ".sp_choice_type_11",
    ".sp_choice_type_ACCEPT_ALL",
  ];

  // Tier B — generic. On their own these match real application buttons, so
  // they are ONLY searched inside a consent root.
  const REJECT_GENERIC = [
    "[data-testid='reject-all-button']",
    ".cc-deny",
    "button[title='Continua senza accettare']",
    "button[aria-label*='reject' i]",
    "button[aria-label*='decline' i]",
    "button[aria-label*='necessary' i]",
    "button[title*='Rifiut' i]",
  ];
  const ACCEPT_GENERIC = [
    "[data-testid='accept-all-button']",
    ".cc-allow",
    ".cc-dismiss",
    "button[aria-label*='accept' i]",
    "button[aria-label*='agree' i]",
    "button[title*='Accett' i]",
    // Google consent dialog / consent.google.* page (a root only there)
    "button[jsname='b3VHJd']",
  ];
  // NOT here, on purpose: `form[action*='consent'] button` (also matches OAuth
  // consent screens — "Allow" access to your account) and
  // `button[aria-label*='allow' i]` (OAuth / permission prompts).

  const REJECT_TEXT = [
    "reject all", "reject", "decline", "disagree", "refuse", "deny",
    "necessary only", "only necessary", "essential only", "only essential",
    "accept necessary", "accept only necessary", "use necessary cookies only",
    "continue without accepting", "continua senza accettare", "rifiuta", "rifiuta tutto",
    "solo necessari", "ablehnen", "alle ablehnen", "nur notwendige", "nur essenzielle",
    "tout refuser", "refuser", "continuer sans accepter", "rechazar", "rechazar todo",
    "отхвърли", "откажи", "отказвам", "само необходимите",
  ];
  const ACCEPT_TEXT = [
    "accept all", "accept", "agree", "i agree", "got it", "allow all", "ok",
    "accetta", "accetta tutto", "accetta tutti", "acconsenti", "ho capito",
    "akzeptieren", "alle akzeptieren", "zustimmen", "einverstanden",
    "tout accepter", "accepter", "aceptar", "aceptar todo",
    "приемам", "приеми", "приеми всички", "разбрах", "съгласен съм",
  ];
  const BUTTONS = "button, a[role='button'], [role='button'], input[type='button'], input[type='submit']";

  // A dialog / fixed bar that TALKS about cookies is a consent root — every EU
  // banner says "cookie" (it is the legal term in every language we target).
  // "consent" / "privacy" alone is not enough: OAuth consent screens and
  // terms-of-service updates use those words, and we must never accept either
  // on the user's behalf.
  const COOKIE_WORD_RE = /cookie|бисквитк|\bgdpr\b|\brgpd\b|\bdsgvo\b|\btcf\b/i;
  // Authorization / sign-in / payment pages: the generic and text tiers are OFF there,
  // whatever the page says (a hostile site can navigate the user to an OAuth
  // "Allow" page whose app name contains "cookie"). CMP-specific controls stay.
  const AUTH_PATH_RE = /\/(o\/)?oauth2?(\/|\b)|\/authori[sz]e\b|\/consent(\/|\b)|\/log-?in\b|\/sign-?in\b|\/sso\b|\/saml\b|\/openid\b|\/auth(\/|\b)|\/checkout\b|\/payments?\b|\/pay\b|\/billing\b|\/purchase\b/i;
  const AUTH_HOST_RE = /^(accounts\.google\.[a-z.]+|login\.microsoftonline\.com|login\.live\.com|login\.windows\.net|appleid\.apple\.com|[a-z0-9-]+\.okta\.com|[a-z0-9-]+\.auth0\.com|(www\.)?paypal\.com|(auth|login|sso|id|accounts|checkout|pay|payment|payments|billing)\.[a-z0-9.-]+)$/i;
  // Documents that ARE the consent UI: Google's consent pages and CMP iframes.
  const CONSENT_PAGE_HOST_RE = /^consent\.(google\.[a-z.]+|youtube\.com)$/i;
  const CMP_FRAME_HOST_RE = /(^|\.)(privacy-mgmt\.com|sp-prod\.net|trustarc\.com|truste\.com|consentmanager\.net|cookielaw\.org|onetrust\.com|usercentrics\.eu|cookiebot\.com|didomi\.io)$/i;

  // Classes consent managers (and the sites hosting them) put on <html>/<body>
  // to lock scrolling or dim the page while the dialog is open.
  const LOCK_CLASS_RE = /(^|[-_])(no|lock|locked|prevent|disable)[-_]?scroll(ing)?($|[-_])|scroll[-_]?(lock|locked|disabled|frozen)|modal[-_]?open|overflow[-_]?hidden|is[-_]?locked|body[-_]?lock(ed)?|(consent|cookie|cookies|gdpr|privacy|cmp|didomi|sp|cc|tp|ot|onetrust|uc|usercentrics|cky|osano|iubenda|cmplz|termly)[-_]?(popup|modal|message|dialog|banner|notice|wall)?[-_]?(open|active|shown|visible|showing)$|^(sp-message-open|didomi-popup-open|ot-overflow-hidden|onetrust-pc-open|cmp-modal-open|cc-modal-open|tp-modal-open|cky-modal-open|is-blurred|blurred|blur)$/i;
  const OVERLAY_NAME_RE = /overlay|backdrop|veil|scrim|dimmer|dim-layer|mask|curtain|blur|shade|dark-filter|darkfilter|cookie|consent|gdpr|cmp/i;

  // One query per LIST, not per selector: a pass used to run ~150 full-document
  // querySelectorAll calls, which on a page that changes every frame (Speedtest's
  // gauge) ate the main thread and lowered the measured speed. All lists are our
  // own static, valid selectors (a bad one would also break the cookies.css block).
  const BANNERS_SEL = BANNERS.join(", ");
  const BACKDROPS_SEL = BACKDROPS.join(", ");
  const CMP_SEL = REJECT_CMP.concat(ACCEPT_CMP).join(", ");

  // ---- DOM helpers -----------------------------------------------------------
  // Open shadow roots are collected ONCE per pass (passRoots), not once per
  // selector: walking querySelectorAll("*") for every selector made a deep pass
  // O(selectors × DOM).
  let passRoots = null;
  function rootsOf(root, deep) {
    if (!deep) return root.shadowRoot ? [root.shadowRoot, root] : [root];
    const cached = passRoots && passRoots.get(root);
    if (cached) return cached;
    const out = [];
    const walk = (r) => {
      out.push(r);
      try { for (const el of r.querySelectorAll("*")) if (el.shadowRoot) walk(el.shadowRoot); } catch {}
    };
    if (root.shadowRoot) walk(root.shadowRoot);
    walk(root);
    if (passRoots) passRoots.set(root, out);
    return out;
  }
  function inPass(fn) {
    const outer = passRoots;
    passRoots = outer || new Map();
    try { return fn(); } finally { passRoots = outer; }
  }
  // Query across the document and any open shadow roots.
  function deepQuery(selector, deep) {
    return queryIn(document, selector, deep);
  }
  function queryIn(root, selector, deep) {
    const out = [];
    for (const r of rootsOf(root, deep)) {
      try { for (const el of r.querySelectorAll(selector)) out.push(el); } catch { return out; }
    }
    return out;
  }
  // A CMP control anywhere? Unknown (a throw) counts as yes — never skip a click on doubt.
  function anyIn(root, selector, deep) {
    for (const r of rootsOf(root, deep)) {
      try { if (r.querySelector(selector)) return true; } catch { return true; }
    }
    return false;
  }
  // "Rendered" = has boxes (true for a banner cloaked with visibility:hidden,
  // false once it is display:none). offsetParent is useless here: it is null
  // for position:fixed elements, which is what most banners are.
  function rendered(el) {
    try { return el.getClientRects().length > 0; } catch { return false; }
  }
  // A button is clickable when it has layout — cloaked banners keep theirs. Not
  // offsetParent: it is null for a position:fixed button, which then never got clicked.
  function visible(el) {
    return !!el && rendered(el);
  }
  function cs(el) {
    try { return getComputedStyle(el); } catch { return null; }
  }
  // First `max` characters of an element's text, without materialising the text
  // of a huge subtree (a fixed full-page app wrapper can hold megabytes).
  function textPrefix(el, max) {
    let out = "";
    const walk = (root, depth) => {
      if (depth > 3) return false;
      try {
        const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
        let n = w.currentNode;
        while (n) {
          if (n.nodeType === 3) {
            out += n.nodeValue;
            if (out.length > max) return true;
          } else if (n.shadowRoot && walk(n.shadowRoot, depth + 1)) return true;
          n = w.nextNode();
        }
      } catch {}
      return false;
    };
    const truncated = walk(el, 0);
    return { text: out.slice(0, max), truncated };
  }
  function talksAboutCookies(el) {
    const { text, truncated } = textPrefix(el, 6000);
    if (truncated || text.trim().length < 20) return false; // a notice, not a whole page
    return COOKIE_WORD_RE.test(text);
  }
  function authPage() {
    return AUTH_HOST_RE.test(location.hostname) || AUTH_PATH_RE.test(location.pathname);
  }

  // ---- Where generic clicks are allowed ---------------------------------------
  function consentRoots(deep) {
    const roots = [];
    const add = (el) => { if (el && !roots.includes(el)) roots.push(el); };
    const host = location.hostname;
    let framed = false;
    try { framed = window.top !== window; } catch { framed = true; }
    if (CONSENT_PAGE_HOST_RE.test(host) || (framed && CMP_FRAME_HOST_RE.test(host))) {
      add(document.body || document.documentElement);
      return roots;
    }
    if (authPage()) return roots; // never generic-click on a sign-in / OAuth page
    // A BANNERS match alone is not enough (`[aria-label*="consent" i][role="dialog"]`
    // is also how OAuth consent dialogs are labelled): it must talk about cookies.
    for (const el of deepQuery(BANNERS_SEL, deep)) if (rendered(el) && talksAboutCookies(el)) add(el);

    let cands = [];
    try {
      cands = Array.from(document.querySelectorAll(
        "[role='dialog'], [role='alertdialog'], [aria-modal='true'], dialog[open], body > *, body > * > *"
      )).slice(0, 400);
    } catch {}
    for (const el of cands) {
      if (roots.some((r) => r === el || r.contains(el))) continue;
      const dialogish = el.matches("[role='dialog'], [role='alertdialog'], [aria-modal='true'], dialog[open]");
      if (!dialogish) {
        const s = cs(el);
        if (!s || (s.position !== "fixed" && s.position !== "sticky")) continue;
      }
      if (!rendered(el)) continue;
      if (talksAboutCookies(el)) add(el);
    }
    return roots;
  }

  // ---- Clicking --------------------------------------------------------------
  // A generic click must never submit a form (OAuth "Allow"/"Accept" screens
  // post a CSRF-protected form — clicking it would grant the request) nor follow
  // a link off the page. Only Google's own cookie-consent form is allowed.
  function formOk(el) {
    let f = null;
    try { f = el.form || (el.closest && el.closest("form")); } catch { return false; }
    if (!f) return true;
    if (CONSENT_PAGE_HOST_RE.test(location.hostname)) return true;
    try { return CONSENT_PAGE_HOST_RE.test(new URL(f.getAttribute("action") || "", location.href).hostname); } catch { return false; }
  }
  function anchorOk(el) {
    try {
      if (!el.matches("a[href]")) return true;
      const h = (el.getAttribute("href") || "").trim();
      return h === "" || h.startsWith("#") || /^javascript:\s*(void\s*\(?\s*0\s*\)?)?\s*;?\s*$/i.test(h);
    } catch { return false; }
  }
  function tryClick(el, generic) {
    if (clickedEls.has(el) || !visible(el)) return false;
    if (generic && (!formOk(el) || !anchorOk(el))) return false;
    try {
      el.click();
      clickedEls.add(el);
      return true;
    } catch { return false; }
  }
  // "Pay or accept" walls label their reject button "Reject and subscribe" (iubenda
  // on la Repubblica: «Rifiuta e abbonati»): it opens a paywall that covers the page.
  // That is not a way out, so a reject tier skips it and the next free option wins
  // («Continua senza accettare»), or the accept tier if there is none.
  const PAY_RE = /abbona|subscri|abonn|\babo\b|abschlie|suscr|assin|paga|pagar|payer|\bpay\b|bezahl|zahl|€|£|\$|абонам|плат/i;
  function payWall(el) {
    return PAY_RE.test(norm(el));
  }
  function clickSelectorsIn(roots, selectors, deep, generic, reject) {
    for (const sel of selectors) {
      for (const root of roots) {
        for (const el of queryIn(root, sel, deep)) {
          if (reject && payWall(el)) continue;
          if (tryClick(el, generic)) return true;
        }
      }
    }
    return false;
  }
  function norm(el) {
    return (el.textContent || el.value || "").replace(/\s+/g, " ").trim().toLowerCase();
  }
  function clickTextIn(roots, words, deep, reject) {
    for (const root of roots) {
      for (const b of queryIn(root, BUTTONS, deep)) {
        const t = norm(b);
        if (!t || t.length > 40) continue;
        if (reject && PAY_RE.test(t)) continue;
        if (words.some((w) => t === w || t.startsWith(w))) {
          if (tryClick(b, true)) return true;
        }
      }
    }
    return false;
  }

  // ---- Banner lifecycle ------------------------------------------------------
  // Track each rendered banner: the first sighting opens the cleanup window and
  // schedules a pass for when its click window ends; a banner still rendered
  // HARD_MS later (nothing we could click) is removed from layout.
  function trackBanners(now, deep) {
    let any = false;
    for (const el of deepQuery(BANNERS_SEL, deep)) {
      if (el.dataset && el.dataset.tbabCookieHard) continue;
      if (!rendered(el)) continue;
      any = true;
      const t0 = firstSeen.get(el);
      if (t0 === undefined) {
        firstSeen.set(el, now);
        setTimeout(() => dismiss(true), HARD_MS + 60);
      } else if (now - t0 >= HARD_MS) {
        try {
          el.style.setProperty("display", "none", "important");
          el.dataset.tbabCookieHard = "1";
        } catch {}
      }
    }
    return any;
  }

  function openWindow(now) {
    windowUntil = Math.max(windowUntil, now + GRACE_MS);
    try { document.documentElement.classList.add("tbab-cookies-seen"); } catch {}
    clearTimeout(finalizeTimer);
    finalizeTimer = setTimeout(finalize, windowUntil - now + 50);
  }

  // Scroll lock removal is only safe on a page that has something to scroll: a
  // full-screen app (maps, games) keeps html/body overflow:hidden by design and
  // its content fits the viewport.
  function scrollable() {
    const h = window.innerHeight || document.documentElement.clientHeight || 0;
    const sh = Math.max(document.documentElement.scrollHeight || 0, (document.body && document.body.scrollHeight) || 0);
    return sh > h + 50;
  }

  // ---- Page usability cleanup ------------------------------------------------
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
  function bgAlpha(s) {
    const m = /rgba?\(([^)]+)\)/.exec(s.backgroundColor || "");
    if (!m) return 0;
    const p = m[1].split(",").map((x) => parseFloat(x));
    return p.length === 4 ? p[3] : 1;
  }
  function interceptsCenter(el) {
    const { w, h } = viewport();
    try {
      const hit = document.elementFromPoint(w / 2, h / 2);
      return !!hit && (hit === el || el.contains(hit));
    } catch { return false; }
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
  function forceScrollIfLocked() {
    if (!scrollable()) return;
    for (const el of [document.documentElement, document.body]) {
      const s = el && cs(el);
      if (!s) continue;
      if (s.overflowY === "hidden" || s.overflow === "hidden") {
        try { el.style.setProperty("overflow", "auto", "important"); } catch {}
      }
      if (el === document.body && s.position === "fixed") {
        try { el.style.setProperty("position", "static", "important"); } catch {}
      }
    }
  }

  function unlock(force) {
    if (!force && Date.now() >= windowUntil) return;
    const html = document.documentElement;
    const body = document.body;
    unlockScroll(html);
    unlockScroll(body);
    if (!body) return;

    // 1) Full-viewport fixed layers with no content of their own: a blur layer
    //    (backdrop-filter) always; a dimming veil only when it actually sits on
    //    top and swallows clicks, and looks like one (name or tinted background).
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
      if (hasInteractiveContent(el)) continue;
      const blurLayer = /blur\(/.test(s.backdropFilter || "") || /blur\(/.test(s.webkitBackdropFilter || "");
      const name = id + " " + (typeof el.className === "string" ? el.className : "");
      const veil = interceptsCenter(el) && (OVERLAY_NAME_RE.test(name) || bgAlpha(s) >= 0.1);
      if (!blurLayer && !veil) continue;
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

    // 3) Scroll lock applied by a stylesheet we could not strip.
    forceScrollIfLocked();
  }

  // Window closed: last sweep, pin the leftovers that only our -seen CSS was
  // hiding, then drop the class so later, legitimate modals are left alone.
  function finalize() {
    const now = Date.now();
    if (now < windowUntil) {
      clearTimeout(finalizeTimer);
      finalizeTimer = setTimeout(finalize, windowUntil - now + 50);
      return;
    }
    unlock(true);
    for (const el of deepQuery(BACKDROPS_SEL, false)) {
      try {
        el.style.setProperty("display", "none", "important");
        el.dataset.tbabVeil = "1";
      } catch {}
    }
    try { document.documentElement.classList.remove("tbab-cookies-seen"); } catch {}
    forceScrollIfLocked();
  }

  // Can this mutation bring a banner? html/body attribute changes (lock classes,
  // inert) always count. An added element counts when it is, or contains, a known
  // banner / CMP control / dialog, or sits where consentRoots() looks for unknown
  // banners (body > *, body > * > *). Text-only churn and deep app re-renders —
  // Speedtest's gauge, a clock, a chat — no longer cost a whole-page pass.
  const RELEVANT_SEL = BANNERS_SEL + ", " + CMP_SEL + ", [role='dialog'], [role='alertdialog'], [aria-modal='true'], dialog";
  // Within reach of consentRoots(): body > *, body > * > * — and their children,
  // since content added INTO a fixed candidate can make it a banner.
  function nearTop(el) {
    for (let i = 0, e = el; i < 4 && e; i++, e = e.parentElement) if (e === document.body || e === document.documentElement) return true;
    return !el.parentElement;
  }
  function mayBringBanner(n) {
    if (nearTop(n)) return true;
    try { return n.matches(RELEVANT_SEL) || !!n.querySelector(RELEVANT_SEL) || !!n.shadowRoot; } catch { return true; }
  }
  // A banner can also appear without any node being added: a class/style/hidden/
  // open change on an element already in the page (CookieYes removes `cky-hide`,
  // WordPress plugins set display:block, <dialog>.showModal()). Only such changes
  // near the top or on a known banner/dialog count — an animated gauge deep in the
  // page changes style every frame and must stay free.
  function bringsElements(r) {
    if (r.type === "attributes") {
      const t = r.target;
      if (t === document.documentElement || t === document.body) return true;
      if (t.nodeType !== 1) return false;
      try { return nearTop(t) || t.matches(RELEVANT_SEL); } catch { return true; }
    }
    for (const n of r.addedNodes) if (n.nodeType === 1 && mayBringBanner(n)) return true;
    return false;
  }

  function dismiss(deep) {
    if (!active) return;
    inPass(() => {
      const now = Date.now();
      if (trackBanners(now, deep)) openWindow(now);
      const roots = consentRoots(deep);
      // No consent root and no CMP control on the page → nothing can be clicked;
      // skip the ~60 per-selector queries of the click tiers.
      const clickable = roots.length > 0 || anyIn(document, CMP_SEL, deep);
      const rejectedNow = clickable && (
        clickSelectorsIn([document], REJECT_CMP, deep, false, true) ||
        clickSelectorsIn(roots, REJECT_GENERIC, deep, true, true) ||
        clickTextIn(roots, REJECT_TEXT, deep, true));
      if (rejectedNow && !rejected) {
        try { chrome.runtime.sendMessage({ type: "cookieRejected" }); } catch {}
      }
      if (rejectedNow) rejected = true;
      // Once we said no on this page, never yes: a banner still on screen a moment
      // after our Reject (a closing animation, a "confirm your choice" step) used to
      // get its Accept pressed by the next pass. What cannot be closed is hidden
      // after HARD_MS instead.
      const clicked = rejectedNow || (clickable && !rejected && (
        clickSelectorsIn([document], ACCEPT_CMP, deep, false) ||
        clickSelectorsIn(roots, ACCEPT_GENERIC, deep, true) ||
        clickTextIn(roots, ACCEPT_TEXT, deep)));
      if (clicked) {
        openWindow(now);
        // Let the CMP finish its own teardown, then sweep what it left behind.
        setTimeout(() => unlock(false), 350);
        setTimeout(() => unlock(false), 1500);
      }
      unlock(false);
    });
  }

  let wired = false;
  function enable() {
    active = true;
    document.documentElement.classList.add("tbab-cookies");
    dismiss(true);
    if (wired) return; // observers / timers only once per page
    wired = true;

    // Light passes on DOM changes, throttled so busy pages stay smooth. A pass
    // goes deep (shadow roots) at most once a second, and only while a banner
    // is around — shallow otherwise. Only mutations that can bring a banner
    // (bringsElements) wake it up.
    let queued = false;
    const onMutation = (records) => {
      if (queued || !records.some(bringsElements)) return;
      queued = true;
      setTimeout(() => {
        queued = false;
        const now = Date.now();
        const deep = now < windowUntil && now - lastDeep > 1000;
        if (deep) lastDeep = now;
        dismiss(deep);
      }, 400);
    };
    new MutationObserver(onMutation).observe(document.documentElement, { childList: true, subtree: true });
    // Lock classes / inline styles / inert on <html>/<body>, and banners revealed by
    // an attribute change — filtered in bringsElements() before any work is done.
    new MutationObserver(onMutation).observe(document.documentElement, {
      attributes: true, subtree: true, attributeFilter: ["class", "style", "inert", "hidden", "open"],
    });

    // A few deep passes catch shadow-DOM and late banners (CMPs that load
    // seconds after the page), then a sparse tail.
    let n = 0;
    const t = setInterval(() => {
      if (!active || n++ > 10) { clearInterval(t); return; }
      dismiss(true);
    }, 700);
    for (const ms of [10000, 20000, 40000]) setTimeout(() => dismiss(true), ms);
  }

  function disable() {
    active = false;
    document.documentElement.classList.remove("tbab-cookies", "tbab-cookies-seen");
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
    st.feature = (data.features || {}).cookies !== false;
    st.allowed = onList(data.allowlist);
    applyGate();
  });
  chrome.storage?.onChanged.addListener((changes) => {
    if (changes.enabled) st.enabled = changes.enabled.newValue !== false;
    if (changes.features) st.feature = (changes.features.newValue || {}).cookies !== false;
    if (changes.allowlist) st.allowed = onList(changes.allowlist.newValue);
    if (changes.enabled || changes.features || changes.allowlist) applyGate();
  });
})();
