// Dismiss cookie / consent banners by clicking reject (or accept as a fallback).
// Handles open shadow DOM, where many modern consent managers live.
(function () {
  let active = false;

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
  ];
  const ACCEPT_TEXT = [
    "accept all", "accept", "agree", "i agree", "got it", "allow all", "ok",
    "accetta", "accetta tutto", "acconsenti", "ho capito",
  ];

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
    const buttons = deepQuery("button, a[role='button'], [role='button'], input[type='button']", deep);
    for (const b of buttons) {
      const t = (b.textContent || b.value || "").trim().toLowerCase();
      if (!t || t.length > 25 || !visible(b)) continue;
      if (words.some((w) => t === w || t.startsWith(w))) {
        try {
          b.click();
          return true;
        } catch {}
      }
    }
    return false;
  }

  function dismiss(deep) {
    if (!active) return;
    clickFirst(REJECT, deep) ||
      clickFirst(ACCEPT, deep) ||
      clickByText(REJECT_TEXT, deep) ||
      clickByText(ACCEPT_TEXT, deep);
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
    }).observe(document.documentElement, { childList: true, subtree: true });

    // A few deeper passes catch shadow-DOM and late banners.
    let n = 0;
    const t = setInterval(() => {
      if (!active || n++ > 10) return clearInterval(t);
      dismiss(true);
    }, 700);
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
      document.documentElement.classList.remove("tbab-cookies");
    }
  });
})();
