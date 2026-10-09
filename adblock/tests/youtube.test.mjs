// YouTube път: bypass машина на състоянията (youtube_skip + youtube_loader),
// без seek към края при реклама, резервен път при отказан флагнат /player
// отговор (youtube_main). Всеки случай е реален дефект или регресия от
// доклада „клиповете не зареждат от време на време".
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { runInNewContext } from "node:vm";
import { ROOT, ok, done } from "./_harness.mjs";

const src = (f) => readFileSync(join(ROOT, f), "utf8");
const HOUR = 3600 * 1000;

// ---- симулиран YouTube таб за content scripts (ISOLATED world) -------------
function ytTab({ now = 10 * HOUR, storage = {}, session = {}, els = {}, reply = () => ({ ok: true }) } = {}) {
  const sb = { __now: now, __reloads: 0 };
  sb.window = sb;
  sb.console = { warn() {}, log() {} };
  sb.Date = { now: () => sb.__now };
  sb.Number = Number;
  sb.location = { hostname: "www.youtube.com", href: "https://www.youtube.com/watch?v=x", reload() { sb.__reloads++; } };
  sb.sessionStorage = {
    getItem: (k) => (k in session ? session[k] : null),
    setItem: (k, v) => { session[k] = String(v); },
  };
  const attrs = {};
  const created = [];
  const dispatched = [];
  sb.CustomEvent = class { constructor(type, init) { this.type = type; this.detail = init && init.detail; } };
  sb.document = {
    documentElement: {
      setAttribute: (k, v) => { attrs[k] = v; },
      removeAttribute: (k) => { delete attrs[k]; },
      hasAttribute: (k) => k in attrs,
      style: { removeProperty() {} },
      appendChild: (n) => { created.push(n); },
    },
    head: { appendChild: (n) => { created.push(n); } },
    body: { style: { removeProperty() {} }, removeAttribute() {} },
    querySelector: (sel) => (sel in els ? els[sel] : null),
    querySelectorAll: (sel) => (sel in els ? [].concat(els[sel]) : []),
    getElementById: () => null,
    createElement: (tag) => ({ tag, remove() {} }),
    addEventListener() {},
    dispatchEvent: (ev) => { dispatched.push(ev); return true; },
  };
  sb.MutationObserver = class { constructor(cb) { sb.__mo = cb; } observe() {} };
  sb.setInterval = () => 1;
  const messages = [];
  const listeners = [];
  sb.chrome = {
    runtime: {
      getURL: (p) => "chrome-extension://id/" + p,
      sendMessage: (msg, cb) => { messages.push(msg); const r = reply(msg); if (cb) cb(r); },
    },
    storage: {
      local: { get: (keys, cb) => cb(storage) },
      onChanged: { addListener: (f) => listeners.push(f) },
    },
  };
  const load = (file) => runInNewContext(src(file), sb, { filename: file });
  const run = () => sb.__mo && sb.__mo([]);
  const change = (c) => listeners.forEach((f) => f(c, "local"));
  return { sb, attrs, created, dispatched, messages, session, load, run, change };
}
const player = (...classes) => ({ classList: { contains: (c) => classes.includes(c) } });
const video = () => ({ muted: false, playbackRate: 1, currentTime: 5, duration: 600 });
const enforcement = { textContent: "Ad blockers violate YouTube's Terms of Service" };

// ---------- 1) реклама без bypass: САМО mute — без ускорение (YouTube брои 16× като сигнал), без seek ----------
{
  const v = video();
  const t = ytTab({ storage: { enabled: true }, els: { ".html5-video-player": player("ad-showing"), "video.html5-main-video, video": v } });
  t.load("youtube_skip.js");
  ok("skip: ad → muted, playbackRate untouched (16× is a strike signal)", v.playbackRate === 1 && v.muted === true);
  ok("skip: currentTime is NOT moved to duration (SSAP-safe: duration covers ad+clip)", v.currentTime === 5);
  t.sb.document.querySelector = (sel) => (sel === ".html5-video-player" ? player("playing-mode") : sel.startsWith("video") ? v : null);
  t.run();
  ok("skip: ad over → rate/mute restored", v.playbackRate === 1 && v.muted === false);
}

// ---------- 2) РЕГРЕСИЯ: изтекъл bypass + стар сесиен флаг + enforcement → НОВ bypass + reload ----------
// (преди: sessionStorage „1" без срок казваше „вече bypass-ваме" → нула reload, диалогът скрит от CSS, мъртъв плейър)
{
  const now = 20 * HOUR;
  const t = ytTab({
    now,
    storage: { enabled: true, ytBypassUntil: now - 1 * HOUR }, // изтекъл преди час
    // този таб е reload-вал за bypass преди 7ч; `tbab_yt_bypass: "1"` е голият флаг
    // на 5.0.0 (остава в отворен таб след ъпгрейд) — новият код трябва да го игнорира
    session: { tbab_yt_bypass_at: String(now - 7 * HOUR), tbab_yt_bypass: "1" },
    els: { "ytd-enforcement-message-view-model": enforcement },
  });
  t.load("youtube_skip.js");
  ok("stale session flag: bypass requested again", t.messages.some((m) => m.type === "ytBypass"));
  ok("stale session flag: page reloaded once bg confirmed", t.sb.__reloads === 1);
  ok("stale session flag: reload timestamp refreshed", Number(t.session.tbab_yt_bypass_at) === now);
}

// ---------- 3) loop guard: reload преди 10s → без втори reload, диалогът остава видим ----------
{
  const now = 20 * HOUR;
  const t = ytTab({
    now,
    storage: { enabled: true, ytBypassUntil: now + 5 * HOUR },
    session: { tbab_yt_bypass_at: String(now - 10 * 1000) },
    els: { "ytd-enforcement-message-view-model": enforcement, "tp-yt-iron-overlay-backdrop": [] },
  });
  t.load("youtube_skip.js");
  ok("loop guard: no bypass message within 90s of a reload", !t.messages.some((m) => m.type === "ytBypass"));
  ok("loop guard: no reload", t.sb.__reloads === 0);
  ok("loop guard: dialog left visible (bypass attr set, youtube.css un-gated)", t.attrs["data-tbab-yt-bypass"] === "1");
}

// ---------- 4) enforcement по време на активен bypass: една втора възможност, после стоп ----------
{
  const now = 20 * HOUR;
  const t = ytTab({
    now,
    storage: { enabled: true, ytBypassUntil: now + 5 * HOUR },
    session: { tbab_yt_bypass_at: String(now - 5 * 60 * 1000) },
    els: { "ytd-enforcement-message-view-model": enforcement, "tp-yt-iron-overlay-backdrop": [] },
  });
  t.load("youtube_skip.js");
  ok("active bypass, page not yet reloaded: one more bypass + reload", t.messages.length === 1 && t.sb.__reloads === 1);
  t.run(); t.run();
  ok("same page again: no further reloads (bypassReloaded)", t.messages.length === 1 && t.sb.__reloads === 1);
}

// ---------- 4b) РЕГРЕСИЯ (преглед): задържан enforcement възел по време на bypass — НЕ reload на всеки 90s ----------
// Симулира реалния цикъл: времето върви, всеки reload е НОВ документ (нов load на скрипта) със
// същите sessionStorage/storage, а service worker-ът подновява ytBypassUntil при всяко ytBypass.
{
  let now = 30 * HOUR;
  const storage = { enabled: true, ytBypassUntil: now + 5 * HOUR };
  const session = { tbab_yt_bypass_at: String(now - 7 * HOUR) };
  const els = { "ytd-enforcement-message-view-model": enforcement, "tp-yt-iron-overlay-backdrop": [] };
  let reloads = 0;
  for (let k = 0; k < 8; k++) {
    const t = ytTab({ now, storage, session, els, reply: () => { storage.ytBypassUntil = now + 6 * HOUR; return { ok: true }; } });
    t.load("youtube_skip.js");
    reloads += t.sb.__reloads;
    now += 91 * 1000; // над loop guard-а → без брояч това щеше да е още един reload
  }
  ok(`sticky enforcement node during bypass: bounded reloads (${reloads} ≤ 2 over 8 documents / 12 min)`, reloads <= 2 && reloads >= 1);
  // нов bypass прозорец (печатът е по-стар от 6ч) → броячът започва отначало
  now += 7 * HOUR; storage.ytBypassUntil = 0;
  const t = ytTab({ now, storage, session, els });
  t.load("youtube_skip.js");
  ok("new window after 6h: counter resets, bypass possible again", t.sb.__reloads === 1 && session.tbab_yt_bypass_n === "1");
}

// ---------- 5) грешка с Playback ID без диалог = enforcement (след като е СТАБИЛНА); „Video unavailable" не е ----------
{
  const now = 20 * HOUR;
  const t = ytTab({ now, storage: { enabled: true }, els: { ".ytp-error": { textContent: "An error occurred. Please try again later. (Playback ID: AbC123)" } } });
  t.load("youtube_skip.js");
  ok("Playback ID error just appeared → not yet (transient errors retry themselves)", t.messages.length === 0 && t.sb.__reloads === 0);
  t.sb.__now += 9000; t.run();
  ok("Playback ID error stable for 8s → bypass + reload", t.messages.some((m) => m.type === "ytBypass") && t.sb.__reloads === 1);
  const t2 = ytTab({ now, storage: { enabled: true }, els: { ".ytp-error": { textContent: "Video unavailable. This video has been removed by the uploader" } } });
  t2.load("youtube_skip.js");
  ok("deleted video error (no Playback ID) → untouched", t2.messages.length === 0 && t2.sb.__reloads === 0);
  const t3 = ytTab({ now, storage: { enabled: true, ytBypassUntil: now + HOUR }, session: { tbab_yt_bypass_at: String(now - HOUR) }, els: { ".ytp-error": { textContent: "(Playback ID: x)" } } });
  t3.load("youtube_skip.js"); t3.sb.__now += 9000; t3.run();
  ok("Playback ID error DURING bypass → genuine error, no reload", t3.messages.length === 0 && t3.sb.__reloads === 0);
}

// ---------- 6) bypass не може да се въоръжи → без reload, диалогът се показва ----------
{
  const now = 20 * HOUR;
  const t = ytTab({ now, storage: { enabled: true }, els: { "ytd-enforcement-message-view-model": enforcement, "tp-yt-iron-overlay-backdrop": [] }, reply: () => ({ ok: false }) });
  t.load("youtube_skip.js");
  ok("bg refused: no reload, dialog made visible", t.sb.__reloads === 0 && t.attrs["data-tbab-yt-bypass"] === "1");
}

// ---------- 7) loader: вече НЕ инжектира <script> (youtube_main се регистрира от SW) ----------
{
  const now = 20 * HOUR;
  const a = ytTab({ now, storage: { enabled: true } });
  a.load("youtube_loader.js");
  ok("loader: never injects a <script> into the page (no trace, no late start)", a.created.length === 0);
  ok("loader: nothing to hand over → no event", a.dispatched.length === 0);
  const b = ytTab({ now, storage: { enabled: true, liveConfig: { youtube: { adFields: ["adSurvey"] } } } });
  b.load("youtube_loader.js");
  ok("loader: live extras handed over as a JSON string on a DOM event (data, not code)",
    b.dispatched.length === 1 && b.dispatched[0].type === "tbab-yt-cfg" && JSON.parse(b.dispatched[0].detail).adFields[0] === "adSurvey");
}

// ---------- 8) stall watchdog: спинър без напредък → стъпаловидно възстановяване ----------
const stalledVideo = () => ({ muted: false, playbackRate: 1, currentTime: 0, duration: 600, paused: false, ended: false, readyState: 1 });
function tick(t, video, seconds) {
  for (let i = 0; i < seconds; i++) { t.sb.__now += 1000; t.run(); }
}
{
  // стъпка 1: 25s без напредък → reload БЕЗ флагове (без bypass, без съобщение)
  const now = 40 * HOUR;
  const v = stalledVideo();
  const t = ytTab({ now, storage: { enabled: true }, els: { ".html5-video-player": player("buffering-mode"), "video.html5-main-video, video": v } });
  t.load("youtube_skip.js");
  tick(t, v, 20);
  ok("stall: under 25s → nothing yet", t.sb.__reloads === 0);
  tick(t, v, 7);
  ok("stall stage 1: reload without flags, no bypass", t.sb.__reloads === 1 && t.session.tbab_yt_noflags === "1" && t.messages.length === 0);
}
{
  // стъпка 2: вече без флагове и пак спинър → bypass (чист клиент) през ограничения път
  const now = 40 * HOUR;
  const v = stalledVideo();
  const t = ytTab({ now, storage: { enabled: true }, session: { tbab_yt_noflags: "1", tbab_yt_stage1_at: String(now - 60 * 1000) }, els: { ".html5-video-player": player("buffering-mode"), "video.html5-main-video, video": v } });
  t.load("youtube_skip.js");
  tick(t, v, 27);
  ok("stall stage 2 (within 3 min of stage 1): bypass requested + reload", t.messages.some((m) => m.type === "ytBypass") && t.sb.__reloads === 1 && t.session.tbab_yt_bypass_n === "1");
}
{
  // stage 1 was long ago → a new incident starts at stage 1 again (a reload, NOT a 6 h bypass)
  const now = 40 * HOUR;
  const v = stalledVideo();
  const t = ytTab({ now, storage: { enabled: true }, session: { tbab_yt_noflags: "1", tbab_yt_stage1_at: String(now - 20 * 60 * 1000) }, els: { ".html5-video-player": player("buffering-mode"), "video.html5-main-video, video": v } });
  t.load("youtube_skip.js");
  tick(t, v, 27);
  ok("old stage 1 (20 min ago): new incident → stage 1 reload, no bypass", t.sb.__reloads === 1 && t.messages.length === 0);
}
{
  // live stream: a waiting live edge is not our stall
  const now = 40 * HOUR;
  const v = Object.assign(stalledVideo(), { duration: Infinity });
  const t = ytTab({ now, storage: { enabled: true }, els: { ".html5-video-player": player("buffering-mode"), "video.html5-main-video, video": v } });
  t.load("youtube_skip.js");
  tick(t, v, 40);
  ok("live stream (duration Infinity): never reloaded", t.sb.__reloads === 0 && t.messages.length === 0);
}
{
  // mid-play buffering: the clip already advanced on this page → not ours
  const now = 40 * HOUR;
  const v = stalledVideo();
  const t = ytTab({ now, storage: { enabled: true }, els: { ".html5-video-player": player("playing-mode"), "video.html5-main-video, video": v } });
  t.load("youtube_skip.js");
  v.currentTime = 1; tick(t, v, 1); v.currentTime = 2; tick(t, v, 1); v.currentTime = 3; tick(t, v, 1);
  tick(t, v, 40); // now frozen for 40 s (slow network)
  ok("mid-play buffering after the clip advanced: never reloaded", t.sb.__reloads === 0 && t.messages.length === 0);
}
{
  // не е stall: напредва / на пауза / има бъдещи данни / bypass активен
  const now = 40 * HOUR;
  const mk = (patch, extra = {}) => {
    const v = Object.assign(stalledVideo(), patch);
    const t = ytTab({ now, storage: Object.assign({ enabled: true }, extra), els: { ".html5-video-player": player("buffering-mode"), "video.html5-main-video, video": v } });
    t.load("youtube_skip.js");
    return { t, v };
  };
  const a = mk({}); tick(a.t, a.v, 10); a.v.currentTime = 3; tick(a.t, a.v, 20);
  ok("no stall: progress resets the clock", a.t.sb.__reloads === 0);
  const b = mk({ paused: true }); tick(b.t, b.v, 40);
  ok("no stall: paused (nothing asked to play)", b.t.sb.__reloads === 0);
  const c = mk({ readyState: 4 }); tick(c.t, c.v, 40);
  ok("no stall: HAVE_ENOUGH_DATA even if currentTime is frozen", c.t.sb.__reloads === 0);
  const d = mk({}, { ytBypassUntil: now + HOUR }); tick(d.t, d.v, 40);
  ok("no stall action during bypass (network's problem, not ours)", d.t.sb.__reloads === 0 && d.t.messages.length === 0);
}
{
  // loader: след stall стъпка 1 youtube_main получава disableRequestFlags
  const now = 40 * HOUR;
  const t = ytTab({ now, storage: { enabled: true }, session: { tbab_yt_noflags: "1" } });
  t.load("youtube_loader.js");
  ok("loader: noflags session → disableRequestFlags:true handed over", t.dispatched.length === 1 && JSON.parse(t.dispatched[0].detail).disableRequestFlags === true);
}

// ---------- youtube_main (MAIN world): текст преди парсване, „родни" куки, без следи ----------
function ytPage(responses, before = {}) {
  const sb = { Proxy, Reflect, WeakMap, WeakSet, Object, Array, JSON, RegExp, String, Promise, Function };
  sb.window = sb;
  sb.console = { warn() {} };
  const winListeners = {};
  sb.addEventListener = (t, f) => { (winListeners[t] ||= []).push(f); };
  sb.document = { getElementById: () => null, addEventListener() {} };
  sb.__timers = [];
  sb.setTimeout = function setTimeout(fn, ms) { sb.__timers.push(ms); return 1; };
  class Resp {
    constructor(body, init = {}) { this.body = typeof body === "string" ? body : JSON.stringify(body); this.status = init.status || 200; this.statusText = init.statusText || "OK"; this.headers = init.headers || {}; this.ok = this.status >= 200 && this.status < 300; this.url = ""; this.type = "basic"; this.redirected = false; }
    clone() { const r = new Resp(this.body, this); r.ok = this.ok; r.url = this.url; return r; }
    text() { return Promise.resolve(this.body); }
    json() { return Promise.resolve(JSON.parse(this.body)); }
  }
  sb.Response = Resp;
  sb.Event = class { constructor(type) { this.type = type; } };
  const calls = [];
  sb.fetch = function fetch(input, init) {
    const body = init && init.body ? JSON.parse(init.body) : null;
    calls.push({ url: String(input), flagged: !!body?.playbackContext?.contentPlaybackContext?.isInlinePlaybackNoAd });
    const next = responses.shift();
    const r = next instanceof Resp ? next : new Resp(next);
    r.url = String(input);
    return Promise.resolve(r);
  };
  // XHR with a native-style responseText getter on the prototype
  const sent = [];
  class XHR {
    open(m, u) { this._m = m; this._u = u; }
    send(b) { sent.push(this._u); this._readyState = 4; }
    dispatchEvent() {}
  }
  Object.defineProperty(XHR.prototype, "responseText", { configurable: true, get() { return this._text; } });
  Object.defineProperty(XHR.prototype, "response", { configurable: true, get() { return this._text; } });
  Object.defineProperty(XHR.prototype, "readyState", { configurable: true, get() { return this._readyState || 0; } });
  sb.XMLHttpRequest = XHR;
  class Node_ { appendChild(n) { return n; } insertBefore(n) { return n; } }
  class Element_ extends Node_ { append() {} prepend() {} }
  sb.Node = Node_; sb.Element = Element_;
  Object.assign(before, { fetch: sb.fetch, open: XHR.prototype.open, send: XHR.prototype.send, setTimeout: sb.setTimeout,
    appendChild: Node_.prototype.appendChild, responseText: Object.getOwnPropertyDescriptor(XHR.prototype, "responseText").get });
  runInNewContext(src("youtube_main.js"), sb, { filename: "youtube_main.js" });
  const call = (url = "https://www.youtube.com/youtubei/v1/player?prettyPrint=false") => sb.fetch(url, { method: "POST", body: JSON.stringify({ videoId: "x", context: {} }) });
  const config = (cfg) => (winListeners["tbab-yt-cfg"] || []).forEach((f) => f({ detail: JSON.stringify(cfg) }));
  return { sb, calls, call, config, sent, XHR, Resp };
}
const OK = { playabilityStatus: { status: "OK" }, streamingData: {}, adPlacements: [{ a: 1 }], adSlots: [{ s: 1 }], playerAds: [{ p: 1 }] };
const BAD = { playabilityStatus: { status: "UNPLAYABLE", reason: "Video unavailable" } };
const isNative = (f) => Function.prototype.toString.call(f).includes("[native code]");

{
  const p = ytPage([OK]);
  const res = await p.call();
  const text = await res.text();
  const j = JSON.parse(text);
  ok("main: player response rewritten as TEXT before parsing — no adPlacements/adSlots/playerAds, \"no_ads\" instead",
    !/"adPlacements"|"adSlots"|"playerAds"/.test(text) && "no_ads" in j && j.playabilityStatus.status === "OK" && "streamingData" in j);
  ok("main: no request flag by default (isInlinePlaybackNoAd on a watch page is a server-side signal)", p.calls.length === 1 && p.calls[0].flagged === false);
  ok("main: rewritten response keeps url/status (it still looks like the network's)", res.url.includes("/youtubei/v1/player") && res.status === 200);
}
{
  // the harness's "natives" are plain functions; a hook must stringify EXACTLY like what it wraps
  const before = {};
  const p = ytPage([], before);
  const same = (now, orig) => Function.prototype.toString.call(now) === Function.prototype.toString.call(orig) && now !== orig;
  ok("main: every hook stringifies exactly like the function it wraps (name included) — fetch, XHR open/send/responseText, setTimeout, appendChild",
    same(p.sb.fetch, before.fetch) && same(p.XHR.prototype.open, before.open) && same(p.XHR.prototype.send, before.send) &&
    same(p.sb.setTimeout, before.setTimeout) && same(p.sb.Node.prototype.appendChild, before.appendChild) &&
    same(Object.getOwnPropertyDescriptor(p.XHR.prototype, "responseText").get, before.responseText));
  ok("main: no global JSON.parse / Response.json / Object.assign patch any more", p.sb.JSON.parse === JSON.parse && !("__patched" in p.sb.Response.prototype));
}
{
  const feed = { contents: { richGridRenderer: { contents: [{ richItemRenderer: { content: { adSlotRenderer: { x: 1 } } } }, { richItemRenderer: { content: { videoRenderer: { videoId: "v" } } } }] } } };
  const p = ytPage([feed, { contents: { a: 1 } }]);
  const j = JSON.parse(await (await p.call("https://www.youtube.com/youtubei/v1/browse?prettyPrint=false")).text());
  ok("main: feed ad renderers removed from the browse response, the real video stays", j.contents.richGridRenderer.contents.length === 1 && !!j.contents.richGridRenderer.contents[0].richItemRenderer.content.videoRenderer);
  const r2 = await p.call("https://www.youtube.com/youtubei/v1/browse");
  ok("main: a feed without ads is passed through untouched (no re-serialising)", r2.body === JSON.stringify({ contents: { a: 1 } }));
}
{
  const p = ytPage([]);
  const x = new p.sb.XMLHttpRequest();
  const atr = "https://www.youtube.com/api/stats/atr?ns=yt&el=detailpage&cpn=x&ver=2&rt=1.5&cl=1&volume=100&cbr=Chrome&fexp=v1%" + "2C".repeat(160) + "&a=1&muted=0&docid=abc";
  x.open("POST", atr);
  x.send("{}");
  ok("main: the ATR ad-state ping is answered locally and never sent", p.sent.length === 0 && x.status === 200 && x.readyState === 4);
  const y = new p.sb.XMLHttpRequest();
  y.open("POST", "https://www.youtube.com/api/stats/watchtime?docid=abc");
  y.send("");
  ok("main: other stats pings go out untouched", p.sent.length === 1);
}
{
  const p = ytPage([]);
  const x = new p.sb.XMLHttpRequest();
  x.open("GET", "https://www.youtube.com/watch?v=abc&pbj=1");
  x.send();
  x._text = JSON.stringify([{ playerResponse: OK }]);
  ok("main: XHR watch response → \"no_ads\" in responseText (SPA navigation path)", !/"adPlacements"/.test(x.responseText) && /"no_ads"/.test(x.responseText));
}
{
  const p = ytPage([]);
  const bound = function () {}.bind(null); // bound functions stringify as [native code]
  p.sb.setTimeout(bound, 17000);
  p.sb.setTimeout(() => 1, 17000);
  p.sb.setTimeout(bound, 5000);
  ok("main: the 17 s fake-buffering timer (bound native fn) runs in 17 ms; other timers untouched", p.sb.__timers.join() === "17,17000,5000");
}
{
  const p = ytPage([]);
  const pristineFetch = function fetch() {};
  const iframeWin = { fetch: pristineFetch, setTimeout: function setTimeout() {}, Response: p.Resp, Event: p.sb.Event, XMLHttpRequest: class {}, Node: class {}, Element: class {}, addEventListener() {} };
  const iframe = { nodeType: 1, tagName: "IFRAME", contentWindow: iframeWin };
  new p.sb.Node().appendChild(iframe);
  ok("main: a fresh iframe's pristine fetch is hooked too (YouTube's hook bypass) and still stringifies like its native",
    iframeWin.fetch !== pristineFetch && Function.prototype.toString.call(iframeWin.fetch) === Function.prototype.toString.call(pristineFetch));
}
{
  // live channel can still turn a request flag on — with the old plain-retry safety net
  const p = ytPage([BAD, OK, OK]);
  p.config({ requestFlags: ["playbackContext.contentPlaybackContext.isInlinePlaybackNoAd"] });
  const res = await p.call();
  ok("main: opt-in flag, flagged UNPLAYABLE → one plain retry, playable answer handed over", p.calls.length === 2 && p.calls[0].flagged && !p.calls[1].flagged && JSON.parse(await res.text()).playabilityStatus.status === "OK");
  await p.call();
  ok("main: flag proven broken → next request goes plain", p.calls.length === 3 && !p.calls[2].flagged);
}
{
  const p = ytPage([OK]);
  p.config({ requestFlags: ["playbackContext.contentPlaybackContext.isInlinePlaybackNoAd"], disableRequestFlags: true });
  await p.call();
  ok("main: kill switch (or stall stage 1) → no flag", p.calls.length === 1 && !p.calls[0].flagged);
}

done();
