// Remove ad payloads from YouTube player responses before the player reads
// them. Runs in the page (MAIN) world. We prune the ad fields in place from
// whatever the player parses (JSON.parse / Response.json), we never rebuild
// the network response, so the video stream and its signature are untouched.
//
// Three lines of defence, all config-updatable without a new release:
//  1. The /player REQUEST gets ad-suppressing flags (isInlinePlaybackNoAd),
//     which also avoids the server-side "fake buffering" backoff delay.
//  2. Parsed player responses lose their ad fields (adPlacements & friends).
//  3. Feed / search / next responses lose their ad renderers, so promoted
//     results and in-feed ads never render.
(function () {
  "use strict";

  // Config arrives from the loader as inert JSON (data only, never code).
  // Never let a config field delete real playback data.
  const PROTECTED = new Set([
    "videoDetails", "streamingData", "playerConfig", "playabilityStatus",
    "captions", "storyboards", "microformat", "trackingParams", "responseContext",
  ]);
  const ident = (s) => typeof s === "string" && /^[a-zA-Z][a-zA-Z0-9]*$/.test(s);

  let extraFields = [];
  let extraRenderers = [];
  // Flags set to true in the player request body. isInlinePlaybackNoAd makes
  // YouTube skip ad delivery (and the matching backoff delay) entirely.
  let requestFlags = [
    "playbackContext.contentPlaybackContext.isInlinePlaybackNoAd",
  ];
  try {
    const el = document.getElementById("tbab-yt-cfg");
    if (el) {
      const cfg = JSON.parse(el.textContent || "{}");
      if (Array.isArray(cfg.adFields)) {
        extraFields = cfg.adFields.filter((f) => ident(f) && !PROTECTED.has(f));
      }
      if (Array.isArray(cfg.adRenderers)) {
        extraRenderers = cfg.adRenderers.filter((f) => ident(f) && !PROTECTED.has(f));
      }
      if (cfg.disableRequestFlags === true) {
        requestFlags = []; // авариен стоп от сървъра, ако флаг счупи playback
      } else if (Array.isArray(cfg.requestFlags)) {
        for (const p of cfg.requestFlags) {
          if (
            typeof p === "string" &&
            /^[a-zA-Z][a-zA-Z0-9]*(\.[a-zA-Z][a-zA-Z0-9]*){0,5}$/.test(p) &&
            !p.split(".").some((seg) => PROTECTED.has(seg)) &&
            !requestFlags.includes(p)
          ) {
            requestFlags.push(p);
          }
        }
      }
    }
  } catch {}

  // ---- 2) Player response: prune ad fields in place ----
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

  // ---- 3) Feed / search / next responses: prune ad renderers ----
  const AD_RENDERERS = new Set([
    "adSlotRenderer", "promotedSparklesWebRenderer", "promotedVideoRenderer",
    "compactPromotedVideoRenderer", "searchPyvRenderer",
    "promotedSparklesTextSearchRenderer", "inFeedAdLayoutRenderer",
    "bannerPromoRenderer", "statementBannerRenderer", "primetimePromoRenderer",
    "displayAdRenderer", "fusionSearchAdRenderer", "brandVideoShelfRenderer",
    "brandVideoSingletonRenderer", "adsEngagementPanelContentRenderer",
    "mealbarPromoRenderer", "playerLegacyDesktopWatchAdsRenderer",
  ]);
  for (const r of extraRenderers) AD_RENDERERS.add(r);

  const isFeedLike = (o) =>
    o &&
    typeof o === "object" &&
    ("contents" in o || "onResponseReceivedActions" in o ||
      "onResponseReceivedEndpoints" in o || "continuationContents" in o);

  // Ad верижките са плитки ({richItemRenderer:{content:{adSlotRenderer}}}),
  // затова маркерът се търси само няколко нива навътре — пази скоростта.
  function containsAd(o, depth) {
    if (!o || typeof o !== "object" || depth > 3) return false;
    for (const k in o) {
      if (AD_RENDERERS.has(k)) return true;
      const v = o[k];
      if (v && typeof v === "object" && containsAd(v, depth + 1)) return true;
    }
    return false;
  }

  function pruneRenderers(node, depth) {
    if (!node || typeof node !== "object" || depth > 25) return;
    if (Array.isArray(node)) {
      for (let i = node.length - 1; i >= 0; i--) {
        const it = node[i];
        if (it && typeof it === "object" && containsAd(it, 0)) node.splice(i, 1);
        else pruneRenderers(it, depth + 1);
      }
      return;
    }
    for (const k in node) {
      if (AD_RENDERERS.has(k)) {
        delete node[k];
        continue;
      }
      const v = node[k];
      if (v && typeof v === "object") pruneRenderers(v, depth + 1);
    }
  }

  function clean(data) {
    try {
      if (isPlayerLike(data)) stripAds(data);
      if (isFeedLike(data)) pruneRenderers(data, 0);
    } catch {}
    return data;
  }

  // ---- Hooks. YouTube's early "locker" script can freeze JSON globals, so
  // every patch is best-effort and verified; Object.assign is the fallback
  // path that still sees the parsed objects when JSON.parse can't be patched.
  const nativeParse = JSON.parse;
  try {
    JSON.parse = function (text, reviver) {
      return clean(nativeParse.call(this, text, reviver));
    };
  } catch {}
  const parsePatched = (() => {
    try {
      return JSON.parse !== nativeParse;
    } catch {
      return false;
    }
  })();

  try {
    const nativeJson = Response.prototype.json;
    Response.prototype.json = function () {
      return nativeJson.call(this).then(clean);
    };
  } catch {}

  if (!parsePatched) {
    try {
      const nativeAssign = Object.assign;
      Object.assign = function () {
        const out = nativeAssign.apply(this, arguments);
        return clean(out);
      };
    } catch {}
  }

  // ---- 1) Player REQUEST: set the ad-suppressing flags ----
  function setPath(obj, path) {
    const parts = path.split(".");
    let cur = obj;
    for (let i = 0; i < parts.length - 1; i++) {
      if (typeof cur[parts[i]] !== "object" || cur[parts[i]] === null) {
        cur[parts[i]] = {};
      }
      cur = cur[parts[i]];
    }
    cur[parts[parts.length - 1]] = true;
  }

  function flagBody(text) {
    const body = nativeParse(text);
    for (const p of requestFlags) setPath(body, p);
    return JSON.stringify(body);
  }

  try {
    const nativeFetch = window.fetch;
    window.fetch = function (input, init) {
      try {
        if (requestFlags.length) {
          const url = typeof input === "string" ? input : (input && input.url) || "";
          if (url.includes("/youtubei/v1/player")) {
            if (init && typeof init.body === "string" && init.body.charAt(0) === "{") {
              init = Object.assign({}, init, { body: flagBody(init.body) });
            } else if (typeof Request !== "undefined" && input instanceof Request && !init) {
              const req = input;
              return req
                .clone()
                .text()
                .then((t) => {
                  try {
                    if (t && t.charAt(0) === "{") {
                      return nativeFetch(new Request(req, { body: flagBody(t) }));
                    }
                  } catch {}
                  return nativeFetch(req);
                });
            }
          }
        }
      } catch {}
      return nativeFetch.call(this, input, init);
    };
  } catch {}

  // If our injection lost the race with the inline bootstrap (its JSON was
  // parsed before the hook landed), scrub the already-materialised globals.
  try {
    if (window.ytInitialPlayerResponse) stripAds(window.ytInitialPlayerResponse);
    if (window.ytInitialData) pruneRenderers(window.ytInitialData, 0);
  } catch {}
  document.addEventListener("DOMContentLoaded", () => {
    try {
      if (window.ytInitialPlayerResponse) stripAds(window.ytInitialPlayerResponse);
      if (window.ytInitialData) pruneRenderers(window.ytInitialData, 0);
    } catch {}
  });
})();
