// Strip ad payloads from YouTube player responses before the player reads them.
// Runs in the page (MAIN) world so it can patch the page's own fetch/XHR/JSON.
(function () {
  "use strict";

  function stripAds(obj) {
    if (!obj || typeof obj !== "object") return obj;

    if ("adPlacements" in obj) obj.adPlacements = [];
    if ("playerAds" in obj) obj.playerAds = [];
    if ("adSlots" in obj) obj.adSlots = [];
    if ("adBreakHeartbeatParams" in obj) delete obj.adBreakHeartbeatParams;
    if (obj.playerConfig?.adConfig) delete obj.playerConfig.adConfig;
    if (obj.playerConfig?.daiConfig) delete obj.playerConfig.daiConfig;

    if (obj.playerResponse) stripAds(obj.playerResponse);
    if (obj.player?.playerResponse) stripAds(obj.player.playerResponse);
    return obj;
  }

  const isPlayerLike = (o) =>
    o &&
    typeof o === "object" &&
    ("adPlacements" in o || "playerAds" in o || "adSlots" in o ||
      "streamingData" in o || "playerResponse" in o);

  // ytInitialPlayerResponse and friends pass through JSON.parse.
  const nativeParse = JSON.parse;
  JSON.parse = function (text, reviver) {
    const data = nativeParse.call(this, text, reviver);
    try {
      if (isPlayerLike(data)) stripAds(data);
    } catch {}
    return data;
  };

  // Innertube player/next requests go through fetch.
  const nativeFetch = window.fetch;
  window.fetch = async function (input, init) {
    const url = (typeof input === "string" && input) || input?.url || "";
    const res = await nativeFetch.apply(this, arguments);
    try {
      if (/\/youtubei\/v1\/(player|next|reel)/.test(url)) {
        const json = nativeParse(await res.clone().text());
        stripAds(json);
        return new Response(JSON.stringify(json), {
          status: res.status,
          statusText: res.statusText,
          headers: res.headers,
        });
      }
    } catch {}
    return res;
  };

  // Older code paths use XMLHttpRequest.
  const nativeOpen = XMLHttpRequest.prototype.open;
  const nativeSend = XMLHttpRequest.prototype.send;

  XMLHttpRequest.prototype.open = function (method, url) {
    this._ytUrl = url || "";
    return nativeOpen.apply(this, arguments);
  };

  XMLHttpRequest.prototype.send = function () {
    if (/\/youtubei\/v1\/(player|next)/.test(this._ytUrl || "")) {
      this.addEventListener("readystatechange", function () {
        if (this.readyState !== 4) return;
        try {
          const cleaned = JSON.stringify(stripAds(nativeParse(this.responseText)));
          Object.defineProperty(this, "responseText", { value: cleaned });
          Object.defineProperty(this, "response", { value: cleaned });
        } catch {}
      });
    }
    return nativeSend.apply(this, arguments);
  };
})();
