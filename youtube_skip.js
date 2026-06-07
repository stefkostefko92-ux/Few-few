// Few-Few AdBlocker - YouTube auto-skip (isolated world)
// Резервен слой: ако реклама все пак стартира, тя се превърта до края,
// заглушава се и Skip бутонът се натиска автоматично. Също скрива
// рекламните елементи в интерфейса (masthead, in-feed, overlay банери).

(function () {
  "use strict";

  let enabled = true;

  const SKIP_SELECTORS = [
    ".ytp-ad-skip-button",
    ".ytp-ad-skip-button-modern",
    ".ytp-skip-ad-button",
    ".ytp-ad-skip-button-container button",
    ".ytp-ad-overlay-close-button",
    ".ytp-ad-overlay-close-container",
    "button.ytp-ad-skip-button-modern",
    ".ytp-ad-survey-answer-button",
  ];

  function nukeAds() {
    if (!enabled) return;

    const player = document.querySelector(".html5-video-player");
    const video = document.querySelector("video.html5-main-video, video");

    // Ако в момента се върти реклама -> превърти до края и заглуши.
    if (player && player.classList.contains("ad-showing") && video) {
      try {
        if (video.duration && isFinite(video.duration) && video.duration > 0) {
          video.currentTime = video.duration;
        }
        video.muted = true;
        video.playbackRate = 16;
      } catch (e) {}
    }

    // Натисни всеки наличен Skip / close бутон.
    SKIP_SELECTORS.forEach((sel) => {
      document.querySelectorAll(sel).forEach((btn) => {
        try {
          btn.click();
        } catch (e) {}
      });
    });

    // Затвори "Видеото е на пауза" overlay-и, които спират при ad-block.
    const dismiss = document.querySelector(
      ".ytp-ad-skip-button-modern, tp-yt-paper-button#dismiss-button"
    );
    if (dismiss) {
      try {
        dismiss.click();
      } catch (e) {}
    }
  }

  function start() {
    nukeAds();

    const observer = new MutationObserver(() => nukeAds());
    if (document.documentElement) {
      observer.observe(document.documentElement, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ["class"],
      });
    }

    // Бърз интервал за гарантирано прескачане.
    setInterval(nukeAds, 300);
  }

  chrome.storage?.local.get("enabled", (data) => {
    enabled = data.enabled !== false;
    if (enabled) start();
  });

  chrome.storage?.onChanged.addListener((changes) => {
    if (changes.enabled) enabled = changes.enabled.newValue !== false;
  });
})();
