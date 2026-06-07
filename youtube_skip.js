// Fallback for any ad that still starts: skip it, fast-forward, mute, and
// dismiss anti-adblock pause overlays. Also clears in-player ad UI.
(function () {
  "use strict";

  let enabled = true;

  const SKIP = [
    ".ytp-ad-skip-button",
    ".ytp-ad-skip-button-modern",
    ".ytp-skip-ad-button",
    ".ytp-ad-skip-button-container button",
    ".ytp-ad-overlay-close-button",
    ".ytp-ad-overlay-close-container",
    "button.ytp-ad-skip-button-modern",
    ".ytp-ad-survey-answer-button",
  ];

  function run() {
    if (!enabled) return;

    const player = document.querySelector(".html5-video-player");
    const video = document.querySelector("video.html5-main-video, video");

    if (player?.classList.contains("ad-showing") && video) {
      try {
        if (video.duration && isFinite(video.duration) && video.duration > 0) {
          video.currentTime = video.duration;
        }
        video.muted = true;
        video.playbackRate = 16;
      } catch {}
    }

    for (const sel of SKIP) {
      document.querySelectorAll(sel).forEach((b) => {
        try {
          b.click();
        } catch {}
      });
    }

    const dismiss = document.querySelector("tp-yt-paper-button#dismiss-button");
    if (dismiss) {
      try {
        dismiss.click();
      } catch {}
    }
  }

  function start() {
    run();
    new MutationObserver(run).observe(document.documentElement, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["class"],
    });
    setInterval(run, 300);
  }

  chrome.storage?.local.get("enabled", (data) => {
    enabled = data.enabled !== false;
    if (enabled) start();
  });

  chrome.storage?.onChanged.addListener((c) => {
    if (c.enabled) enabled = c.enabled.newValue !== false;
  });
})();
