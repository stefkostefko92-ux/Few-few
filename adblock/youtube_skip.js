// Fallback for any ad that still starts: skip it, fast-forward, mute, and
// handle YouTube's anti-adblock enforcement. Selector lists are seeded with
// bundled defaults and extended by the live filter update (liveConfig.youtube),
// so when YouTube renames its DOM we can fix it server-side without a re-review.
(function () {
  "use strict";

  let enabled = true;
  let adActive = false;
  let prevMuted = false;
  let prevRate = 1;
  let bypassReloaded = false; // guards the enforcement reload against loops

  const SKIP_DEFAULT = [
    ".ytp-ad-skip-button",
    ".ytp-ad-skip-button-modern",
    ".ytp-skip-ad-button",
    ".ytp-ad-skip-button-container button",
    ".ytp-ad-overlay-close-button",
    ".ytp-ad-overlay-close-container",
    "button.ytp-ad-skip-button-modern",
    ".ytp-ad-survey-answer-button",
  ];
  // Elements that mean YouTube refused to play because it detected us. Kept
  // specific (a generic error class would fire on deleted/private videos and
  // wrongly disable ad removal); renamed dialogs are handled via the live
  // "enforcement" list from the filter update.
  const ENFORCE_DEFAULT = [
    "ytd-enforcement-message-view-model",
    "ytd-enforcement-message-desktop-renderer",
  ];

  let SKIP = SKIP_DEFAULT.slice();
  let ENFORCE = ENFORCE_DEFAULT.slice();
  let HIDE = [];

  function applyConfig(yt) {
    SKIP = SKIP_DEFAULT.concat(Array.isArray(yt?.skip) ? yt.skip : []);
    ENFORCE = ENFORCE_DEFAULT.concat(Array.isArray(yt?.enforcement) ? yt.enforcement : []);
    HIDE = Array.isArray(yt?.hide) ? yt.hide : [];
  }

  function matchAny(selectors) {
    for (const sel of selectors) {
      try {
        const el = document.querySelector(sel);
        if (el) return el;
      } catch {}
    }
    return null;
  }

  function run() {
    if (!enabled) return;

    const player = document.querySelector(".html5-video-player");
    const video = document.querySelector("video.html5-main-video, video");
    const showing = !!player?.classList.contains("ad-showing");

    if (showing && video) {
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
      adActive = false;
      try {
        video.playbackRate = prevRate || 1;
        video.muted = prevMuted;
      } catch {}
    }

    for (const sel of SKIP) {
      let nodes;
      try {
        nodes = document.querySelectorAll(sel);
      } catch {
        continue;
      }
      nodes.forEach((b) => {
        try {
          b.click();
        } catch {}
      });
    }

    // Config-driven hiding of in-page YouTube ad surfaces.
    for (const sel of HIDE) {
      let nodes;
      try {
        nodes = document.querySelectorAll(sel);
      } catch {
        continue;
      }
      nodes.forEach((el) => el.style.setProperty("display", "none", "important"));
    }

    const dismiss = document.querySelector("tp-yt-paper-button#dismiss-button");
    if (dismiss) {
      try {
        dismiss.click();
      } catch {}
    }

    // Enforcement / black screen: reload once with ad removal disabled so the
    // clip plays (with ads, which we still auto-skip). Reload only when we can
    // persist the bypass, so a blocked sessionStorage can't loop.
    const enf = matchAny(ENFORCE);
    if (enf) {
      let bypassing = bypassReloaded;
      try {
        bypassing = bypassing || sessionStorage.getItem("tbab_yt_bypass") === "1";
      } catch {}

      if (!bypassing) {
        let persisted = false;
        try {
          sessionStorage.setItem("tbab_yt_bypass", "1");
          persisted = true;
        } catch {}
        bypassReloaded = true;
        if (persisted) {
          location.reload();
          return;
        }
      }

      const dialog = enf.closest("ytd-popup-container, tp-yt-paper-dialog");
      if (dialog) {
        try {
          dialog.remove();
        } catch {}
      }
      document.querySelectorAll("tp-yt-iron-overlay-backdrop").forEach((b) => {
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

  chrome.storage?.local.get(["enabled", "features", "allowlist", "liveConfig"], (data) => {
    enabled = data.enabled !== false;
    const ytOn = (data.features || {}).youtube !== false;
    const allowed = (data.allowlist || []).some(hostMatches);
    applyConfig(data.liveConfig && data.liveConfig.youtube);
    if (enabled && ytOn && !allowed) start();
  });

  chrome.storage?.onChanged.addListener((c) => {
    if (c.enabled) enabled = c.enabled.newValue !== false;
    if (c.liveConfig) applyConfig(c.liveConfig.newValue && c.liveConfig.newValue.youtube);
  });
})();
