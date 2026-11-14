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
  ok("loop guard: dialog left visible (bypass attr set, youtube_ads.css un-gated)", t.attrs["data-tbab-yt-bypass"] === "1");
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
// Скриптът се зарежда с името, което има в браузъра (chrome-extension://…), за да се види дали
// кадрите му изтичат в e.stack. Promise е от отделен realm: куката на .then не пипа самия тест.
const MAIN_URL = "chrome-extension://abcdefghijklmnop/youtube_main.js";
function ytPage(responses, before = {}, { host = "www.youtube.com", path = "/watch", search = "?v=vid1" } = {}) {
  const RealmPromise = runInNewContext("Promise");
  const sb = { Proxy, Reflect, WeakMap, WeakSet, Object, Array, JSON, RegExp, String, Number, Promise: RealmPromise, Function, Error, TypeError, URLSearchParams };
  sb.window = sb;
  sb.console = { warn() {} };
  sb.__now = 1_800_000_000_000;
  sb.Date = { now: () => sb.__now };
  sb.location = { hostname: host, pathname: path, search };
  sb.navigator = { onLine: true };
  const winListeners = {};
  sb.addEventListener = (t, f) => { (winListeners[t] ||= []).push(f); };
  const ids = {};
  sb.document = { getElementById: (id) => ids[id] || null, addEventListener() {}, visibilityState: "visible" };
  sb.__timers = [];
  sb.__intervals = [];
  sb.setTimeout = function setTimeout(fn, ms) { sb.__timers.push(ms); return 1; };
  sb.setInterval = function setInterval(fn, ms) { sb.__intervals.push(fn); return 2; };
  const mos = [];
  sb.MutationObserver = class { constructor(cb) { mos.push(cb); } observe() {} };
  class Resp {
    constructor(body, init = {}) { this.body = typeof body === "string" ? body : JSON.stringify(body); this.status = init.status || 200; this.statusText = init.statusText || "OK"; this.headers = init.headers || {}; this.ok = this.status >= 200 && this.status < 300; this.url = ""; this.type = "basic"; this.redirected = false; }
    clone() { const r = new Resp(this.body, this); r.ok = this.ok; r.url = this.url; return r; }
    text() { return Promise.resolve(this.body); }
    json() { return Promise.resolve(JSON.parse(this.body)); }
  }
  sb.Response = Resp;
  class Req {
    constructor(input, init = {}) { this.url = input instanceof Req ? input.url : String(input); this.method = init.method || (input instanceof Req ? input.method : "GET"); this.body = init.body !== undefined ? init.body : input instanceof Req ? input.body : undefined; }
    clone() { return new Req(this); }
    text() { return Promise.resolve(this.body || ""); }
  }
  sb.Request = Req;
  sb.Event = class { constructor(type) { this.type = type; } };
  const calls = [];
  sb.fetch = function fetch(input, init) {
    const raw = init && init.body ? init.body : input instanceof Req ? input.body : null;
    const body = raw ? JSON.parse(raw) : null;
    calls.push({ url: String(input instanceof Req ? input.url : input), body, flagged: !!body?.playbackContext?.contentPlaybackContext?.isInlinePlaybackNoAd });
    const next = responses.shift();
    const r = next instanceof Resp ? next : new Resp(next);
    r.url = String(input);
    return Promise.resolve(r);
  };
  // XHR with a native-style responseText getter on the prototype
  const sent = [];
  class XHR {
    open(m, u) { this._m = m; this._u = u; }
    send(b) { sent.push({ url: this._u, body: b }); this._readyState = 4; }
    dispatchEvent() {}
  }
  Object.defineProperty(XHR.prototype, "responseText", { configurable: true, get() { return this._text; } });
  Object.defineProperty(XHR.prototype, "response", { configurable: true, get() { return this._text; } });
  Object.defineProperty(XHR.prototype, "readyState", { configurable: true, get() { return this._readyState || 0; } });
  sb.XMLHttpRequest = XHR;
  class Node_ { appendChild(n) { return n; } insertBefore(n) { return n; } }
  class Element_ extends Node_ { append() {} prepend() {} }
  class IFrame_ extends Element_ { get contentWindow() { return this._win; } get contentDocument() { return this._win ? { defaultView: this._win } : null; } }
  sb.Node = Node_; sb.Element = Element_; sb.HTMLIFrameElement = IFrame_;
  Object.assign(before, { fetch: sb.fetch, open: XHR.prototype.open, send: XHR.prototype.send, setTimeout: sb.setTimeout,
    appendChild: Node_.prototype.appendChild, then: RealmPromise.prototype.then,
    responseText: Object.getOwnPropertyDescriptor(XHR.prototype, "responseText").get,
    contentWindow: Object.getOwnPropertyDescriptor(IFrame_.prototype, "contentWindow").get });
  runInNewContext(src("youtube_main.js"), sb, { filename: MAIN_URL });
  const PLAYER = "https://www.youtube.com/youtubei/v1/player?prettyPrint=false";
  const playerBody = () => JSON.stringify({ videoId: "vid1", context: { client: { clientName: "WEB", clientScreen: "WATCH" } }, playbackContext: { contentPlaybackContext: { referer: "https://www.youtube.com/", lactMilliseconds: "-1" } }, attestationRequest: { omitBotguardData: true } });
  const call = (url = PLAYER, body = JSON.stringify({ videoId: "x", context: {} })) => sb.fetch(url, { method: "POST", body });
  const config = (cfg) => (winListeners["tbab-yt-cfg"] || []).forEach((f) => f({ detail: JSON.stringify(cfg) }));
  const tick = (n = 1, ms = 500) => { for (let i = 0; i < n; i++) { sb.__now += ms; sb.__intervals.forEach((f) => f()); } };
  return { sb, ids, calls, call, config, sent, XHR, Resp, Req, IFrame_, mos, tick, PLAYER, playerBody, RealmPromise };
}
const OK = { playabilityStatus: { status: "OK" }, streamingData: {}, adPlacements: [{ a: 1 }], adSlots: [{ s: 1 }], playerAds: [{ p: 1 }] };
const BAD = { playabilityStatus: { status: "UNPLAYABLE", reason: "Video unavailable" } };

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
  ok("main: every hook stringifies exactly like the function it wraps (name included) — fetch, XHR open/send/responseText, setTimeout, contentWindow, Promise.then",
    same(p.sb.fetch, before.fetch) && same(p.XHR.prototype.open, before.open) && same(p.XHR.prototype.send, before.send) &&
    same(p.sb.setTimeout, before.setTimeout) && same(Object.getOwnPropertyDescriptor(p.XHR.prototype, "responseText").get, before.responseText) &&
    same(Object.getOwnPropertyDescriptor(p.IFrame_.prototype, "contentWindow").get, before.contentWindow) &&
    same(p.RealmPromise.prototype.then, before.then));
  ok("main: appendChild & co. are NOT wrapped (every element YouTube inserts would run under our frame)",
    p.sb.Node.prototype.appendChild === before.appendChild);
  ok("main: no global JSON.parse / Response.json / Object.assign patch any more", p.sb.JSON.parse === JSON.parse && !("__patched" in p.sb.Response.prototype));
}
{
  // a hook in the stack of an error is a tell: "at Object.apply (chrome-extension://…/youtube_main.js)"
  const p = ytPage([]);
  let stack = "";
  try { Function.prototype.toString.call({}); } catch (e) { stack = String(e.stack); }
  ok(`main: an error thrown through a hook has no frame of ours (${stack.split("\n").length} lines, none chrome-extension://)`,
    /requires that 'this' be a Function/.test(stack) && !/chrome-extension:\/\//.test(stack));
  let xs = "";
  const x = new p.sb.XMLHttpRequest();
  try { p.XHR.prototype.open.call(null, "GET", "/"); } catch (e) { xs = String(e.stack); }
  ok("main: …the same for a native that throws inside XHR open", xs === "" || !/chrome-extension:\/\//.test(xs));
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
  const iframeWin = { fetch: pristineFetch, setTimeout: function setTimeout() {}, Response: p.Resp, Event: p.sb.Event, XMLHttpRequest: class {}, addEventListener() {} };
  const iframe = new p.IFrame_(); iframe._win = iframeWin;
  const got = iframe.contentWindow; // however the frame got into the page
  ok("main: a fresh iframe's pristine fetch is hooked the moment the page reaches its window — and still stringifies like its native",
    got === iframeWin && iframeWin.fetch !== pristineFetch && Function.prototype.toString.call(iframeWin.fetch) === Function.prototype.toString.call(pristineFetch));
  const w2 = { fetch: function fetch() {}, Response: p.Resp, Event: p.sb.Event, addEventListener() {} };
  const f2 = new p.IFrame_(); f2._win = w2; f2.nodeType = 1; f2.tagName = "IFRAME";
  const orig2 = w2.fetch;
  p.mos[0]([{ addedNodes: [f2] }]);
  ok("main: …and a frame reached by index (window[0]) is armed when it is inserted", w2.fetch !== orig2);
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

// ---------- 5.7: какво прави YouTube с флагнат клиент — и отговорът (www.youtube.com) ----------
const REFUSED = {
  videoDetails: { videoId: "vid1", lengthSeconds: "212" },
  playerConfig: { playbackStartConfig: { startSeconds: 0 } },
  playabilityStatus: { status: "UNPLAYABLE", reason: "Video unavailable", errorScreen: { playerErrorMessageRenderer: { subreason: { runs: [
    { text: "Ad blockers violate YouTube's Terms of Service. " },
    { text: "Learn more", navigationEndpoint: { commandMetadata: { webCommandMetadata: { url: "https://support.google.com/youtube/answer/3037019", webPageType: "WEB_PAGE_TYPE_UNKNOWN" } } } },
  ] } } } },
};
const PLAYING = { videoDetails: { videoId: "vid1", lengthSeconds: "212" }, playabilityStatus: { status: "OK" } };
function fakePlayer(p, state) {
  const mp = {
    loads: [], seeks: [],
    getPlayerResponse: () => state.resp,
    getStatsForNerds: () => state.stats || { debug_info: "s:8 t:1.00 b:0.000-212.000", resolution: "1920x1080", buffer_health_seconds: "12.00 s" },
    getProgressState: () => state.prog || { current: 1, duration: 212 },
    getPlayerStateObject: () => ({ isBuffering: !!state.buffering }),
    loadVideoById(id, start) { this.loads.push([id, start]); },
    seekTo(t) { this.seeks.push(t); },
  };
  p.ids.movie_player = mp;
  return mp;
}
const shapeOf = (c) => ({ screen: c.body?.context?.client?.clientScreen, params: c.body?.params, referer: c.body?.playbackContext?.contentPlaybackContext?.referer, lact: c.body?.playbackContext?.contentPlaybackContext?.lactMilliseconds });
{
  const p = ytPage([OK, OK, OK, OK, OK, OK]);
  const st = { resp: PLAYING };
  const mp = fakePlayer(p, st);
  await p.call(p.PLAYER, p.playerBody());
  p.tick(4);
  ok("shapes: until a refusal, /player goes out exactly as YouTube built it", JSON.stringify(p.calls[0].body) === p.playerBody() && mp.loads.length === 0);
  st.resp = REFUSED; p.tick();
  ok("shapes: refusal (UNPLAYABLE → the ad-blocker help page) → the clip is retried in place", mp.loads.length === 1 && mp.loads[0][0] === "vid1");
  await p.call(p.PLAYER, p.playerBody());
  const s1 = shapeOf(p.calls[1]);
  ok(`shapes: the retry carries params 8AUB, a fresh lactMilliseconds and the #reloadxhr referer (${JSON.stringify(s1)})`,
    s1.params === "8AUB" && s1.referer === "https://www.youtube.com/#reloadxhr" && s1.lact === String(p.sb.__now) && s1.screen === "WATCH");
  p.tick(2);
  ok("shapes: the player still holds the old answer → no second retry yet (it would burn a shape)", mp.loads.length === 1);
  st.resp = Object.assign({}, REFUSED); p.tick();
  ok("shapes: refused again → the next shape", mp.loads.length === 2);
  await p.call(p.PLAYER, p.playerBody());
  const s2 = shapeOf(p.calls[2]);
  ok("shapes: …\"inline\" = only the referer", s2.params === undefined && s2.referer.endsWith("#reloadxhr") && s2.lact === "-1");
  for (let k = 0; k < 6; k++) { st.resp = Object.assign({}, REFUSED); p.tick(20); }
  ok(`shapes: bounded — every shape once, then as sent, then stop (${mp.loads.length} retries)`, mp.loads.length === 4);
  // XHR path and a body inside a Request carry the same shape
  const x = new p.sb.XMLHttpRequest();
  x.open("POST", p.PLAYER); x.send(p.playerBody());
  const r = await p.sb.fetch(new p.Req(p.PLAYER, { method: "POST", body: p.playerBody() }));
  ok("shapes: the XHR body and a Request body are shaped too", typeof p.sent[0].body === "string" && typeof r.body === "string");
}
{
  const p = ytPage([OK, OK]);
  const st = { resp: PLAYING, buffering: true, stats: { debug_info: "s:5 t:0.00 b:0.000-0.000", resolution: "0x0", buffer_health_seconds: "0.00 s" } };
  const mp = fakePlayer(p, st);
  p.tick(10); // 5 s
  ok("stuck: under 10 s at 0x0 with an empty buffer → nothing", mp.loads.length === 0);
  p.tick(22); // 16 s
  ok("stuck: 10 s at 0x0 with an empty buffer → retried in place with the first shape", mp.loads.length === 1);
  await p.call(p.PLAYER, p.playerBody());
  ok("stuck: …clientScreen CHANNEL (WEB client only)", shapeOf(p.calls[0]).screen === "CHANNEL");
  p.sb.document.visibilityState = "hidden"; st.resp = Object.assign({}, PLAYING); p.tick(60);
  ok("stuck: a hidden tab is not a stuck player", mp.loads.length === 1);
}
{
  const p = ytPage([]);
  const st = { resp: PLAYING, stats: { debug_info: "SSAP, AD 1/1 s:8", resolution: "1280x720" }, prog: { current: 2, duration: 15 } };
  const mp = fakePlayer(p, st);
  p.tick();
  ok("SSAP: an ad stitched into the stream is jumped to its end through the player API", mp.seeks.join() === "15");
  p.tick();
  ok("SSAP: …once a second at most", mp.seeks.length === 1);
  st.prog = { current: 2, duration: 212 }; p.tick(4);
  ok("SSAP: never when the \"ad\" duration is the clip's own (that jump would end the clip)", mp.seeks.length === 1);
  st.prog = { current: 14.5, duration: 15 }; p.tick(4);
  ok("SSAP: not in the last second (it is ending anyway)", mp.seeks.length === 1);
  const q = ytPage([]); const st2 = { resp: PLAYING, stats: st.stats, prog: { current: 2, duration: 15 } }; const mq = fakePlayer(q, st2);
  q.config({ noSsapJump: true }); q.tick(4);
  ok("SSAP: live kill switch youtube.noSsapJump (data) → no jump", mq.seeks.length === 0);
}
{
  const p = ytPage([OK, OK]);
  const st = { resp: REFUSED };
  const mp = fakePlayer(p, st);
  p.config({ noShapes: true }); p.tick(4);
  await p.call(p.PLAYER, p.playerBody());
  ok("shapes: live kill switch youtube.noShapes (data) → no retry, body as built", mp.loads.length === 0 && JSON.stringify(p.calls[0].body) === p.playerBody());
}
{
  const p = ytPage([OK]);
  p.sb.ytInitialData = { topbar: { desktopTopbarRenderer: { logo: { topbarLogoRenderer: { iconImage: { iconType: "YOUTUBE_PREMIUM_LOGO" } } } } } };
  const st = { resp: REFUSED, stats: { debug_info: "SSAP, AD" }, prog: { current: 1, duration: 15 } };
  const mp = fakePlayer(p, st);
  p.tick(4);
  ok("Premium: nothing of this runs (no jump, no retry)", mp.loads.length === 0 && mp.seeks.length === 0);
}
{
  const p = ytPage([]);
  const NEEDLE = "onAbnormality" + "Detected";
  const hits = [];
  const abn = new Function("hits", `return function () { hits.push("abn"); this.api && this.api.${NEEDLE}(); }`)(hits);
  const plain = function () { hits.push("plain"); };
  await new Promise((resolve) => {
    p.RealmPromise.resolve(1).then(abn).then(plain).then(resolve);
  });
  ok(`abnormality: the callback that wires "${NEEDLE}" never runs; the next one does (${hits.join()})`, hits.join() === "plain");
}
{
  const p = ytPage([], {}, { host: "music.youtube.com" });
  const st = { resp: REFUSED, stats: { debug_info: "SSAP, AD" }, prog: { current: 1, duration: 15 } };
  const mp = fakePlayer(p, st);
  p.tick(4);
  ok("only www.youtube.com: elsewhere no player guard and no Promise hook (as the uBO quick fixes)", p.sb.__intervals.length === 0 && mp.loads.length === 0 && mp.seeks.length === 0);
}

done();
