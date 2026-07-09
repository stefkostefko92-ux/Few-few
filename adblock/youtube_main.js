// Remove ad payloads from YouTube player responses before the player reads
// them. Runs in the page (MAIN) world. We prune the ad fields in place from
// whatever the player parses (JSON.parse / Response.json), we never rebuild
// the network response, so the video stream and its signature are untouched.
(function () {
  "use strict";

  // Extra top-level ad-field names may arrive from the live update as inert
  // JSON placed in the page by the loader. Read them once (data only).
  // Never let a config field delete real playback data.
  const PROTECTED = new Set([
    "videoDetails", "streamingData", "playerConfig", "playabilityStatus",
    "captions", "storyboards", "microformat", "trackingParams", "responseContext",
  ]);
  let extraFields = [];
  try {
    const el = document.getElementById("tbab-yt-cfg");
    if (el) {
      const cfg = JSON.parse(el.textContent || "{}");
      if (Array.isArray(cfg.adFields)) {
        extraFields = cfg.adFields.filter(
          (f) => typeof f === "string" && /^[a-zA-Z]+$/.test(f) && !PROTECTED.has(f)
        );
      }
    }
  } catch {}

  function stripAds(obj) {
    if (!obj || typeof obj !== "object") return obj;

    if ("adPlacements" in obj) obj.adPlacements = [];
    if ("playerAds" in obj) obj.playerAds = [];
    if ("adSlots" in obj) obj.adSlots = [];
    if ("adBreakHeartbeatParams" in obj) delete obj.adBreakHeartbeatParams;
    if (obj.playerConfig?.adConfig) delete obj.playerConfig.adConfig;
    for (const f of extraFields) if (f in obj) delete obj[f];

    if (obj.playerResponse) stripAds(obj.playerResponse);
    if (obj.player?.playerResponse) stripAds(obj.player.playerResponse);
    return obj;
  }

  const isPlayerLike = (o) =>
    o &&
    typeof o === "object" &&
    ("adPlacements" in o || "playerAds" in o || "adSlots" in o ||
      "playerResponse" in o);

  // Initial page data (ytInitialPlayerResponse) and any text+parse code path.
  const nativeParse = JSON.parse;
  JSON.parse = function (text, reviver) {
    const data = nativeParse.call(this, text, reviver);
    try {
      if (isPlayerLike(data)) stripAds(data);
    } catch {}
    return data;
  };

  // Innertube /player and /next responses read via response.json().
  const nativeJson = Response.prototype.json;
  Response.prototype.json = function () {
    return nativeJson.call(this).then((data) => {
      try {
        if (isPlayerLike(data)) stripAds(data);
      } catch {}
      return data;
    });
  };
})();
