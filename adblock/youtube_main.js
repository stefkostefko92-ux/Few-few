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
//       the next request shape — clientScreen CHANNEL, params 8AUB, a "#reloadxhr"
//       referer, params YAHI — and finally as sent. Until a refusal, requests go
//       out exactly as YouTube built them;
//     - the page's "abnormality detected" callback is never run.
//     The live update can switch the shapes or the jump off (data, not code).
// Feed / search / next responses lose their ad renderers the same way (text in,
// text out). Nothing here touches the video stream or its signatures.
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

  // ---- request shapes after a refusal (www.youtube.com) -----------------------
  const SHAPES = ["channel", "lactmilli", "inline", "yahi"];
  let shape = "";        // what /player requests carry now ("" = exactly as YouTube built them)
  let nextShape = 0;     // where the next retry starts in SHAPES
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
  function shapeBody(text) {
    if (!shape || !shapesOn || typeof text !== "string" || text.indexOf('"attestationRequest"') === -1 || premium()) return text;
    let o;
    try { o = nativeParse(text); } catch { return text; }
    if (!o || typeof o !== "object" || !o.attestationRequest) return text;
    const client = o.context && o.context.client;
    const cpc = o.playbackContext && o.playbackContext.contentPlaybackContext;
    if (shape === "channel" && client && client.clientName === "WEB") client.clientScreen = "CHANNEL";
    if (shape === "lactmilli") o.params = "8AUB";
    if (shape === "yahi") o.params = "YAHI";
    if (cpc && typeof cpc === "object") {
      if (shape === "channel" || shape === "lactmilli") cpc.lactMilliseconds = String(Date.now());
      if (typeof cpc.referer === "string" && !/#reloadxhr$/.test(cpc.referer)) cpc.referer += "#reloadxhr";
    }
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
  function pruneFeedText(text) {
    if (typeof text !== "string" || !RENDERER_RE.test(text)) return text; // the common case: untouched
    try { const o = nativeParse(text); pruneRenderers(o, 0); return nativeStringify(o); } catch { return text; }
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
              if (kind === "player") renameInObject(v, 0); else pruneRenderers(v, 0);
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

  // ---- the player: stitched ads, refusals, stuck loads (www.youtube.com) -------
  const STUCK_MS = 10 * 1000;
  const SETTLE_MS = 8 * 1000;            // a reload's own answer gets this long to replace the old one
  const MAX_RETRIES = SHAPES.length + 1; // every shape once, then as sent
  let clip = "", retries = 0, stuckSince = 0, jumpedAt = 0;
  let reloadedFrom = null, reloadedAt = 0;  // the response a retry replaced, and when
  const onWatch = () => { try { const p = location.pathname; return p === "/watch" || p.indexOf("/embed/") === 0; } catch { return false; } };
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
  function reloadClip(mp, resp) {
    const id = resp && resp.videoDetails && resp.videoDetails.videoId;
    if (!id || typeof mp.loadVideoById !== "function") return;
    let start = 0;
    try {
      const cfg = resp.playerConfig && resp.playerConfig.playbackStartConfig;
      start = (cfg && Number(cfg.startSeconds)) || parseInt(new URLSearchParams(location.search).get("t"), 10) || 0;
    } catch {}
    reloadedFrom = resp; reloadedAt = Date.now();
    try { mp.loadVideoById(id, start); } catch {}
  }
  function guard() {
    if (!onWatch()) { nextShape = 0; return; } // a new clip from a list starts the rotation again; the shape stays
    const mp = document.getElementById("movie_player");
    if (!mp || typeof mp.getPlayerResponse !== "function" || premium()) return;
    let resp = null, stats = null, prog = null;
    try { resp = mp.getPlayerResponse(); } catch {}
    try { stats = mp.getStatsForNerds ? mp.getStatsForNerds() : null; } catch {}
    const id = (resp && resp.videoDetails && resp.videoDetails.videoId) || "";
    if (id && id !== clip) { clip = id; retries = 0; stuckSince = 0; } // a gap while reloading is not a new clip
    // 1) an ad stitched into the stream: jump to its end
    if (stats && typeof stats.debug_info === "string" && stats.debug_info.indexOf("SSAP, AD") === 0) {
      stuckSince = 0;
      if (!ssapOn) return;
      try { prog = mp.getProgressState ? mp.getProgressState() : null; } catch {}
      const len = Number(resp && resp.videoDetails && resp.videoDetails.lengthSeconds) || 0;
      const now = Date.now();
      // never when the "ad" duration is the clip's own (that jump would end the clip)
      if (prog && prog.duration > 0 && prog.duration - prog.current > 1 && !(len > 0 && Math.abs(prog.duration - len) < 1.5) && now - jumpedAt > 1000) {
        jumpedAt = now;
        try { mp.seekTo(prog.duration); } catch {}
      }
      return;
    }
    if (!shapesOn || retries >= MAX_RETRIES || nextShape > SHAPES.length) return; // every shape tried, the last time as sent
    // the clip was just retried: the player still holds the old answer until the new one lands
    if (reloadedFrom && Date.now() - reloadedAt < SETTLE_MS && (resp === reloadedFrom || !resp)) return;
    // 2) refused: the next shape (a refusal moves past the first one, as uBO's does)
    if (resp && refused(resp.playabilityStatus)) {
      retries++; stuckSince = 0;
      if (nextShape === 0) nextShape = 1;
      shape = SHAPES[nextShape++] || "";
      reloadClip(mp, resp);
      return;
    }
    // 3) stuck at 0x0 with an empty buffer for 10 s, visible tab, online
    let online = true;
    try { online = navigator.onLine !== false; } catch {}
    if (stats && stuck(mp, stats) && online && document.visibilityState !== "hidden") {
      const now = Date.now();
      if (!stuckSince) { stuckSince = now; return; }
      if (now - stuckSince < STUCK_MS) return;
      stuckSince = 0; retries++;
      shape = SHAPES[nextShape++] || "";
      reloadClip(mp, resp);
    } else stuckSince = 0;
  }
  if (WWW && nativeSetInterval) {
    try { nativeSetInterval.call(window, () => { try { guard(); } catch {} }, 500); } catch {}
  }

  // The first feed arrives inline (var ytInitialData = …): prune it as it is assigned.
  // ytInitialPlayerResponse is handled by the uBO set-constant scriptlets for the host.
  try {
    if (!Object.getOwnPropertyDescriptor(window, "ytInitialData")) {
      // One-shot: the first assignment prunes and turns it back into a plain data
      // property (a lingering accessor would itself be a tell).
      Object.defineProperty(window, "ytInitialData", {
        configurable: true, enumerable: true,
        get() { return undefined; },
        set(v) {
          try { pruneRenderers(v, 0); } catch {}
          try { Object.defineProperty(window, "ytInitialData", { value: v, writable: true, enumerable: true, configurable: true }); } catch {}
        },
      });
    }
  } catch {}
})();
