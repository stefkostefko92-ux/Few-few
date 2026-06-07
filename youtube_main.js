// Remove ad payloads from YouTube player responses before the player reads
// them. Runs in the page (MAIN) world. We prune the ad fields in place from
// whatever the player parses (JSON.parse / Response.json) — we never rebuild
// the network response, so the video stream and its signature are untouched.
(function () {
  "use strict";

  function stripAds(obj) {
    if (!obj || typeof obj !== "object") return obj;

    if ("adPlacements" in obj) obj.adPlacements = [];
    if ("playerAds" in obj) obj.playerAds = [];
    if ("adSlots" in obj) obj.adSlots = [];
    if ("adBreakHeartbeatParams" in obj) delete obj.adBreakHeartbeatParams;
    if (obj.playerConfig?.adConfig) delete obj.playerConfig.adConfig;

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
