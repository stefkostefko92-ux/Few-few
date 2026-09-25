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
  let bypassReloaded = false; // this page already asked for a bypass reload
  let bgBypass = false; // service worker has the YouTube allow-all bypass rule active
  let attrForced = false; // dialog made visible because a bypass could not be armed
  // Loop guard for the enforcement reload: never two bypass reloads in one tab
  // within this window. The AUTHORITATIVE bypass state is the service worker's
  // ytBypassUntil (storage); sessionStorage only remembers WHEN this tab last
  // reloaded for a bypass. (It used to be a bare "1" with no expiry, so it
  // outlived the 6h bypass: the loader stayed off, the skipper resumed its
  // force-skip on a page that now got ads, YouTube re-detected, and the
  // enforcement path saw "already bypassing" → no reload, dialog hidden by CSS,
  // dead player with no way out. That is the "clips stop loading" report.)
  const RELOAD_GUARD_MS = 90 * 1000;
  // Attempts are BOUNDED per bypass window, not just spaced: bypassReloaded is
  // per document and the timestamp is refreshed by every reload, so a time
  // guard alone would reload every 90s for as long as an enforcement node sits
  // in the DOM (review finding: 5 reloads in 400s, each extending the window).
  const BYPASS_WINDOW_MS = 6 * 60 * 60 * 1000; // = background.js YT_BYPASS_MS
  const MAX_BYPASS_RELOADS = 2;                // first strike + ONE second chance
  function lastBypassReload() {
    try {
      const v = Number(sessionStorage.getItem("tbab_yt_bypass_at") || 0);
      return Number.isFinite(v) ? v : 0;
    } catch { return 0; }
  }
  function bypassReloadCount(now) {
    try {
      const at = lastBypassReload();
      if (!at || now - at > BYPASS_WINDOW_MS) return 0; // new window → new counter
      return Number(sessionStorage.getItem("tbab_yt_bypass_n") || 0) || 0;
    } catch { return 0; }
  }
  // youtube.css hides ad UI only while html[data-tbab-yt-bypass] is absent, so a
  // bypassed (clean-client) page does not keep hiding ad containers — YouTube can
  // detect that too. Enforcement overlay/scroll-lock rules stay ungated.
  function syncBypassAttr() {
    try {
      if (bgBypass || attrForced) document.documentElement.setAttribute("data-tbab-yt-bypass", "1");
      else document.documentElement.removeAttribute("data-tbab-yt-bypass");
    } catch {}
  }

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

  // Player error screen carrying a Playback ID ("An error occurred. Please try
  // again later. (Playback ID: …)") — the shape YouTube uses to refuse playback
  // to detected ad blockers without showing the enforcement dialog. Never
  // during an active bypass: then it is a genuine error, not us.
  // The same screen also follows a transient network/decoder error that YouTube
  // retries by itself, so it only counts once it has been STABLE for a while —
  // a few seconds cost nothing on a dead player, a false positive costs 6h of ads.
  const ERROR_STABLE_MS = 8000;
  let errSeenAt = 0;
  function playbackIdError() {
    if (bgBypass) return null;
    try {
      const el = document.querySelector(".ytp-error");
      if (!el || !/playback id/i.test(el.textContent || "")) { errSeenAt = 0; return null; }
      const now = Date.now();
      if (!errSeenAt) { errSeenAt = now; return null; }
      return now - errSeenAt >= ERROR_STABLE_MS ? el : null;
    } catch {}
    return null;
  }

  // Ask for a (new or extended) bypass + one reload when: we are not bypassing
  // at all (first strike, or the 6h window expired under an open tab), or we
  // ARE bypassing but this page has not reloaded yet (the clean client still
  // got flagged — one more try with a fresh window). Bounded per window
  // (MAX_BYPASS_RELOADS) and spaced (RELOAD_GUARD_MS); a hidden dialog is
  // never the answer. Returns true when a reload has been initiated.
  function tryBypass(now) {
    const recentlyReloaded = now - lastBypassReload() < RELOAD_GUARD_MS;
    const attempts = bypassReloadCount(now);
    if (bypassReloaded || recentlyReloaded || attempts >= MAX_BYPASS_RELOADS) return false;
    try {
      sessionStorage.setItem("tbab_yt_bypass_at", String(now));
      sessionStorage.setItem("tbab_yt_bypass_n", String(attempts + 1));
    } catch { return false; } // cannot persist the guard → never reload (loop risk)
    bypassReloaded = true;
    try {
      chrome.runtime.sendMessage({ type: "ytBypass" }, (res) => {
        // Reload only once the service worker confirmed the allow-all rule is
        // in place; otherwise the reload would land on a page that is still
        // blocked (a pointless reload).
        if (res && res.ok) { try { location.reload(); } catch {} return; }
        // Could not arm the bypass: make YouTube's own dialog visible so the
        // user is not left with a silently dead player.
        attrForced = true;
        syncBypassAttr();
      });
    } catch { return false; }
    return true;
  }

  // ---- Stall watchdog -------------------------------------------------------
  // A clip that never starts is the one failure a user cannot live with
  // ("does not play until I disable the extension"). Neither the dialog nor
  // the Playback ID error covers it: the player just buffers forever. When a
  // play has been requested and the media element makes NO progress for
  // STALL_MS, recover in stages, cheapest first, one reload per stage per tab:
  //   1. reload WITHOUT the request flags — the only server-visible difference
  //      between us and a plain client; if that was the cause, ad blocking
  //      (client-side pruning) survives;
  //   2. reload as a clean client (bypass, same bounded path as enforcement).
  // Only a STARTUP stall counts: the clip on this page never advanced at all.
  // Mid-play buffering on a slow network is not ours to fix — and must never
  // cost the user six hours of ads. Live streams are excluded (a waiting live
  // edge looks exactly like a stall). Not while bypassing, not when paused /
  // ended (nothing was asked to play), not offline. Stage 2 fires only if the
  // stall comes back within STAGE2_WINDOW_MS of a stage-1 reload, i.e. when the
  // flag-free client did not help either; a later incident starts at stage 1.
  const STALL_MS = 25 * 1000;
  const STAGE2_WINDOW_MS = 3 * 60 * 1000;
  let stallSince = 0;
  let lastSeenTime = -1;
  let lastSrc = "";
  let advanced = false; // this clip has played on this page
  function isLive(video, player) {
    if (!isFinite(Number(video.duration))) return true;
    try { if (player && player.classList.contains("ytp-live")) return true; } catch {}
    return false;
  }
  function stallWatch(video, player) {
    if (!video) { stallSince = 0; return; }
    const src = String(video.currentSrc || video.src || "");
    if (src !== lastSrc) { lastSrc = src; advanced = false; lastSeenTime = -1; stallSince = 0; }
    const t = Number(video.currentTime) || 0;
    const progressing = lastSeenTime >= 0 && t !== lastSeenTime;
    lastSeenTime = t;
    if (progressing && video.paused === false) advanced = true;
    if (bgBypass || bypassReloaded || advanced || isLive(video, player)) { stallSince = 0; return; }
    const now = Date.now();
    const wantsPlay = video.paused === false && video.ended !== true;
    const starved = (video.readyState | 0) < 3; // below HAVE_FUTURE_DATA
    let online = true;
    try { online = typeof navigator === "undefined" || navigator.onLine !== false; } catch {}
    if (!wantsPlay || !starved || progressing || !online) { stallSince = 0; return; }
    if (!stallSince) { stallSince = now; return; }
    if (now - stallSince < STALL_MS) return;
    stallSince = 0;
    let stage1At = 0;
    try { stage1At = Number(sessionStorage.getItem("tbab_yt_stage1_at") || 0) || 0; } catch {}
    if (!stage1At || now - stage1At > STAGE2_WINDOW_MS) {
      try {
        sessionStorage.setItem("tbab_yt_noflags", "1"); // youtube_loader: next load without request flags
        sessionStorage.setItem("tbab_yt_stage1_at", String(now));
      } catch { return; } // cannot remember the stage → never reload (loop risk)
      try { console.warn("Supreme AdBlock: YouTube clip did not start for 25s — reloading without request flags"); } catch {}
      try { location.reload(); } catch {}
      return;
    }
    try { console.warn("Supreme AdBlock: YouTube clip still did not start — reloading as a clean client (bypass)"); } catch {}
    tryBypass(now);
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
      // No seek to the end. With server-side stitched ads (SSAP) the media
      // element's duration covers the WHOLE stream (ad + clip), so seeking to
      // `duration` ends the clip itself: black player, autoplay to the next
      // video — "the clip never played". Speed + mute + the native Skip click
      // below are enough: a 30s ad is over in ~2s and nothing is skipped past.
      try {
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

    if (!showing) stallWatch(video, player); // an ad being force-skipped is not a stall

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
    // Two shapes of "YouTube refused to play because it detected us": the
    // enforcement dialog, and (since 2026) a bare player error with a Playback
    // ID and no dialog at all. Deleted/private videos say "Video unavailable"
    // without a Playback ID, so that text is the discriminator.
    const enf = matchAny(ENFORCE) || playbackIdError();
    if (enf) {
      if (tryBypass(Date.now())) return;

      // Already reloaded for this (or a very recent) strike: don't reload again.
      // Don't touch the dialog/player (that leaves a dead player); only clear a
      // leftover overlay/scroll-lock so the page is usable, and keep the dialog
      // visible so the user can act on it.
      attrForced = true;
      syncBypassAttr();
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
    setInterval(run, 1000); // safety net only — the MutationObserver above reacts to class/DOM changes immediately
  }

  const host = location.hostname.replace(/^www\./, "");
  const hostMatches = (d) => host === d || host.endsWith("." + d);

  chrome.storage?.local.get(["enabled", "features", "allowlist", "liveConfig", "ytBypassUntil"], (data) => {
    enabled = data.enabled !== false;
    const ytOn = (data.features || {}).youtube !== false;
    const allowed = (data.allowlist || []).some(hostMatches);
    bgBypass = data.ytBypassUntil && data.ytBypassUntil > Date.now();
    syncBypassAttr();
    applyConfig(data.liveConfig && data.liveConfig.youtube);
    // Run even when bypassing, but hands-off on the player: during a bypass
    // run() skips the detectable fast-forward (see `showing` gate) and only
    // clicks the native Skip button + clears enforcement overlays.
    if (enabled && ytOn && !allowed) start();
  });

  chrome.storage?.onChanged.addListener((c) => {
    if (c.enabled) enabled = c.enabled.newValue !== false;
    if (c.liveConfig) applyConfig(c.liveConfig.newValue && c.liveConfig.newValue.youtube);
    if (c.ytBypassUntil) {
      bgBypass = c.ytBypassUntil.newValue && c.ytBypassUntil.newValue > Date.now();
      syncBypassAttr();
    }
  });
})();
