// Few-Few AdBlocker - cookie / consent banner auto-dismiss
// Автоматично натиска "Откажи" (или "Приеми" като резервен вариант) на
// познатите consent рамки и маха overlay-ите, които спират скрола.

(function () {
  "use strict";

  let active = false;

  // Бутони за отказ (предпочитани) и приемане (резервен) по consent рамки.
  const REJECT_SELECTORS = [
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

  const ACCEPT_SELECTORS = [
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

  // Текстово напасване като последен резервен вариант.
  const REJECT_TEXTS = ["reject", "decline", "откажи", "не приемам", "disagree"];
  const ACCEPT_TEXTS = ["accept", "agree", "приемам", "съгласен", "got it", "разбрах"];

  function clickFirst(selectors) {
    for (const sel of selectors) {
      const el = document.querySelector(sel);
      if (el && el.offsetParent !== null) {
        try {
          el.click();
          return true;
        } catch (e) {}
      }
    }
    return false;
  }

  function clickByText(texts) {
    const buttons = document.querySelectorAll(
      "button, a[role='button'], [role='button']"
    );
    for (const b of buttons) {
      const t = (b.textContent || "").trim().toLowerCase();
      if (!t || t.length > 30) continue;
      if (texts.some((x) => t === x || t.includes(x))) {
        try {
          b.click();
          return true;
        } catch (e) {}
      }
    }
    return false;
  }

  function dismiss() {
    if (!active) return;
    // Първо опитай отказ; ако няма – приеми, за да изчезне банерът.
    if (clickFirst(REJECT_SELECTORS)) return;
    if (clickFirst(ACCEPT_SELECTORS)) return;
    if (clickByText(REJECT_TEXTS)) return;
    clickByText(ACCEPT_TEXTS);
  }

  function enable() {
    active = true;
    document.documentElement.classList.add("fewfew-cookies");
    dismiss();
    const obs = new MutationObserver(() => dismiss());
    if (document.documentElement) {
      obs.observe(document.documentElement, { childList: true, subtree: true });
    }
    // Няколко закъснели опита за бавно зареждащи се банери.
    let n = 0;
    const iv = setInterval(() => {
      if (!active || n++ > 8) return clearInterval(iv);
      dismiss();
    }, 800);
  }

  chrome.storage?.local.get(["enabled", "features"], (data) => {
    const on = data.enabled !== false;
    const cookies = (data.features || {}).cookies !== false;
    if (on && cookies) enable();
  });

  chrome.storage?.onChanged.addListener((changes) => {
    if (changes.features) {
      const cookies = (changes.features.newValue || {}).cookies !== false;
      if (cookies && !active) enable();
      else if (!cookies) {
        active = false;
        document.documentElement.classList.remove("fewfew-cookies");
      }
    }
  });
})();
