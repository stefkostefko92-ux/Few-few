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

  // Hand extra ad-field names from the live update to youtube_main as inert
  // JSON (data, not code) via a <script type="application/json"> element.
  function passConfig(adFields) {
    if (!Array.isArray(adFields) || !adFields.length) return;
    try {
      const tag = document.createElement("script");
      tag.type = "application/json";
      tag.id = "tbab-yt-cfg";
      tag.textContent = JSON.stringify({ adFields: adFields.slice(0, 50) });
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
      passConfig(data.liveConfig && data.liveConfig.youtube && data.liveConfig.youtube.adFields);
      inject();
    }
  });
})();
