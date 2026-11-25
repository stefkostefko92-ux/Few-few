// Twitch ads in the page (MAIN) world — registered by the service worker as a
// document_start content script on *.twitch.tv (5.7).
//
// Twitch does not send its video ads as separate requests a network rule could stop: they
// are stitched into the live HLS stream on Twitch's servers. The media playlist the player
// polls every two seconds simply lists ad segments instead of the stream ("#EXTINF:…,Amazon|…"
// and a DATERANGE of CLASS "twitch-stitched-ad"; stream segments say ",live"). The player
// fetches those playlists inside a Web Worker, so this file wraps the Worker constructor and
// puts our code (twitchWorker below, bundled, never fetched) in front of the player's own
// worker script. Inside the worker, when a media playlist carries an ad:
//  1. it asks Twitch — and only Twitch — for the same channel as another player type
//     ("embed", "popout", "autoplay": measured 2026-10-25, those came without the preroll)
//     and hands the player that stream's playlist for the same quality. That quality then
//     STAYS on the other stream for the session (it is packaged differently — HLS v3 against
//     v6 — and every switch would be a jump for the player);
//  2. if every one of them has the ad too, the ad segments are taken out of the playlist:
//     the picture waits on its last frame for the length of the break instead of an ad.
// Nothing is sent anywhere but Twitch's own servers (gql.twitch.tv, usher.ttvnw.net,
// *.ttvnw.net), with the public web client id and no account token. Playlists are read as
// text and never run. When Twitch changes how it does this, the fix comes as an update.
(function () {
  "use strict";

  // ---- runs INSIDE the player's worker (stringified: it must not use anything from outside) ----
  function twitchWorker(CFG) {
    "use strict";
    const G = self;
    const realFetch = G.fetch;
    if (typeof realFetch !== "function") return;
    const shadow = new WeakMap();
    const cloak = (orig, apply) => { const p = new Proxy(orig, { apply }); shadow.set(p, orig); return p; };
    try {
      const FP = Function.prototype;
      FP.toString = cloak(FP.toString, (t, self_, args) => {
        let o = self_, n = 0;
        while (n++ < 8 && shadow.has(o)) o = shadow.get(o);
        return Reflect.apply(t, o, args);
      });
    } catch (e) {}
    const get = (u, init) => Reflect.apply(realFetch, G, init ? [u, init] : [u]);

    const USHER = /^https:\/\/usher\.ttvnw\.net\/api\/(?:v\d+\/)?channel\/hls\/([^/?#]+)\.m3u8/i;
    const MEDIA = /^https:\/\/[^/?#]+\.ttvnw\.net\/v1\/playlist\/[^?#]+\.m3u8/i;
    const variants = new Map(); // media playlist (no query) → { login, usher, name, res }
    const lists = new Map();    // login|type → the other player type's variants (kept until one fails)
    const adsUntil = new Map(); // type → until when it is known to carry the ad too
    const movedTo = new Map();  // media playlist (no query) → the player type it now comes from
    let lastGood = "";

    const urlOf = (i) => { try { return typeof i === "string" ? i : (i && i.url) || String(i); } catch (e) { return ""; } };
    const bare = (u) => { const k = u.indexOf("?"); return k < 0 ? u : u.slice(0, k); };
    const isLive = (extinf) => /^#EXTINF:[\d.]+,(?:live|\s*$)/.test(extinf);
    const hasAds = (t) => t.indexOf("twitch-stitched-ad") !== -1 || /^#EXTINF:[\d.]+,(?!live)\S/m.test(t);
    const attrs = (line) => {
      const o = {}, re = /([A-Z0-9-]+)=("[^"]*"|[^,]*)/g;
      let m;
      while ((m = re.exec(line))) o[m[1]] = m[2].charAt(0) === '"' ? m[2].slice(1, -1) : m[2];
      return o;
    };
    function parseMaster(text) {
      const out = [], lines = text.split("\n");
      for (let i = 0; i < lines.length; i++) {
        const l = lines[i].trim();
        if (l.indexOf("#EXT-X-STREAM-INF:") !== 0) continue;
        const a = attrs(l);
        for (let j = i + 1; j < lines.length; j++) {
          const n = lines[j].trim();
          if (!n) continue;
          if (n.charAt(0) !== "#") { out.push({ name: a.VIDEO || "", res: a.RESOLUTION || "", url: n }); i = j; }
          break;
        }
      }
      return out;
    }
    // the same quality on the other stream: same name ("720p60"), else same size, else the
    // tallest one not above it, else the first
    function pick(list, want) {
      if (!list || !list.length) return null;
      for (const v of list) if (want.name && v.name === want.name) return v;
      for (const v of list) if (want.res && v.res === want.res) return v;
      const h = (r) => parseInt(String(r).split("x")[1], 10) || 0;
      let best = null;
      for (const v of list) if (h(v.res) <= h(want.res) && (!best || h(v.res) > h(best.res))) best = v;
      return best || list[0];
    }
    function rebuild(res, text) {
      const r = new Response(text, { status: res.status, statusText: res.statusText, headers: res.headers });
      try { Object.defineProperty(r, "url", { value: res.url }); } catch (e) {}
      return r;
    }

    // The ad taken out: its segments and every tag that belongs to them, its tracking
    // DATERANGEs and the low-latency prefetch hints; the sequence numbers stay true.
    function strip(text) {
      const SEG = /^#(?:EXTINF|EXT-X-PROGRAM-DATE-TIME|EXT-X-DISCONTINUITY|EXT-X-MAP|EXT-X-BYTERANGE|EXT-X-KEY|EXT-X-GAP|EXT-X-BITRATE)\b/;
      const out = [];
      let pending = [], cur = "", lead = true, droppedSeg = 0, droppedDisc = 0;
      for (const raw of text.split("\n")) {
        const l = raw.trim();
        if (!l) continue;
        if (l.charAt(0) !== "#") {
          if (cur === "ad") {
            if (lead) { droppedSeg++; droppedDisc += pending.filter((x) => /^#EXT-X-DISCONTINUITY\s*$/.test(x.trim())).length; }
          } else { out.push(...pending, raw); lead = false; }
          pending = []; cur = "";
          continue;
        }
        if (/^#EXT-X-TWITCH-PREFETCH:/.test(l)) continue;
        if (/^#EXT-X-DATERANGE:/.test(l) && (/CLASS="twitch-(?:stitched-ad|ad-[a-z-]+|trigger)"/.test(l) ||
          (/CLASS="twitch-stream-source"/.test(l) && !/X-TV-TWITCH-STREAM-SOURCE="live"/i.test(l)))) continue;
        if (/^#EXTINF:/.test(l)) { cur = isLive(l) ? "live" : "ad"; pending.push(raw); continue; }
        if (SEG.test(l)) { pending.push(raw); continue; }
        out.push(raw);
      }
      return out.map((l) => {
        let m = /^#EXT-X-MEDIA-SEQUENCE:(\d+)/.exec(l);
        if (m && droppedSeg) return "#EXT-X-MEDIA-SEQUENCE:" + (Number(m[1]) + droppedSeg);
        m = /^#EXT-X-DISCONTINUITY-SEQUENCE:(\d+)/.exec(l);
        if (m && droppedDisc) return "#EXT-X-DISCONTINUITY-SEQUENCE:" + (Number(m[1]) + droppedDisc);
        return l;
      }).join("\n") + "\n";
    }

    const hex = (n) => { let s = ""; for (let i = 0; i < n; i++) s += "0123456789abcdef"[Math.floor(Math.random() * 16)]; return s; };
    function token(login, type) {
      const body = JSON.stringify({ operationName: "PlaybackAccessToken", query: CFG.query, variables: { login, playerType: type } });
      return get(CFG.gql, { method: "POST", headers: { "Client-ID": CFG.cid, "Content-Type": "text/plain;charset=UTF-8" }, body })
        .then((r) => (r && r.ok ? r.json() : null))
        .then((j) => { const t = j && j.data && j.data.streamPlaybackAccessToken; return t && t.value && t.signature ? t : null; });
    }
    function usherWith(base, tok) {
      const u = new URL(base);
      u.searchParams.set("sig", tok.signature);
      u.searchParams.set("token", tok.value);
      u.searchParams.set("p", String(1000000 + Math.floor(Math.random() * 8999999)));
      if (u.searchParams.has("play_session_id")) u.searchParams.set("play_session_id", hex(32));
      return u.toString();
    }
    // The same session of the other stream for as long as it answers: a fresh token would be a
    // fresh session (new sequence numbers — a jump), so one is asked only after a failure.
    function otherList(v, type) {
      const key = v.login + "|" + type, c = lists.get(key);
      if (c) return Promise.resolve(c);
      return token(v.login, type)
        .then((tok) => (tok ? get(usherWith(v.usher, tok)).then((r) => (r && r.ok ? r.text() : "")) : ""))
        .then((text) => { const list = text ? parseMaster(text) : []; if (list.length) lists.set(key, list); return list; });
    }
    // { type, text }: an ad-free playlist of the same quality from another player type. When
    // this quality already comes from one (`stay`) and every stream has the ad, that stream's
    // own playlist with the ad taken out — the player stays on what it is playing. Else null.
    function clean(v, stay) {
      const now = Date.now();
      const all = [stay, lastGood].concat(CFG.types).filter((t, k, a) => t && a.indexOf(t) === k);
      // a type that just had the ad waits a minute — unless the stream we are on stops answering
      const held = all.filter((t) => t !== stay && adsUntil.get(t) > now);
      let order = all.filter((t) => !held.includes(t));
      let i = 0, stayed = "";
      const next = () => {
        if (i >= order.length) return stayed ? { type: stay, text: strip(stayed) } : null;
        const type = order[i++];
        return otherList(v, type).then((list) => {
          const p = pick(list, v);
          if (!p) return next();
          return get(p.url).then((r) => (r && r.ok ? r.text() : "")).then((t) => {
            const ok = !!t && /^\s*#EXTM3U/.test(t);
            if (ok && !hasAds(t)) { lastGood = type; return { type, text: t }; }
            if (ok) { adsUntil.set(type, Date.now() + CFG.adsBackoff); if (type === stay) stayed = t; }
            else {
              lists.delete(v.login + "|" + type); // an expired session or a moved node: a fresh one next time
              if (type === stay && held.length) { order = order.concat(held); held.length = 0; }
            }
            return next();
          });
        }).catch(next);
      };
      return Promise.resolve().then(next);
    }

    function master(url, res) {
      const m = USHER.exec(url);
      if (!m || !res || !res.ok || typeof res.clone !== "function") return res;
      let login = "";
      try { login = decodeURIComponent(m[1]).toLowerCase(); } catch (e) { return res; }
      return res.clone().text().then((text) => {
        for (const v of parseMaster(text)) variants.set(bare(v.url), { login, usher: url, name: v.name, res: v.res });
        return res;
      }, () => res);
    }
    function media(url, res) {
      if (!res || !res.ok || typeof res.clone !== "function") return res;
      const key = bare(url);
      return res.clone().text().then((text) => {
        const stay = movedTo.get(key) || "";
        if (!stay && !hasAds(text)) return res;
        const own = () => (hasAds(text) ? rebuild(res, strip(text)) : res);
        const v = variants.get(key);
        if (!v || !CFG.types.length) return own();
        return clean(v, stay).then((alt) => {
          if (!alt) return own();
          movedTo.set(key, alt.type);
          return rebuild(res, alt.text);
        }, own);
      }, () => res);
    }

    G.fetch = cloak(realFetch, (t, self_, args) => {
      const url = urlOf(args[0]);
      if (USHER.test(url)) return Reflect.apply(t, self_, args).then((res) => master(url, res));
      if (MEDIA.test(url)) return Reflect.apply(t, self_, args).then((res) => media(url, res));
      return Reflect.apply(t, self_, args);
    });
  }

  // ---- the page: the player's worker gets twitchWorker in front of its own script ----
  const NativeWorker = window.Worker;
  const NativeXHR = window.XMLHttpRequest;
  const NativeBlob = window.Blob;
  const nativeSetTimeout = window.setTimeout;
  const fnToString = Function.prototype.toString;
  const createURL = URL.createObjectURL, revokeURL = URL.revokeObjectURL;
  if (typeof NativeWorker !== "function" || typeof NativeBlob !== "function" || typeof createURL !== "function") return;

  const OWN_RE = /(?:chrome|moz)-extension:\/\//;
  const scrub = (e) => {
    try {
      if (e && typeof e === "object" && typeof e.stack === "string" && OWN_RE.test(e.stack)) {
        e.stack = e.stack.split("\n").filter((l) => !OWN_RE.test(l)).join("\n");
      }
    } catch {}
    return e;
  };
  const CFG = {
    gql: "https://gql.twitch.tv/gql",
    cid: "kimne78kx3ncx6brgo4mv6wki5h1ko", // Twitch's public web id, in every twitch.tv page (not a secret)
    query: "query PlaybackAccessToken($login: String!, $playerType: String!) { streamPlaybackAccessToken(channelName: $login, " +
      "params: {platform: \"web\", playerBackend: \"mediaplayer\", playerType: $playerType}) { value signature } }",
    types: ["embed", "popout", "autoplay"],
    adsBackoff: 60 * 1000,
  };
  const PRELUDE = "try { (" + fnToString.call(twitchWorker) + ")(" + JSON.stringify(CFG) + "); } catch (e) {}\n";
  const IVS = /amazon-ivs-wasmworker/;

  function readSync(url) {
    try {
      const x = new NativeXHR();
      x.open("GET", url, false);
      x.send();
      return x.status === 200 || x.status === 0 ? String(x.responseText || "") : "";
    } catch { return ""; }
  }
  // Only the player's (IVS) worker; anything else is left exactly as it was asked for.
  function ownWorkerUrl(spec) {
    const u = String(spec);
    let body;
    if (/^blob:/.test(u)) {
      const src = readSync(u);
      if (!IVS.test(src)) return null;
      body = src;
    } else if (IVS.test(u)) {
      body = "importScripts(" + JSON.stringify(new URL(u, location.href).href) + ");";
    } else return null;
    const out = Reflect.apply(createURL, URL, [new NativeBlob([PRELUDE, body], { type: "text/javascript" })]);
    try { nativeSetTimeout.call(window, () => { try { Reflect.apply(revokeURL, URL, [out]); } catch {} }, 60000); } catch {}
    return out;
  }

  const shadow = new WeakMap();
  try {
    const FP = Function.prototype, ts = FP.toString;
    const tsP = new Proxy(ts, { apply(t, self, args) {
      let o = self, n = 0;
      while (n++ < 8 && shadow.has(o)) o = shadow.get(o);
      try { return Reflect.apply(t, o, args); } catch (e) { throw scrub(e); }
    } });
    shadow.set(tsP, ts);
    FP.toString = tsP;
  } catch {}
  try {
    const W = new Proxy(NativeWorker, {
      construct(t, args, newTarget) {
        try {
          const opts = args[1];
          if (args.length && !(opts && opts.type === "module")) {
            const u = ownWorkerUrl(args[0]);
            if (u) args = [u].concat(Array.prototype.slice.call(args, 1));
          }
        } catch {}
        try { return Reflect.construct(t, args, newTarget); } catch (e) { throw scrub(e); }
      },
    });
    shadow.set(W, NativeWorker);
    window.Worker = W;
  } catch {}
})();
