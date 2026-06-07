// Few-Few AdBlocker - content script
// Скрива рекламни елементи, които не са блокирани на мрежово ниво (козметично филтриране).

(function () {
  let enabled = true;

  // CSS селектори за често срещани рекламни контейнери.
  const AD_SELECTORS = [
    // ID-базирани
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
    // Class-базирани
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
    // Data атрибути
    "[data-ad-slot]",
    "[data-ad-client]",
    "[data-ad-unit]",
    "[data-ad]",
    "[data-google-query-id]",
    "[data-adunit]",
    // iframes
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
    // ARIA / семантични
    "[aria-label='Advertisement']",
    "[aria-label='Ad']",
    // Известни мрежи
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

  // Текстови сигнали за "Реклама / Sponsored" над контейнери.
  const AD_TEXT_HINTS = ["advertisement", "sponsored", "реклама", "advert"];

  function hideAds(root = document) {
    if (!enabled) return;
    let hidden = 0;
    AD_SELECTORS.forEach((sel) => {
      let nodes;
      try {
        nodes = root.querySelectorAll(sel);
      } catch (e) {
        return;
      }
      nodes.forEach((el) => {
        if (el.dataset.fewfewHidden) return;
        el.dataset.fewfewHidden = "1";
        el.style.setProperty("display", "none", "important");
        hidden++;
      });
    });
    return hidden;
  }

  // Премахва празни "sticky" рекламни placeholder-и, които оставят празно място.
  function cleanupPlaceholders() {
    if (!enabled) return;
    document.querySelectorAll("[data-fewfew-hidden]").forEach((el) => {
      const parent = el.parentElement;
      if (parent && parent.children.length === 1 && parent.offsetHeight < 5) {
        parent.style.setProperty("display", "none", "important");
      }
    });
  }

  // Стартиране само ако blocking-а е включен.
  chrome.storage?.local.get("enabled", (data) => {
    enabled = data.enabled !== false;
    if (enabled) start();
  });

  chrome.storage?.onChanged.addListener((changes) => {
    if (changes.enabled) {
      enabled = changes.enabled.newValue !== false;
      if (enabled) start();
    }
  });

  function start() {
    hideAds();
    cleanupPlaceholders();

    // Наблюдава динамично зареждани реклами.
    const observer = new MutationObserver((mutations) => {
      if (!enabled) return;
      for (const m of mutations) {
        m.addedNodes.forEach((node) => {
          if (node.nodeType === 1) {
            hideAds(node.parentNode || document);
          }
        });
      }
    });

    if (document.documentElement) {
      observer.observe(document.documentElement, {
        childList: true,
        subtree: true,
      });
    }

    // Периодична проверка за бавно зареждащи се реклами.
    let runs = 0;
    const interval = setInterval(() => {
      if (!enabled || runs++ > 10) {
        clearInterval(interval);
        return;
      }
      hideAds();
      cleanupPlaceholders();
    }, 1000);
  }
})();
