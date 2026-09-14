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
  return { sb, attrs, created, messages, session, load, run, change };
}
const player = (...classes) => ({ classList: { contains: (c) => classes.includes(c) } });
const video = () => ({ muted: false, playbackRate: 1, currentTime: 5, duration: 600 });
const enforcement = { textContent: "Ad blockers violate YouTube's Terms of Service" };

// ---------- 1) реклама без bypass: ускорение + mute, НИКАКЪВ seek към края ----------
{
  const v = video();
  const t = ytTab({ storage: { enabled: true }, els: { ".html5-video-player": player("ad-showing"), "video.html5-main-video, video": v } });
  t.load("youtube_skip.js");
  ok("skip: ad → rate 16 + muted", v.playbackRate === 16 && v.muted === true);
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

// ---------- 7) loader: инжектира освен при активен bg bypass / току-що reload ----------
{
  const now = 20 * HOUR;
  const a = ytTab({ now, storage: { enabled: true }, session: { tbab_yt_bypass_at: String(now - 7 * HOUR) } });
  a.load("youtube_loader.js");
  ok("loader: old reload stamp + no bg bypass → injects youtube_main", a.created.some((n) => n.tag === "script"));
  const b = ytTab({ now, storage: { enabled: true }, session: { tbab_yt_bypass_at: String(now - 10 * 1000) } });
  b.load("youtube_loader.js");
  ok("loader: just reloaded for a bypass → no injection", !b.created.some((n) => n.tag === "script"));
  const c = ytTab({ now, storage: { enabled: true, ytBypassUntil: now + HOUR } });
  c.load("youtube_loader.js");
  ok("loader: bg bypass active → no injection", !c.created.some((n) => n.tag === "script"));
}

// ---------- youtube_main (MAIN world): флаг + резервен път -------------------------
function ytPage(responses) {
  const sb = {};
  sb.window = sb;
  sb.console = { warn() {} };
  sb.document = { getElementById: () => null, addEventListener() {} };
  const calls = [];
  class Resp {
    constructor(payload) { this.payload = payload; this.ok = true; }
    clone() { return new Resp(this.payload); }
    json() { return Promise.resolve(JSON.parse(JSON.stringify(this.payload))); }
    text() { return Promise.resolve(JSON.stringify(this.payload)); }
  }
  sb.Response = Resp;
  sb.Request = class { constructor(u, i) { this.url = u; this.body = i && i.body; } clone() { return this; } text() { return Promise.resolve(this.body); } };
  sb.fetch = function (input, init) {
    const body = init && init.body ? JSON.parse(init.body) : null;
    calls.push({ url: String(input), flagged: !!body?.playbackContext?.contentPlaybackContext?.isInlinePlaybackNoAd });
    const next = responses.shift();
    return Promise.resolve(next instanceof Resp ? next : new Resp(next));
  };
  runInNewContext(src("youtube_main.js"), sb, { filename: "youtube_main.js" });
  const call = () => sb.fetch("https://www.youtube.com/youtubei/v1/player?prettyPrint=false", { method: "POST", body: JSON.stringify({ videoId: "x", context: {} }) });
  return { sb, calls, call };
}
const OK = { playabilityStatus: { status: "OK" }, streamingData: {}, adPlacements: [{ a: 1 }] };
const BAD = { playabilityStatus: { status: "UNPLAYABLE", reason: "Video unavailable" } };

{
  const p = ytPage([OK, OK]);
  const res = await p.call();
  ok("main: flagged request, playable → single call, flag present", p.calls.length === 1 && p.calls[0].flagged === true);
  const j = await res.json();
  ok("main: ad fields pruned on the returned response", Array.isArray(j.adPlacements) && j.adPlacements.length === 0);
}
{
  const p = ytPage([BAD, OK, OK]);
  const res = await p.call();
  ok("main: flagged UNPLAYABLE → one plain retry (no flag)", p.calls.length === 2 && p.calls[0].flagged && !p.calls[1].flagged);
  const j = await res.json();
  ok("main: playable plain response handed to the player", j.playabilityStatus.status === "OK");
  await p.call();
  ok("main: flag proven broken → next request goes plain, no retry", p.calls.length === 3 && !p.calls[2].flagged);
}
{
  const p = ytPage([BAD, BAD, OK]);
  const res = await p.call();
  const j = await res.json();
  ok("main: unavailable either way → original response, flags kept", p.calls.length === 2 && j.playabilityStatus.status === "UNPLAYABLE");
  await p.call();
  ok("main: flags still sent afterwards", p.calls[2].flagged === true);
}
{
  // флагнатото тяло е отхвърлено направо с 4xx → една plain заявка; тя е OK → флагът пада
  const q = [];
  const p = ytPage(q);
  const rejected = new p.sb.Response({ error: "bad request" });
  rejected.ok = false;
  q.push(rejected, OK, OK);
  const res = await p.call();
  ok("main: flagged body rejected (4xx) → plain retry returned, flag dropped", p.calls.length === 2 && !p.calls[1].flagged && res.ok === true);
  await p.call();
  ok("main: afterwards plain only", p.calls.length === 3 && !p.calls[2].flagged);
}

done();
