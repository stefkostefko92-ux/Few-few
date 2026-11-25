// YouTube ad removal in the page (MAIN) world — registered by the service worker
// as a document_start content script, so it is in place before YouTube's own code
// runs and there is no <script> element in the page to notice.
//
// Since autumn 2026 YouTube counts strikes ("ad blockers are not allowed", then a
// blocked player after ~3 videos) from signals a blocker leaves behind. This file
// follows the method the uBlock Origin filter maintainers use today and removes
// the signals our old version left:
//  1. Ads are taken out of the player response as TEXT, before the player parses
//     it: "adPlacements"/"adSlots"/"playerAds" are renamed to "no_ads", so the
//     player sees no ads and the data is otherwise byte-for-byte what was sent.
//     (We used to prune after a global JSON.parse hook — a mismatch YouTube sees.)
//  2. Every hook is a Proxy around the native function: fetch.toString() and
//     friends still say "[native code]". (Plain replacement functions were
//     trivially detectable.) An error that passes through a hook leaves no frame
//     of ours in its stack: `Function.prototype.toString.call({})` and the like
//     throw exactly what the browser throws.
//  3. YouTube takes pristine fetch/XHR/setTimeout from a fresh iframe to get past
//     hooks: a same-origin frame gets the same hooks the moment the page reaches
//     its window (contentWindow / contentDocument) or the frame is inserted. We no
//     longer wrap appendChild & co.: every element YouTube inserts ran its
//     constructor with our script on the stack, and YouTube's error reports carry
//     stacks.
//  4. The ad-state report ping (/api/stats/atr with the ad payload) is answered
//     locally and never sent — the pattern is the one the uBO filters use.
//  5. The 17-second "fake buffering" penalty timer runs in 17 ms.
//  6. No request flags by default (isInlinePlaybackNoAd on a normal watch page is
//     itself a server-side signal); the live filter update can still turn flags
//     on, with the old plain-retry fallback.
//  7. (5.7, www.youtube.com) What YouTube does to a client it has flagged, and the
//     answer of the uBO maintainers to each, written here as our own code:
//     - an ad stitched into the video stream (the player's debug line starts with
//       "SSAP, AD") is jumped over to its end — the response holds nothing to prune;
//     - a refusal (UNPLAYABLE, pointing at the ad-blocker help page) or a player
//       stuck at 0x0 with an empty buffer is retried in place (loadVideoById) with
//       the next request shape — 6.1.1, as the uBO quick fixes of 2026-11: a watch
//       page tries clientScreen CHANNEL, params YAHI, isInlinePlaybackNoAd, params
//       oAEBogYBLg; an embed CHANNEL and params eAFgAQ; each with a "#reloadxhr"
//       referer. A refusal ends with one more try as sent; a stuck start, its shapes
//       tried, goes back to requests as built and leaves the rest to youtube_skip.
//       A stuck start is retried as soon as the player itself says so (a second of
//       it confirmed), not after 10 s. Until a refusal or a stuck start, requests go
//       out exactly as YouTube built them;
//     - the page's "abnormality detected" callback is never run.
//     The live update can switch the shapes or the jump off (data, not code).
//  8. (6.1.1) The first player answer of a full page load (var ytInitialPlayerResponse)
//     is cleaned here too, as it is assigned: it was left to the uBO rules for the
//     host, which do not run on the Basic level — a reload there played the ad.
// Feed / search / next responses lose their ad renderers the same way (text in,
// text out), and a reel sequence its ad entries. Nothing here touches the video
// stream or its signatures.
(function () {
  "use strict";

  const WWW = (() => { try { return location.hostname === "www.youtube.com"; } catch { return false; } })();
  const PROTECTED = new Set([
    "videoDetails", "streamingData", "playerConfig", "playabilityStatus",
    "captions", "storyboards", "microformat", "trackingParams", "responseContext",
  ]);
  const ident = (s) => typeof s === "string" && /^[a-zA-Z][a-zA-Z0-9]*$/.test(s) && !PROTECTED.has(s);

  let RENAME = ["adPlacements", "adSlots", "playerAds"];
  const AD_RENDERERS = new Set([
    "adSlotRenderer", "promotedSparklesWebRenderer", "promotedVideoRenderer",
    "compactPromotedVideoRenderer", "searchPyvRenderer",
    "promotedSparklesTextSearchRenderer", "inFeedAdLayoutRenderer",
    "bannerPromoRenderer", "statementBannerRenderer", "primetimePromoRenderer",
    "displayAdRenderer", "fusionSearchAdRenderer", "brandVideoShelfRenderer",
    "brandVideoSingletonRenderer", "adsEngagementPanelContentRenderer",
    "mealbarPromoRenderer", "playerLegacyDesktopWatchAdsRenderer",
  ]);
  let requestFlags = [];
  // uBO: no-xhr-if /\/api\/stats\/atr\?…/ method:POST — the ATR ping that carries the ad state.
  const ATR_RE = /\/api\/stats\/atr\?.+?&rt=\d+\.\d+.+?&volume=\d+&cbr=.+?&fexp=v1%[-%0-9C]{300,}&.+?&muted=\d(&vis=3)?&docid=/;
  const PLAYER_RE = /\/youtubei\/v1\/(player|get_watch)(\?|$)|\/playlist\?list=|\/watch\?[tv]=/;
  const PLAYER_REQ_RE = /\/youtubei\/v1\/player(\?|$)/;
  const FEED_RE = /\/youtubei\/v1\/(browse|search|next|guide|reel\/reel_watch_sequence)(\?|$)/;
  let RENDERER_RE = null;
  const rebuildRendererRe = () => { RENDERER_RE = new RegExp('"(' + [...AD_RENDERERS].join("|") + ')"'); };
  rebuildRendererRe();

  const nativeParse = JSON.parse;
  const nativeStringify = JSON.stringify;
  const fnToString = Function.prototype.toString;
  const nativeThen = Promise.prototype.then;
  const nativeSetInterval = typeof setInterval === "function" ? setInterval : null;
  // Taken now, before any page code: the retry note to youtube_skip goes out through these.
  const NativeEvent = typeof Event === "function" ? Event : null;
  const nativeDispatch = (() => { try { return EventTarget.prototype.dispatchEvent; } catch { return null; } })();

  // ---- no frame of ours in an error's stack ------------------------------------
  const OWN_RE = /(?:chrome|moz)-extension:\/\//;
  function scrub(e) {
    try {
      if (e && typeof e === "object" && typeof e.stack === "string" && OWN_RE.test(e.stack)) {
        e.stack = e.stack.split("\n").filter((l) => !OWN_RE.test(l)).join("\n");
      }
    } catch {}
    return e;
  }
  const rethrow = (e) => { throw scrub(e); };

  // ---- request shapes after a refusal or a stuck start (www.youtube.com) -------
  // The order of the uBO quick fixes (2026-11; "lactmilli" — params 8AUB with a fresh lactMilliseconds —
  // was dropped there for "oaeb"). Every shaped request also carries the "#reloadxhr" referer; the player's
  // tracking URL then says so, which tells a stuck answer to a shaped request from one to a request as built.
  const WATCH_SHAPES = ["channel", "yahi", "inline", "oaeb"];
  const EMBED_SHAPES = ["channel", "eafg"];
  let shape = "";        // what /player requests carry now ("" = exactly as YouTube built them)
  let left = null;       // the shapes still to try on this page (null = the full list for its kind)
  let shapesOn = WWW;    // live kill switches (data): youtube.noShapes / youtube.noSsapJump
  let ssapOn = WWW;

  let premiumSeen = false;
  function premium() {
    if (premiumSeen) return true;
    try {
      const d = window.ytInitialData;
      const logo = d && d.topbar && d.topbar.desktopTopbarRenderer && d.topbar.desktopTopbarRenderer.logo;
      const icon = logo && logo.topbarLogoRenderer && logo.topbarLogoRenderer.iconImage && logo.topbarLogoRenderer.iconImage.iconType;
      const m = document.getElementById("masthead");
      if (icon === "YOUTUBE_PREMIUM_LOGO" || (m && m.getAttribute && m.getAttribute("logo-type") === "YOUTUBE_PREMIUM_LOGO")) premiumSeen = true;
    } catch {}
    return premiumSeen;
  }

  // The body of a /player request with the current shape; anything else untouched.
  // A watch page's request carries attestationRequest; an embed's carries its third-party context.
  function shapeBody(text) {
    if (!shape || !shapesOn || typeof text !== "string" || premium()) return text;
    if (text.indexOf('"attestationRequest"') === -1 && text.indexOf('"embeddedPlayerContext"') === -1 &&
      text.indexOf('"serializedThirdPartyEmbedConfig"') === -1) return text;
    let o;
    try { o = nativeParse(text); } catch { return text; }
    if (!o || typeof o !== "object") return text;
    const client = o.context && o.context.client;
    const third = o.context && o.context.thirdParty;
    const cpc = o.playbackContext && o.playbackContext.contentPlaybackContext;
    const watch = !!o.attestationRequest;
    const embed = !!(third && third.embeddedPlayerContext);
    const embedCfg = !!o.serializedThirdPartyEmbedConfig;
    if (!watch && !embed && !embedCfg) return text;
    if (watch) {
      if (shape === "channel" && client && client.clientName === "WEB") client.clientScreen = "CHANNEL";
      if (shape === "yahi") o.params = "YAHI";
      if (shape === "oaeb") o.params = "oAEBogYBLg";
      if (shape === "inline" && cpc && typeof cpc === "object") cpc.isInlinePlaybackNoAd = true;
    }
    if (embedCfg) {
      if (shape === "channel" && client && client.clientName === "WEB_EMBEDDED_PLAYER") client.clientScreen = "CHANNEL";
      if (shape === "eafg") o.params = "eAFgAQ";
    }
    if ((watch || (embed && (shape === "channel" || shape === "eafg"))) && cpc && typeof cpc.referer === "string" &&
      !/#reloadxhr$/.test(cpc.referer)) cpc.referer += "#reloadxhr";
    return nativeStringify(o);
  }

  // Live-update extras arrive from the isolated loader as a JSON string on a DOM
  // event (data only, never code). Request flags are opt-in from that channel.
  function applyConfig(cfg) {
    if (!cfg || typeof cfg !== "object") return;
    if (Array.isArray(cfg.adFields)) for (const f of cfg.adFields) if (ident(f) && !RENAME.includes(f)) RENAME = RENAME.concat(f);
    if (Array.isArray(cfg.adRenderers)) { for (const r of cfg.adRenderers) if (ident(r)) AD_RENDERERS.add(r); rebuildRendererRe(); }
    if (cfg.noShapes === true) { shapesOn = false; shape = ""; }
    if (cfg.noSsapJump === true) ssapOn = false;
    if (cfg.disableRequestFlags === true) requestFlags = [];
    else if (Array.isArray(cfg.requestFlags)) {
      for (const p of cfg.requestFlags) {
        if (typeof p === "string" && /^[a-zA-Z][a-zA-Z0-9]*(\.[a-zA-Z][a-zA-Z0-9]*){0,5}$/.test(p) &&
          !p.split(".").some((seg) => PROTECTED.has(seg)) && !requestFlags.includes(p)) requestFlags.push(p);
      }
    }
  }
  try {
    window.addEventListener("tbab-yt-cfg", (ev) => {
      try { applyConfig(nativeParse(String(ev && ev.detail || "{}"))); } catch {}
    }, true);
  } catch {}

  // ---- text transforms -------------------------------------------------------
  function renameText(text) {
    if (typeof text !== "string") return text;
    let out = text;
    for (const k of RENAME) if (out.indexOf('"' + k + '"') !== -1) out = out.split('"' + k + '"').join('"no_ads"');
    return out;
  }
  function renameInObject(o, depth) {
    if (!o || typeof o !== "object" || depth > 6) return;
    for (const k of RENAME) if (Object.prototype.hasOwnProperty.call(o, k)) { o.no_ads = o[k]; delete o[k]; }
    if (o.playerResponse) renameInObject(o.playerResponse, depth + 1);
    if (o.player && o.player.playerResponse) renameInObject(o.player.playerResponse, depth + 1);
    if (Array.isArray(o)) for (const it of o) renameInObject(it, depth + 1);
  }
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
      if (AD_RENDERERS.has(k)) { delete node[k]; continue; }
      const v = node[k];
      if (v && typeof v === "object") pruneRenderers(v, depth + 1);
    }
  }
  // Shorts: an ad in the reel sequence is an entry whose command says adClientParams.isAd (the uBO rule
  // json-prune entries.[-].command.reelWatchEndpoint.adClientParams.isAd — on Basic only this runs).
  function isReelAd(e) {
    try { const p = e.command.reelWatchEndpoint.adClientParams; return !!(p && p.isAd); } catch { return false; }
  }
  function pruneReelAds(o) {
    const list = o && typeof o === "object" ? o.entries : null;
    if (Array.isArray(list)) for (let i = list.length - 1; i >= 0; i--) if (isReelAd(list[i])) list.splice(i, 1);
  }
  function pruneFeedText(text) {
    if (typeof text !== "string") return text;
    const renderers = RENDERER_RE.test(text);
    const reels = text.indexOf('"isAd":true') !== -1;
    if (!renderers && !reels) return text; // the common case: untouched
    try {
      const o = nativeParse(text);
      if (renderers) pruneRenderers(o, 0);
      if (reels) pruneReelAds(o);
      return nativeStringify(o);
    } catch { return text; }
  }
  const classify = (url) => (PLAYER_RE.test(url) ? "player" : FEED_RE.test(url) ? "feed" : "");
  const transform = (kind, text) => (kind === "player" ? renameText(text) : kind === "feed" ? pruneFeedText(text) : text);

  // ---- request flags (opt-in) with the plain-retry fallback ------------------
  function setPath(obj, path) {
    const parts = path.split(".");
    let cur = obj;
    for (let i = 0; i < parts.length - 1; i++) {
      if (typeof cur[parts[i]] !== "object" || cur[parts[i]] === null) cur[parts[i]] = {};
      cur = cur[parts[i]];
    }
    cur[parts[parts.length - 1]] = true;
  }
  function flagBody(text) {
    const body = nativeParse(text);
    for (const p of requestFlags) setPath(body, p);
    return nativeStringify(body);
  }
  const BAD_STATUS_RE = /"status"\s*:\s*"(ERROR|UNPLAYABLE|LOGIN_REQUIRED)"/;
  const badPlayability = (t) => {
    if (!BAD_STATUS_RE.test(t)) return false;
    try { const s = nativeParse(t).playabilityStatus.status; return s === "ERROR" || s === "UNPLAYABLE" || s === "LOGIN_REQUIRED"; } catch { return false; }
  };

  // ---- the hooks, installed on a window (the page and each same-origin iframe)
  const armed = new WeakSet();
  // proxy → the native it wraps. Function.prototype.toString answers for the
  // native, so fetch.toString() is exactly "function fetch() { [native code] }"
  // (a bare Proxy would say "function () { [native code] }" — no name, a tell).
  const shadow = new WeakMap();
  const cloaked = (orig, apply) => {
    const p = new Proxy(orig, { apply(t, self, args) { try { return apply(t, self, args); } catch (e) { throw scrub(e); } } });
    shadow.set(p, orig);
    return p;
  };
  function install(win) {
    if (!win || armed.has(win)) return;
    armed.add(win);
    const hook = (obj, prop, makeApply) => {
      try {
        const orig = obj && obj[prop];
        if (typeof orig !== "function") return;
        obj[prop] = cloaked(orig, makeApply(orig));
      } catch {}
    };
    try {
      const FP = win.Function && win.Function.prototype;
      const ts = FP && FP.toString;
      if (typeof ts === "function" && !shadow.has(ts)) {
        FP.toString = cloaked(ts, (t, thisArg, args) => {
          let o = thisArg, n = 0;
          while (n++ < 8 && shadow.has(o)) o = shadow.get(o);
          return Reflect.apply(t, o, args);
        });
      }
    } catch {}
    const Resp = win.Response;
    const Req = win.Request;

    // Rebuild a fetch response with transformed text, same status/headers/url.
    function rewrite(res, kind) {
      try {
        if (!res || res.ok !== true || typeof res.clone !== "function") return res;
        return res.clone().text().then((text) => {
          const out = transform(kind, text);
          if (out === text) return res;
          const r = new Resp(out, { status: res.status, statusText: res.statusText, headers: res.headers });
          try { Object.defineProperties(r, { url: { value: res.url }, type: { value: res.type }, redirected: { value: res.redirected } }); } catch {}
          return r;
        }).catch(() => res);
      } catch { return res; }
    }
    // The page sees a rejection from fetch without a frame of ours in its stack.
    const settle = (p) => (p && typeof p.then === "function" ? Reflect.apply(nativeThen, p, [undefined, rethrow]) : p);

    hook(win, "fetch", () => function (target, thisArg, args) {
      let url = "";
      try { const i = args[0]; url = typeof i === "string" ? i : (i && i.url) || String(i); } catch {}
      const kind = classify(url);
      if (!kind) return settle(Reflect.apply(target, thisArg, args));
      try {
        // A shaped /player request (only after a refusal): the body as a string, or inside a Request.
        if (shape && PLAYER_REQ_RE.test(url)) {
          const init = args[1];
          if (init && typeof init.body === "string") {
            args = [args[0], Object.assign({}, init, { body: shapeBody(init.body) })].concat(Array.prototype.slice.call(args, 2));
          } else if (Req && args[0] instanceof Req && !init && args[0].method === "POST") {
            const req = args[0];
            return settle(req.clone().text().then((t) => {
              const s = shapeBody(t);
              return Reflect.apply(target, thisArg, [s === t ? req : new Req(req, { body: s })]);
            }, () => Reflect.apply(target, thisArg, [req])).then((res) => rewrite(res, kind)));
          }
        }
        const init = args[1];
        if (kind === "player" && requestFlags.length && /\/youtubei\/v1\/player/.test(url) && init && typeof init.body === "string" && init.body.charAt(0) === "{") {
          const flagged = Object.assign({}, init, { body: flagBody(init.body) });
          return settle(Reflect.apply(target, thisArg, [args[0], flagged]).then((res) => {
            if (!res || typeof res.clone !== "function") return res;
            const plain = () => Reflect.apply(target, thisArg, [args[0], init]).then((res2) => {
              if (!res2 || !res2.ok) return rewrite(res, kind);
              return res2.clone().text().then((t2) => {
                if (badPlayability(t2)) return rewrite(res, kind); // not the flag's fault
                requestFlags = []; // proven: the flag broke playback on this page
                return rewrite(res2, kind);
              });
            }).catch(() => rewrite(res, kind));
            if (!res.ok) return plain();
            return res.clone().text().then((t) => (badPlayability(t) ? plain() : rewrite(res, kind)));
          }));
        }
      } catch {}
      return settle(Reflect.apply(target, thisArg, args).then((res) => rewrite(res, kind)));
    });

    // XHR: remember method + URL; answer the ATR ad-state ping locally; shape a
    // /player body after a refusal; transform responses.
    const X = win.XMLHttpRequest;
    if (X && X.prototype) {
      const meta = new WeakMap();
      hook(X.prototype, "open", () => function (target, thisArg, args) {
        try { meta.set(thisArg, { method: String(args[0] || "GET").toUpperCase(), url: String(args[1] || "") }); } catch {}
        return Reflect.apply(target, thisArg, args);
      });
      hook(X.prototype, "send", () => function (target, thisArg, args) {
        const m = meta.get(thisArg);
        if (m && m.method === "POST" && ATR_RE.test(m.url)) {
          try {
            Object.defineProperties(thisArg, {
              readyState: { value: 4, configurable: true }, status: { value: 200, configurable: true },
              statusText: { value: "OK", configurable: true }, response: { value: "", configurable: true },
              responseText: { value: "", configurable: true }, responseURL: { value: m.url, configurable: true },
            });
            win.setTimeout(() => {
              for (const type of ["readystatechange", "load", "loadend"]) { try { thisArg.dispatchEvent(new win.Event(type)); } catch {} }
            }, 1);
          } catch {}
          return undefined; // never sent
        }
        if (shape && m && m.method === "POST" && PLAYER_REQ_RE.test(m.url) && typeof args[0] === "string") {
          try { args = [shapeBody(args[0])]; } catch {}
        }
        return Reflect.apply(target, thisArg, args);
      });
      for (const prop of ["responseText", "response"]) {
        const d = Object.getOwnPropertyDescriptor(X.prototype, prop);
        if (!d || typeof d.get !== "function") continue;
        const getter = cloaked(d.get, (target, thisArg, args) => {
          const v = Reflect.apply(target, thisArg, args);
          try {
            const m = meta.get(thisArg);
            if (!m || thisArg.readyState !== 4) return v;
            const kind = classify(m.url);
            if (!kind) return v;
            if (typeof v === "string") {
              if (m.src !== v) { m.src = v; m.out = transform(kind, v); }
              return m.out;
            }
            if (v && typeof v === "object" && !m.done) { // responseType "json"
              m.done = true;
              if (kind === "player") renameInObject(v, 0); else { pruneRenderers(v, 0); pruneReelAds(v); }
            }
          } catch {}
          return v;
        });
        try { Object.defineProperty(X.prototype, prop, Object.assign({}, d, { get: getter })); } catch {}
      }
    }

    // The fake-buffering penalty: setTimeout(<bound native fn>, 17000) → 17 ms (uBO nano-stb).
    hook(win, "setTimeout", () => function (target, thisArg, args) {
      try {
        if (args[1] === 17000 && typeof args[0] === "function" && fnToString.call(args[0]).indexOf("[native code]") !== -1) {
          args = [args[0], 17].concat(Array.prototype.slice.call(args, 2));
        }
      } catch {}
      return Reflect.apply(target, thisArg, args);
    });

    // Pristine functions from a fresh iframe: its window is armed on the way out of
    // the contentWindow / contentDocument getters, however the frame got in. The
    // getter itself runs no page code, so no page code ever runs under our frame.
    const IF = win.HTMLIFrameElement && win.HTMLIFrameElement.prototype;
    for (const prop of ["contentWindow", "contentDocument"]) {
      try {
        const d = IF && Object.getOwnPropertyDescriptor(IF, prop);
        if (!d || typeof d.get !== "function") continue;
        const getter = cloaked(d.get, (target, thisArg, args) => {
          const v = Reflect.apply(target, thisArg, args);
          try { const w = prop === "contentWindow" ? v : v && v.defaultView; if (w) install(w); } catch {}
          return v;
        });
        Object.defineProperty(IF, prop, Object.assign({}, d, { get: getter }));
      } catch {}
    }
    // …and a frame reached by index (window[0]) is armed as soon as it is inserted.
    try {
      const MO = win.MutationObserver;
      const doc = win.document;
      if (MO && doc) {
        new MO((records) => {
          for (const r of records) {
            for (const n of r.addedNodes || []) {
              if (n && n.nodeType === 1 && n.tagName === "IFRAME") { try { const w = n.contentWindow; if (w) install(w); } catch {} }
            }
          }
        }).observe(doc, { childList: true, subtree: true });
      }
    } catch {}
  }
  install(window);

  // ---- "abnormality detected": that callback is never run (www.youtube.com) ----
  // The needle is assembled so that no function of ours contains it.
  if (WWW) {
    const NEEDLE = "onAbnormality" + "Detected";
    const seen = new WeakMap();
    const noop = function () {};
    const abnormal = (fn) => {
      let v = seen.get(fn);
      if (v === undefined) {
        v = false;
        try { v = fnToString.call(fn).indexOf(NEEDLE) !== -1; } catch {}
        seen.set(fn, v);
      }
      return v;
    };
    try {
      const PP = window.Promise && window.Promise.prototype;
      if (PP && typeof PP.then === "function") {
        PP.then = cloaked(PP.then, (target, thisArg, args) => {
          if (typeof args[0] === "function" && abnormal(args[0]) && !premium()) {
            args = Array.prototype.slice.call(args);
            args[0] = noop;
          }
          return Reflect.apply(target, thisArg, args);
        });
      }
    } catch {}
  }

  const onWatch = () => { try { const p = location.pathname; return p === "/watch" || p.indexOf("/embed/") === 0; } catch { return false; } };
  const onEmbed = () => { try { return location.pathname.indexOf("/embed/") === 0; } catch { return false; } };

  // ---- the player's own word that a start is stuck (www.youtube.com) -----------
  // When YouTube starves a flagged client the player says so at once — it looks up its "onSnackbarMessage"
  // handler and queues a 104/105-byte message — while its stats show 0x0 with an empty buffer. The uBO
  // maintainers retry right then; we waited 10 s for the stats alone, and that wait was the delay at the
  // start of a clip (6.1.1). The hooks only note the time (no page code runs under them); the guard below
  // acts on it, once the stuck state has held for a second. The 10 s timer stays as the fallback for a player
  // that stops saying so. Array.prototype.push is the hottest function of the page, so the hooks are there only
  // while a clip is starting (from the watch page or a new clip until it has played 2 s), then the natives
  // are put back.
  let signalAt = 0;
  let hooks = null; // while armed: [proto, prop, native, ours]
  const getter = (o, k) => { try { const d = Object.getOwnPropertyDescriptor(o, k); return d && d.get; } catch { return null; } };
  const isView = ArrayBuffer.isView;
  const TA = Object.getPrototypeOf(Uint8Array.prototype);
  const taTag = getter(TA, Symbol.toStringTag), taLen = getter(TA, "length"), taBuf = getter(TA, "buffer");
  const abLen = getter(ArrayBuffer.prototype, "byteLength");
  const MAP_PROTO = Object.getPrototypeOf(new Map());
  const ARRAY_PROTO = Object.getPrototypeOf([]);
  // A standalone Uint8Array of 104 or 105 bytes, read through the natives (no getter of the page runs,
  // a Proxy or a DataView is not one, and an array from another frame still counts).
  const signalBytes = (n) => {
    if (!isView(n) || !taTag || !taLen || !taBuf || !abLen) return false;
    try {
      if (Reflect.apply(taTag, n, []) !== "Uint8Array") return false;
      const len = Reflect.apply(taLen, n, []);
      return (len === 104 || len === 105) && Reflect.apply(abLen, Reflect.apply(taBuf, n, []), []) === len;
    } catch { return false; }
  };
  function armSignals() {
    if (hooks || !WWW) return;
    hooks = [];
    const note = (proto, prop, test) => {
      try {
        const orig = proto[prop];
        if (typeof orig !== "function") return;
        const ours = cloaked(orig, (target, thisArg, args) => {
          try { if (args.length && test(args[0])) signalAt = Date.now(); } catch {}
          return Reflect.apply(target, thisArg, args);
        });
        proto[prop] = ours;
        hooks.push([proto, prop, orig, ours]);
      } catch {}
    };
    note(MAP_PROTO, "has", (k) => k === "onSnackbarMessage");
    note(ARRAY_PROTO, "push", signalBytes);
  }
  function disarmSignals() {
    if (!hooks) return;
    for (const [proto, prop, orig, ours] of hooks) { try { if (proto[prop] === ours) proto[prop] = orig; } catch {} }
    hooks = null;
  }
  if (WWW && onWatch()) armSignals();

  // ---- the player: stitched ads, refusals, stuck starts (www.youtube.com) ------
  const STUCK_MS = 10 * 1000;            // a stuck start the player did not report: retried after this long
  const TOLD_MS = 1000;                  // …one it did report: once the stuck state has held this long
  const SIGNAL_MS = 3 * 1000;            // the player's word counts this long
  const SETTLE_MS = 8 * 1000;            // a reload's own answer gets this long to replace the old one
  const MAX_RETRIES = WATCH_SHAPES.length + 1; // per clip: every shape once, then as sent
  let clip = "", retries = 0, stuckSince = 0, jumpedAt = 0;
  let reloadedFrom = null, reloadedAt = 0;  // the response a retry replaced, and when
  let answerAt = 0;                         // when the answer to the last retry landed (older words were about the old one)
  let reloadStart = 0, playlistDone = true; // where the retried clip starts; its playlist is back
  let lastCurrent = -1, playingTicks = 0;   // the clip has been playing for this many ticks in a row
  // UNPLAYABLE with the ad-blocker help page as the way out (a captcha is not us).
  function refused(ps) {
    if (!ps || ps.status !== "UNPLAYABLE") return false;
    const es = ps.errorScreen || {};
    const pem = es.playerErrorMessageRenderer;
    if (pem && pem.playerCaptchaViewModel) return false;
    let s = "";
    try {
      const inter = es.playerInterstitialRenderer;
      const runs = (pem && pem.subreason && pem.subreason.runs) ||
        (inter && inter.content && inter.content.interstitialViewModel && inter.content.interstitialViewModel.description &&
          inter.content.interstitialViewModel.description.commandRuns);
      s = runs ? nativeStringify(runs) : "";
    } catch {}
    return s.indexOf("support.google.com/youtube/answer/3037019") !== -1 && s.indexOf("WEB_PAGE_TYPE_UNKNOWN") !== -1;
  }
  function stuck(mp, stats) {
    try {
      const st = mp.getPlayerStateObject && mp.getPlayerStateObject();
      return !!(st && st.isBuffering) && stats.buffer_health_seconds === "0.00 s" && stats.resolution === "0x0";
    } catch { return false; }
  }
  // The answer to a shaped request: its tracking URL carries the "#reloadxhr" referer.
  function shapedAnswer(resp) {
    try { const u = resp.playbackTracking.videostatsPlaybackUrl.baseUrl; return typeof u === "string" && u.indexOf("reloadxhr") !== -1; } catch { return false; }
  }
  // youtube_skip (isolated world) starts its stall clock again on every retry: its reload and the six-hour
  // bypass are for a clip that still does not start once these retries are over, not for one being retried.
  function announceRetry() {
    try { if (NativeEvent && nativeDispatch) Reflect.apply(nativeDispatch, document, [new NativeEvent("tbab-yt-retry")]); } catch {}
  }
  // The clip again, in place, with the first shape of `next`. Nothing is counted when it cannot be retried.
  function retry(mp, resp, next) {
    const id = resp && resp.videoDetails && resp.videoDetails.videoId;
    if (!id || typeof mp.loadVideoById !== "function") return false;
    let start = 0;
    try {
      const cfg = resp.playerConfig && resp.playerConfig.playbackStartConfig;
      start = (cfg && Number(cfg.startSeconds)) || parseInt(new URLSearchParams(location.search).get("t"), 10) || 0;
    } catch {}
    left = next; shape = next[0] || ""; retries++;
    reloadedFrom = resp; reloadedAt = Date.now(); reloadStart = start; playlistDone = false;
    stuckSince = 0; signalAt = 0; playingTicks = 0;
    armSignals();
    announceRetry();
    try { mp.loadVideoById(id, start); } catch {}
    return true;
  }
  // loadVideoById drops the playlist the clip was played from: once the retried clip runs, it is put back
  // (as in the uBO quick fix) — otherwise the next clip of the list never comes.
  function restorePlaylist(mp, prog) {
    if (playlistDone || !prog) return;
    const ran = prog.current - reloadStart;
    if (!(ran > 0.1)) return;
    playlistDone = true;
    if (ran >= 5) return;
    try {
      if (location.search.indexOf("list=") === -1 || typeof mp.getPlaylistId !== "function" || mp.getPlaylistId() !== null) return;
      const mgr = typeof document.querySelector === "function" ? document.querySelector("yt-playlist-manager") : null;
      const data = mgr && typeof mgr.getPlaylistData === "function" ? mgr.getPlaylistData() : null;
      if (!data) return;
      if (typeof mgr.setPlaylistData === "function") mgr.setPlaylistData(data);
      if (typeof mgr.setPlayerPlaybackControlData === "function") mgr.setPlayerPlaybackControlData({ playlistPanelRenderer: data });
    } catch {}
  }
  function guard() {
    if (!onWatch()) { left = null; disarmSignals(); return; } // a new watch page starts the list again; the shape stays (as uBO's)
    const mp = document.getElementById("movie_player");
    if (!mp || typeof mp.getPlayerResponse !== "function" || premium()) return;
    let resp = null, stats = null, prog = null;
    try { resp = mp.getPlayerResponse(); } catch {}
    try { stats = mp.getStatsForNerds ? mp.getStatsForNerds() : null; } catch {}
    try { prog = mp.getProgressState ? mp.getProgressState() : null; } catch {}
    const id = (resp && resp.videoDetails && resp.videoDetails.videoId) || "";
    // a new clip (a gap while reloading is not one): its own retries and its own list of shapes
    if (id && id !== clip) { clip = id; retries = 0; stuckSince = 0; left = null; playlistDone = true; playingTicks = 0; armSignals(); }
    // the answer to the last retry has landed: what the player said before it was about the old one
    if (reloadedFrom && resp && resp !== reloadedFrom) { reloadedFrom = null; answerAt = Date.now(); }
    // the clip plays (2 s of progress with a picture): the natives go back
    const cur = prog && typeof prog.current === "number" ? prog.current : -1;
    if (stats && stats.resolution && stats.resolution !== "0x0" && cur > lastCurrent + 0.1 && lastCurrent >= 0) playingTicks++;
    else playingTicks = 0;
    lastCurrent = cur;
    if (playingTicks >= 4) disarmSignals();
    // 1) an ad stitched into the stream: jump to its end
    if (stats && typeof stats.debug_info === "string" && stats.debug_info.indexOf("SSAP, AD") === 0) {
      stuckSince = 0;
      if (!ssapOn) return;
      const len = Number(resp && resp.videoDetails && resp.videoDetails.lengthSeconds) || 0;
      const now = Date.now();
      // never when the "ad" duration is the clip's own (that jump would end the clip)
      if (prog && prog.duration > 0 && prog.duration - prog.current > 1 && !(len > 0 && Math.abs(prog.duration - len) < 1.5) && now - jumpedAt > 1000) {
        jumpedAt = now;
        try { mp.seekTo(prog.duration); } catch {}
      }
      return;
    }
    restorePlaylist(mp, prog);
    if (!shapesOn || retries >= MAX_RETRIES) return;
    if (left === null) left = (onEmbed() ? EMBED_SHAPES : WATCH_SHAPES).slice();
    // the clip was just retried: the player still holds the old answer until the new one lands
    if (reloadedFrom && Date.now() - reloadedAt < SETTLE_MS && (resp === reloadedFrom || !resp)) return;
    // 2) refused: the next shape (a refusal moves past the first one, as uBO's does); once the list is
    //    empty the clip goes out once more as built, then nothing
    if (resp && refused(resp.playabilityStatus)) {
      if (left.length) retry(mp, resp, left.slice(1));
      return;
    }
    // 3) stuck at 0x0 with an empty buffer (visible tab, online): after a second when the player has said so
    //    since the last answer landed, after STUCK_MS when it has not
    let online = true;
    try { online = navigator.onLine !== false; } catch {}
    if (!stats || !stuck(mp, stats) || !online || document.visibilityState === "hidden") { stuckSince = 0; return; }
    const now = Date.now();
    if (!stuckSince) stuckSince = now;
    const told = signalAt > 0 && signalAt >= answerAt && now - signalAt < SIGNAL_MS;
    if (now - stuckSince < (told ? TOLD_MS : STUCK_MS)) return;
    // the shape in force got stuck too → the next one
    const next = left.length && (shapedAnswer(resp) || (shape && shape === left[0])) ? left.slice(1) : left;
    // every shape tried: requests go out as built again, no further retry here — youtube_skip's stall clock,
    // no longer restarted, decides (a page reload, then the bypass)
    if (!next.length) { left = next; shape = ""; stuckSince = 0; signalAt = 0; return; }
    retry(mp, resp, next);
  }
  if (WWW && nativeSetInterval) {
    try { nativeSetInterval.call(window, () => { try { guard(); } catch {} }, 500); } catch {}
  }

  // ---- the inline first answers of a full page load ---------------------------
  // var ytInitialData = … and var ytInitialPlayerResponse = … arrive inline; each is cleaned as it is
  // assigned, then turned back into a plain data property (a lingering accessor would itself be a tell).
  // The player answer used to be left to the uBO set-constant rules for the host, which never ran there (6.1.1:
  // a reload played the ad). Where such a rule got there first, it keeps it. A page that never assigns one (no
  // player on it) keeps no accessor of ours: an untouched trap is removed at DOMContentLoaded.
  const traps = [];
  function cleanOnAssign(name, clean) {
    try {
      if (Object.getOwnPropertyDescriptor(window, name)) return;
      const trap = {
        configurable: true, enumerable: true,
        get() { return undefined; },
        set(v) {
          try { clean(v); } catch {}
          try { Object.defineProperty(window, name, { value: v, writable: true, enumerable: true, configurable: true }); } catch {}
        },
      };
      Object.defineProperty(window, name, trap);
      traps.push([name, trap.get]);
    } catch {}
  }
  cleanOnAssign("ytInitialData", (v) => pruneRenderers(v, 0));
  cleanOnAssign("ytInitialPlayerResponse", (v) => renameInObject(v, 0));
  try {
    document.addEventListener("DOMContentLoaded", () => {
      for (const [name, get] of traps) {
        try { const d = Object.getOwnPropertyDescriptor(window, name); if (d && d.get === get) delete window[name]; } catch {}
      }
    }, { once: true, capture: true });
  } catch {}
})();
