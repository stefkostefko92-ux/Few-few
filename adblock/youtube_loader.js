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

  let bypass = false;
  try {
    bypass = sessionStorage.getItem("tbab_yt_bypass") === "1";
  } catch {}
  if (bypass) return;

  // Hand the live-update extras to youtube_main as inert JSON (data, not
  // code) via a <script type="application/json"> element: extra ad fields,
  // extra ad renderer names, request flags and the flags kill switch.
  function passConfig(yt) {
    if (!yt || typeof yt !== "object") return;
    const cfg = {
      adFields: Array.isArray(yt.adFields) ? yt.adFields.slice(0, 50) : [],
      adRenderers: Array.isArray(yt.adRenderers) ? yt.adRenderers.slice(0, 100) : [],
      requestFlags: Array.isArray(yt.requestFlags) ? yt.requestFlags.slice(0, 10) : [],
      disableRequestFlags: yt.disableRequestFlags === true,
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
    (document.head || document.documentElement).appendChild(s);
  }

  chrome.storage?.local.get(["enabled", "features", "allowlist", "liveConfig"], (data) => {
    const on = data.enabled !== false;
    const ytOn = (data.features || {}).youtube !== false;
    const allowed = (data.allowlist || []).some(hostMatches);
    if (on && ytOn && !allowed) {
      passConfig(data.liveConfig && data.liveConfig.youtube);
      inject();
    }
  });
})();
