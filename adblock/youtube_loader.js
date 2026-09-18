// Inject the YouTube ad remover into the page (MAIN world) only when YouTube
// ad blocking is enabled and the site isn't allowlisted. This lets the feature
// toggle and per-site allowlist fully control whether we touch YouTube at all.
//
// If YouTube has detected our ad removal on this tab and blocked playback,
// youtube_skip sets a "bypass" flag and reloads. On that reload we skip the
// injection so the video plays (with ads, which auto-skip still handles).
(function () {
  const host = location.hostname.replace(/^www\./, "");
  const hostMatches = (d) => host === d || host.endsWith("." + d);

  // The authoritative bypass state is ytBypassUntil (storage, set by the service
  // worker before it confirms the reload). sessionStorage only says WHEN this tab
  // last reloaded for a bypass; it is a short guard for the reload itself, never
  // a standing "off" switch — a bare flag used to outlive the bypass window and
  // left the tab without injection while the skipper resumed (dead player).
  let justReloaded = false;
  try {
    const at = Number(sessionStorage.getItem("tbab_yt_bypass_at") || 0);
    justReloaded = Number.isFinite(at) && Date.now() - at < 90 * 1000;
  } catch {}

  // Hand the live-update extras to youtube_main as inert JSON (data, not
  // code) via a <script type="application/json"> element: extra ad fields,
  // extra ad renderer names, request flags and the flags kill switch.
  // Stall watchdog stage 1 (youtube_skip): this tab reloaded because playback
  // never started → run youtube_main WITHOUT the request flags this time.
  let noFlags = false;
  try { noFlags = sessionStorage.getItem("tbab_yt_noflags") === "1"; } catch {}

  function passConfig(yt) {
    if (!yt || typeof yt !== "object") yt = {};
    const cfg = {
      adFields: Array.isArray(yt.adFields) ? yt.adFields.slice(0, 50) : [],
      adRenderers: Array.isArray(yt.adRenderers) ? yt.adRenderers.slice(0, 100) : [],
      requestFlags: Array.isArray(yt.requestFlags) ? yt.requestFlags.slice(0, 10) : [],
      disableRequestFlags: yt.disableRequestFlags === true || noFlags,
    };
    if (
      !cfg.adFields.length && !cfg.adRenderers.length &&
      !cfg.requestFlags.length && !cfg.disableRequestFlags
    ) {
      return; // нищо извън вградените дефолти на youtube_main
    }
    try {
      const tag = document.createElement("script");
      tag.type = "application/json";
      tag.id = "tbab-yt-cfg";
      tag.textContent = JSON.stringify(cfg);
      (document.head || document.documentElement).appendChild(tag);
    } catch {}
  }

  function inject() {
    const s = document.createElement("script");
    s.src = chrome.runtime.getURL("youtube_main.js");
    s.onload = () => s.remove();
    // Ако зареждането се провали (напр. бъдеща WAR/CSP регресия при
    // use_dynamic_url), логваме за диагностика — иначе тихо няма ад-блокиране.
    s.onerror = () => {
      s.remove();
      try { console.warn("Supreme AdBlock: youtube_main injection failed"); } catch {}
    };
    (document.head || document.documentElement).appendChild(s);
  }

  chrome.storage?.local.get(["enabled", "features", "allowlist", "liveConfig", "ytBypassUntil"], (data) => {
    const on = data.enabled !== false;
    const ytOn = (data.features || {}).youtube !== false;
    const allowed = (data.allowlist || []).some(hostMatches);
    // Session bypass active (YouTube hard-blocked us): stay hands-off so a new
    // tab can't re-inject and re-trip detection while the DNR ruleset is off.
    const bgBypass = (data.ytBypassUntil && data.ytBypassUntil > Date.now()) || justReloaded;
    if (on && ytOn && !allowed && !bgBypass) {
      passConfig(data.liveConfig && data.liveConfig.youtube);
      inject();
    }
  });
})();
