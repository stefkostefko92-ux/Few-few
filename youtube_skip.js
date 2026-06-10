// Fallback for any ad that still starts: skip it, fast-forward, mute, and
// dismiss anti-adblock pause overlays. Also clears in-player ad UI.
(function () {
  "use strict";

  let enabled = true;
  let adActive = false;
  let prevMuted = false;
  let prevRate = 1;

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
    const showing = !!player?.classList.contains("ad-showing");

    if (showing && video) {
      // Remember the real playback state once, before we fast-forward the ad.
      if (!adActive) {
        adActive = true;
        prevMuted = video.muted;
        prevRate = video.playbackRate;
      }
      try {
        if (video.duration && isFinite(video.duration) && video.duration > 0) {
          video.currentTime = video.duration;
        }
        video.muted = true;
        video.playbackRate = 16;
      } catch {}
    } else if (adActive && video) {
      // Ad finished, restore the user's mute/speed on the shared element.
      adActive = false;
      try {
        video.playbackRate = prevRate || 1;
        video.muted = prevMuted;
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

    // Anti-adblock enforcement dialog: hiding only the dialog leaves YouTube's
    // full-page backdrop, which swallows every click and locks scrolling. So
    // when an enforcement message is present, remove the dialog AND its
    // backdrop, and restore page interaction.
    const enf = document.querySelector(
      "ytd-enforcement-message-view-model, ytd-enforcement-message-desktop-renderer"
    );
    if (enf) {
      const dialog =
        enf.closest("ytd-popup-container, tp-yt-paper-dialog") || enf;
      try {
        dialog.remove();
      } catch {}
      document
        .querySelectorAll("tp-yt-iron-overlay-backdrop")
        .forEach((b) => {
          try {
            b.remove();
          } catch {}
        });
      const html = document.documentElement;
      const body = document.body;
      html.style.removeProperty("overflow");
      if (body) {
        body.style.removeProperty("overflow");
        body.removeAttribute("scroll-locked");
      }
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

  const host = location.hostname.replace(/^www\./, "");
  const hostMatches = (d) => host === d || host.endsWith("." + d);

  chrome.storage?.local.get(["enabled", "features", "allowlist"], (data) => {
    enabled = data.enabled !== false;
    const ytOn = (data.features || {}).youtube !== false;
    const allowed = (data.allowlist || []).some(hostMatches);
    if (enabled && ytOn && !allowed) start();
  });

  chrome.storage?.onChanged.addListener((c) => {
    if (c.enabled) enabled = c.enabled.newValue !== false;
  });
})();
