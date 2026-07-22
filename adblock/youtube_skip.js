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
  let bgBypass = false; // service worker has the YouTube allow-all bypass rule active

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
    // During a session bypass we must NOT force-skip the ad (seek to end /
    // playbackRate 16) — that manipulation is exactly what YouTube detects and
    // would re-trip enforcement. Let ads play; the native "Skip" button below is
    // still clicked (user-equivalent, undetectable). See background.js bypass.
    const showing = !bgBypass && !!player?.classList.contains("ad-showing");

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

    // Enforcement / black screen: YouTube hard-blocked playback because it
    // detected us. A content script can't disable declarativeNetRequest, so we
    // ask the service worker to turn the YouTube ruleset OFF for the session,
    // THEN reload — only then is the reload a genuinely clean client and the
    // clip plays (with ads, which auto-skip still fast-forwards). Reload only
    // when we can persist the bypass, so a blocked sessionStorage can't loop.
    const enf = matchAny(ENFORCE);
    if (enf) {
      let bypassing = bypassReloaded || bgBypass;
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
          try {
            chrome.runtime.sendMessage({ type: "ytBypass" }, () => {
              try { location.reload(); } catch {}
            });
          } catch {
            try { location.reload(); } catch {}
          }
          return;
        }
      }

      // Already bypassing: with the ruleset off and no injection the dialog
      // shouldn't reappear. Don't touch the dialog/player (that leaves a dead
      // player); only clear a leftover overlay/scroll-lock so the page is usable.
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

  chrome.storage?.local.get(["enabled", "features", "allowlist", "liveConfig", "ytBypassUntil"], (data) => {
    enabled = data.enabled !== false;
    const ytOn = (data.features || {}).youtube !== false;
    const allowed = (data.allowlist || []).some(hostMatches);
    bgBypass = data.ytBypassUntil && data.ytBypassUntil > Date.now();
    applyConfig(data.liveConfig && data.liveConfig.youtube);
    // Run even when bypassing: ads now play, so auto-skip still fast-forwards
    // them; only the enforcement reload is gated on the bypass state.
    if (enabled && ytOn && !allowed) start();
  });

  chrome.storage?.onChanged.addListener((c) => {
    if (c.enabled) enabled = c.enabled.newValue !== false;
    if (c.liveConfig) applyConfig(c.liveConfig.newValue && c.liveConfig.newValue.youtube);
    if (c.ytBypassUntil) bgBypass = c.ytBypassUntil.newValue && c.ytBypassUntil.newValue > Date.now();
  });
})();
