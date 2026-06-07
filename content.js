// Few-Few AdBlocker - content script
// Скрива рекламни елементи, които не са блокирани на мрежово ниво (козметично филтриране).

(function () {
  let enabled = true;

  // CSS селектори за често срещани рекламни контейнери.
  const AD_SELECTORS = [
    "[id^='google_ads_']",
    "[id^='div-gpt-ad']",
    "[id*='-ad-']",
    "[class*='ad-banner']",
    "[class*='ad-container']",
    "[class*='ad-wrapper']",
    "[class*='advertisement']",
    "[class*='sponsored']",
    "[class^='ad-']",
    "[class$='-ad']",
    "[class*=' ad ']",
    "ins.adsbygoogle",
    "iframe[src*='doubleclick']",
    "iframe[src*='googlesyndication']",
    "iframe[src*='/ads/']",
    "iframe[id*='google_ads']",
    "[aria-label='Advertisement']",
    "[data-ad-slot]",
    "[data-ad-client]",
    ".taboola",
    ".outbrain",
    ".trc_related_container",
    "#taboola-below-article",
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
