// Dismiss cookie / consent banners by clicking reject (or accept as a fallback).
(function () {
  let active = false;

  const REJECT = [
    "#onetrust-reject-all-handler",
    ".onetrust-close-btn-handler",
    "#CybotCookiebotDialogBodyButtonDecline",
    "#CybotCookiebotDialogBodyLevelButtonLevelOptinDeclineAll",
    ".qc-cmp2-summary-buttons button[mode='secondary']",
    ".didomi-continue-without-agreeing",
    "button#didomi-notice-disagree-button",
    ".uc-deny-button",
    "#uc-btn-deny-banner",
    "button[data-testid='uc-deny-all-button']",
    "#truste-consent-required",
    ".truste-button2",
    ".cc-deny",
    ".cookie-decline",
    "button[aria-label*='reject' i]",
    "button[aria-label*='decline' i]",
  ];

  const ACCEPT = [
    "#onetrust-accept-btn-handler",
    "#CybotCookiebotDialogBodyButtonAccept",
    "#CybotCookiebotDialogBodyLevelButtonLevelOptinAllowAll",
    ".qc-cmp2-summary-buttons button[mode='primary']",
    "#didomi-notice-agree-button",
    ".uc-accept-button",
    "#uc-btn-accept-banner",
    ".truste-button1",
    ".cc-allow",
    ".cc-dismiss",
    ".cookie-accept",
    ".accept-cookies",
    "button[aria-label*='accept' i]",
    "button[aria-label*='agree' i]",
  ];

  const REJECT_TEXT = ["reject", "decline", "disagree", "refuse", "necessary only"];
  const ACCEPT_TEXT = ["accept", "agree", "got it", "ok", "allow all"];

  function clickFirst(selectors) {
    for (const sel of selectors) {
      const el = document.querySelector(sel);
      if (el && el.offsetParent !== null) {
        try {
          el.click();
          return true;
        } catch {}
      }
    }
    return false;
  }

  function clickByText(words) {
    for (const b of document.querySelectorAll("button, a[role='button'], [role='button']")) {
      const t = (b.textContent || "").trim().toLowerCase();
      if (!t || t.length > 30) continue;
      if (words.some((w) => t === w || t.includes(w))) {
        try {
          b.click();
          return true;
        } catch {}
      }
    }
    return false;
  }

  function dismiss() {
    if (!active) return;
    clickFirst(REJECT) ||
      clickFirst(ACCEPT) ||
      clickByText(REJECT_TEXT) ||
      clickByText(ACCEPT_TEXT);
  }

  function enable() {
    active = true;
    document.documentElement.classList.add("tbab-cookies");
    dismiss();
    new MutationObserver(dismiss).observe(document.documentElement, {
      childList: true,
      subtree: true,
    });
    let n = 0;
    const t = setInterval(() => {
      if (!active || n++ > 8) return clearInterval(t);
      dismiss();
    }, 800);
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
