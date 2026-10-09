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
//     trivially detectable.)
//  3. YouTube takes pristine fetch/XHR/setTimeout from a fresh iframe to get past
//     hooks: every same-origin iframe the page adds gets the same hooks.
//  4. The ad-state report ping (/api/stats/atr with the ad payload) is answered
//     locally and never sent — the pattern is the one the uBO filters use.
//  5. The 17-second "fake buffering" penalty timer runs in 17 ms.
//  6. No request flags by default (isInlinePlaybackNoAd on a normal watch page is
//     itself a server-side signal); the live filter update can still turn flags
//     on, with the old plain-retry fallback.
// Feed / search / next responses lose their ad renderers the same way (text in,
// text out). Nothing here touches the video stream or its signatures.
(function () {
  "use strict";

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
  const FEED_RE = /\/youtubei\/v1\/(browse|search|next|guide|reel\/reel_watch_sequence)(\?|$)/;
  let RENDERER_RE = null;
  const rebuildRendererRe = () => { RENDERER_RE = new RegExp('"(' + [...AD_RENDERERS].join("|") + ')"'); };
  rebuildRendererRe();

  const nativeParse = JSON.parse;
  const nativeStringify = JSON.stringify;
  const fnToString = Function.prototype.toString;

  // Live-update extras arrive from the isolated loader as a JSON string on a DOM
  // event (data only, never code). Request flags are opt-in from that channel.
  function applyConfig(cfg) {
    if (!cfg || typeof cfg !== "object") return;
    if (Array.isArray(cfg.adFields)) for (const f of cfg.adFields) if (ident(f) && !RENAME.includes(f)) RENAME = RENAME.concat(f);
    if (Array.isArray(cfg.adRenderers)) { for (const r of cfg.adRenderers) if (ident(r)) AD_RENDERERS.add(r); rebuildRendererRe(); }
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
  function install(win) {
    if (!win || armed.has(win)) return;
    armed.add(win);
    const hook = (obj, prop, makeApply) => {
      try {
        const orig = obj && obj[prop];
        if (typeof orig !== "function") return;
        const p = new Proxy(orig, { apply: makeApply(orig) });
        shadow.set(p, orig);
        obj[prop] = p;
      } catch {}
    };
    try {
      const FP = win.Function && win.Function.prototype;
      const ts = FP && FP.toString;
      if (typeof ts === "function" && !shadow.has(ts)) {
        const p = new Proxy(ts, { apply: (t, thisArg, args) => {
          let o = thisArg, n = 0;
          while (n++ < 8 && shadow.has(o)) o = shadow.get(o);
          return Reflect.apply(t, o, args);
        } });
        shadow.set(p, ts);
        FP.toString = p;
      }
    } catch {}
    const Resp = win.Response;

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

    hook(win, "fetch", () => function (target, thisArg, args) {
      let url = "";
      try { const i = args[0]; url = typeof i === "string" ? i : (i && i.url) || String(i); } catch {}
      const kind = classify(url);
      if (!kind) return Reflect.apply(target, thisArg, args);
      try {
        const init = args[1];
        if (kind === "player" && requestFlags.length && /\/youtubei\/v1\/player/.test(url) && init && typeof init.body === "string" && init.body.charAt(0) === "{") {
          const flagged = Object.assign({}, init, { body: flagBody(init.body) });
          return Reflect.apply(target, thisArg, [args[0], flagged]).then((res) => {
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
          });
        }
      } catch {}
      return Reflect.apply(target, thisArg, args).then((res) => rewrite(res, kind));
    });

    // XHR: remember method + URL; answer the ATR ad-state ping locally; transform responses.
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
        return Reflect.apply(target, thisArg, args);
      });
      for (const prop of ["responseText", "response"]) {
        const d = Object.getOwnPropertyDescriptor(X.prototype, prop);
        if (!d || typeof d.get !== "function") continue;
        const getter = new Proxy(d.get, {
          apply(target, thisArg, args) {
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
          },
        });
        shadow.set(getter, d.get);
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

    // Pristine functions from a fresh iframe: arm every same-origin iframe the page inserts.
    const arm = (node) => {
      try {
        if (!node || node.nodeType !== 1) return;
        const frames = node.tagName === "IFRAME" ? [node] : node.querySelectorAll ? node.querySelectorAll("iframe") : [];
        for (const f of frames) { let w = null; try { w = f.contentWindow; } catch {} if (w) install(w); }
      } catch {}
    };
    const N = win.Node && win.Node.prototype, E = win.Element && win.Element.prototype;
    const afterInsert = (pick) => () => function (target, thisArg, args) {
      const r = Reflect.apply(target, thisArg, args);
      try { for (const n of pick(args)) arm(n); } catch {}
      return r;
    };
    hook(N, "appendChild", afterInsert((a) => [a[0]]));
    hook(N, "insertBefore", afterInsert((a) => [a[0]]));
    hook(E, "append", afterInsert((a) => Array.prototype.slice.call(a)));
    hook(E, "prepend", afterInsert((a) => Array.prototype.slice.call(a)));
    // However a frame got in (innerHTML, a fragment, insertAdjacentElement…), its window
    // is reached through these getters: arm it on the way out.
    const IF = win.HTMLIFrameElement && win.HTMLIFrameElement.prototype;
    for (const prop of ["contentWindow", "contentDocument"]) {
      try {
        const d = IF && Object.getOwnPropertyDescriptor(IF, prop);
        if (!d || typeof d.get !== "function") continue;
        const getter = new Proxy(d.get, {
          apply(target, thisArg, args) {
            const v = Reflect.apply(target, thisArg, args);
            try { const w = prop === "contentWindow" ? v : v && v.defaultView; if (w) install(w); } catch {}
            return v;
          },
        });
        shadow.set(getter, d.get);
        Object.defineProperty(IF, prop, Object.assign({}, d, { get: getter }));
      } catch {}
    }
  }
  install(window);

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
