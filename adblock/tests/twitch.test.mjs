// 5.7 — Twitch: рекламите са вшити в HLS потока (сървърна вставка), плейърът тегли плейлистите в
// Web Worker. twitch_main.js обвива Worker-а на плейъра (само IVS) с нашия код отпред; в worker-а
// реклама в media плейлистата → същото качество от друг тип плейър (embed/popout/autoplay) без
// реклама, иначе рекламните сегменти се махат. Тестът пуска ИСТИНСКИЯ генериран blob в отделен
// контекст срещу фалшив Twitch. Плейлистите са синтетични, по формата на живите от 2026-10-25
// (без истински адреси, токени и IP-та).
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { runInNewContext } from "node:vm";
import { ROOT, ok, done, loadBackground } from "./_harness.mjs";
import { makeChrome } from "./_chrome.mjs";

const SRC = readFileSync(join(ROOT, "twitch_main.js"), "utf8");
const IVS_URL = "https://assets.twitch.tv/assets/amazon-ivs-wasmworker.min-abc123.js";
// Twitch's public web id, read from the source (never spelled out twice: a scanner reads it as a key)
const CID = (/cid: "([a-z0-9]{30})"/.exec(SRC) || [])[1];

// ---------- the page: Worker is wrapped, only for the player's worker ----------
function page() {
  const blobs = new Map();
  let n = 0;
  class Blob_ { constructor(parts, o) { this.text = parts.join(""); this.type = o && o.type; } }
  const made = [];
  class Worker_ { constructor(url, opts) { this.url = url; this.opts = opts; made.push(this); } }
  class XHR { open(m, u, a) { this.u = u; this.sync = a === false; } send() { const b = blobs.get(this.u); this.status = b ? 200 : 404; this.responseText = b ? b.text : ""; } }
  const sb = {
    Proxy, Reflect, WeakMap, Object, Array, JSON, RegExp, String, Function, Error,
    Blob: Blob_, Worker: Worker_, XMLHttpRequest: XHR, location: { href: "https://www.twitch.tv/somechannel" },
    setTimeout: () => 1,
    URL: Object.assign(function URL_(u, b) { return new URL(u, b); }, {
      createObjectURL: (b) => { const u = "blob:https://www.twitch.tv/" + (++n); blobs.set(u, b); return u; },
      revokeObjectURL: (u) => blobs.delete(u),
    }),
  };
  sb.window = sb;
  const before = sb.Worker;
  runInNewContext(SRC, sb, { filename: "chrome-extension://abcdefghijklmnop/twitch_main.js" });
  const twitchBlob = (text) => sb.URL.createObjectURL(new Blob_([text]));
  return { sb, blobs, made, before, twitchBlob };
}
{
  const p = page();
  const orig = p.twitchBlob(`importScripts('${IVS_URL}')`);
  const w = new p.sb.Worker(orig);
  const text = (p.blobs.get(w.url) || {}).text || "";
  ok("the player's worker (a blob that imports the IVS worker) is built from a new blob: our code first, then exactly its own script",
    w.url !== orig && /^try \{ \(function twitchWorker\(CFG\)/.test(text) && text.endsWith(`importScripts('${IVS_URL}')`));
  ok("…and it is still an instance of Worker; Worker still stringifies like the native", w instanceof p.sb.Worker && Function.prototype.toString.call(p.sb.Worker) === Function.prototype.toString.call(p.before));
  const other = p.twitchBlob("self.onmessage = () => {}");
  ok("any other worker (Kasada, a site script) is left exactly as asked", new p.sb.Worker(other).url === other);
  ok("a module worker is left alone", new p.sb.Worker(p.twitchBlob(`importScripts('${IVS_URL}')`), { type: "module" }).url.startsWith("blob:"));
  const direct = new p.sb.Worker(IVS_URL);
  ok("the IVS worker by URL → a blob that imports it after our code", /importScripts\("https:\/\/assets\.twitch\.tv\/assets\/amazon-ivs-wasmworker/.test(p.blobs.get(direct.url).text));
  ok("our code in the blob is the bundled function plus inert JSON (no fetch of code, no eval)", !/\beval\s*\(|new Function/.test(text) && !!CID && text.includes(`"cid":"${CID}"`));
}

// ---------- the worker: our code runs against a fake Twitch ----------
const master = (prefix) => [
  "#EXTM3U",
  '#EXT-X-TWITCH-INFO:NODE="n1",MANIFEST-NODE-TYPE="weaver_cluster",SERVER-TIME="1792935961.53",FUTURE="true"',
  '#EXT-X-MEDIA:TYPE=VIDEO,GROUP-ID="720p60",NAME="720p60",AUTOSELECT=YES,DEFAULT=YES',
  '#EXT-X-STREAM-INF:BANDWIDTH=3322199,RESOLUTION=1280x720,CODECS="avc1.4D401F,mp4a.40.2",VIDEO="720p60",FRAME-RATE=60.000',
  `https://use1.playlist.ttvnw.net/v1/playlist/${prefix}720.m3u8`,
  '#EXT-X-MEDIA:TYPE=VIDEO,GROUP-ID="360p30",NAME="360p30",AUTOSELECT=YES,DEFAULT=YES',
  '#EXT-X-STREAM-INF:BANDWIDTH=627900,RESOLUTION=640x360,CODECS="avc1.4D401F,mp4a.40.2",VIDEO="360p30",FRAME-RATE=30.000',
  `https://use1.playlist.ttvnw.net/v1/playlist/${prefix}360.m3u8`,
].join("\n");
const AD_TAGS = [
  '#EXT-X-DATERANGE:ID="stitched-ad-1",CLASS="twitch-stitched-ad",START-DATE="2026-10-25T13:46:08.260Z",DURATION=30.000,X-TV-TWITCH-AD-POD-POSITION="0"',
  '#EXT-X-DATERANGE:ID="source-1",CLASS="twitch-stream-source",START-DATE="2026-10-25T13:46:08.260Z",END-ON-NEXT=YES,X-TV-TWITCH-STREAM-SOURCE="Amazon|1"',
  '#EXT-X-DATERANGE:ID="trigger-1",CLASS="twitch-trigger",START-DATE="2026-10-25T13:46:08.260Z",END-ON-NEXT=YES,X-TV-TWITCH-TRIGGER-URL="https://tracking.example/t"',
  '#EXT-X-DATERANGE:ID="quartile-1-0",CLASS="twitch-ad-quartile",START-DATE="2026-10-25T13:46:08.260Z",DURATION=2.000,X-TV-TWITCH-AD-QUARTILE="0"',
];
const head = (seq) => ["#EXTM3U", "#EXT-X-VERSION:6", "#EXT-X-TARGETDURATION:5", `#EXT-X-MEDIA-SEQUENCE:${seq}`,
  '#EXT-X-DATERANGE:ID="playlist-session-1",CLASS="twitch-session",START-DATE="2026-10-25T13:46:13.167Z",END-ON-NEXT=YES,X-TV-TWITCH-SESSIONID="1"'];
const adSegs = (k) => ["#EXT-X-DISCONTINUITY", '#EXT-X-MAP:URI="https://ads.example/init.mp4"'].concat(
  ...Array.from({ length: k }, (_, i) => [`#EXT-X-PROGRAM-DATE-TIME:2026-10-25T13:46:${String(8 + 2 * i).padStart(2, "0")}.260Z`, "#EXTINF:2.000,Amazon|1", `https://ads.example/a${i}.mp4`]));
const liveSegs = (k, tag = "s") => ["#EXT-X-DISCONTINUITY", '#EXT-X-MAP:URI="https://video.example/init.mp4"',
  '#EXT-X-DATERANGE:ID="source-2",CLASS="twitch-stream-source",START-DATE="2026-10-25T13:46:38.260Z",END-ON-NEXT=YES,X-TV-TWITCH-STREAM-SOURCE="live"'].concat(
  ...Array.from({ length: k }, (_, i) => [`#EXT-X-PROGRAM-DATE-TIME:2026-10-25T13:47:${String(2 * i).padStart(2, "0")}.000Z`, "#EXTINF:2.000,live", `https://video.example/${tag}${i}.ts`]));
const withAd = (seq = 100) => head(seq).concat(AD_TAGS, adSegs(2), liveSegs(1), ["#EXT-X-TWITCH-PREFETCH:https://ads.example/next.mp4"]).join("\n");
const clean = (tag) => head(7).concat(liveSegs(3, tag)).join("\n");

function worker(routes) {
  const p = page();
  const w = new p.sb.Worker(p.twitchBlob(`importScripts('${IVS_URL}')`));
  const code = p.blobs.get(w.url).text;
  const seen = [];
  class Resp { constructor(body, init = {}) { this._b = String(body); this.status = init.status || 200; this.statusText = init.statusText || "OK"; this.ok = this.status < 300; this.headers = init.headers || {}; this.url = ""; }
    clone() { const r = new Resp(this._b, this); r.url = this.url; return r; } text() { return Promise.resolve(this._b); } json() { return Promise.resolve(JSON.parse(this._b)); } }
  const self = {
    Proxy, Reflect, WeakMap, Map, Object, Array, JSON, RegExp, String, Number, Math, Date, Promise, Function, URL, Response: Resp,
    imported: [],
    importScripts(u) { self.imported.push(u); },
  };
  self.self = self;
  self.fetch = function fetch(input, init) {
    const url = String(input);
    seen.push({ url, init });
    for (const [re, fn] of routes) {
      const m = re.exec(url);
      if (m) { const out = fn(url, init, m); const r = out instanceof Resp ? out : new Resp(out); r.url = url; return Promise.resolve(r); }
    }
    return Promise.resolve(Object.assign(new Resp("nope", { status: 404 }), { url }));
  };
  const pageFetch = self.fetch;
  runInNewContext(code, self, { filename: w.url });
  return { self, seen, pageFetch, Resp };
}
const GQL = /^https:\/\/gql\.twitch\.tv\/gql$/;
const USHER = /^https:\/\/usher\.ttvnw\.net\/api\/v2\/channel\/hls\/somechannel\.m3u8\?(.*)$/;
const USHER_URL = "https://usher.ttvnw.net/api/v2/channel/hls/somechannel.m3u8?acmb=e30%3D&allow_source=true&fast_bread=true&p=1234567&play_session_id=0123456789abcdef0123456789abcdef&player_backend=mediaplayer&playlist_include_framerate=true&reassignments_supported=true&sig=SITESIG&supported_codecs=av1,h265,h264&token=SITETOKEN&cdm=wv&player_version=1.40.0";
const tokenFor = (type) => JSON.stringify({ data: { streamPlaybackAccessToken: { value: JSON.stringify({ player_type: type }), signature: "SIG-" + type } } });
function twitch({ embedAds = false, popoutAds = false, autoplayAds = false, liveAds = true } = {}) {
  const ads = { embed: embedAds, popout: popoutAds, autoplay: autoplayAds };
  return [
    [GQL, (u, init) => tokenFor(JSON.parse(init.body).variables.playerType)],
    [USHER, (u) => { const q = new URLSearchParams(u.split("?")[1]); const sig = q.get("sig"); const type = sig === "SITESIG" ? "SITE" : sig.slice(4).toUpperCase(); return master(type); }],
    [/\/v1\/playlist\/SITE(720|360)\.m3u8/, () => (liveAds ? withAd() : clean("site"))],
    [/\/v1\/playlist\/(EMBED|POPOUT|AUTOPLAY)(720|360)\.m3u8/, (u, i, m) => (ads[m[1].toLowerCase()] ? withAd(3) : clean(m[1].toLowerCase() + m[2]))],
  ];
}
const txt = async (r) => (await r).text();

{
  const t = worker(twitch());
  ok("our code runs first, then the player's own script (importScripts) — the player starts as before", t.self.imported.join() === IVS_URL);
  ok("…and fetch inside the worker still stringifies like the native", Function.prototype.toString.call(t.self.fetch) === Function.prototype.toString.call(t.pageFetch));
  const m = await t.self.fetch(USHER_URL);
  ok("the master playlist reaches the player untouched", (await m.text()) === master("SITE"));
  const out = await txt(t.self.fetch("https://use1.playlist.ttvnw.net/v1/playlist/SITE720.m3u8"));
  ok("an ad in the playlist → the same quality (720p60) from the embed player type, without the ad", out === clean("embed720"));
  const g = t.seen.find((s) => GQL.test(s.url));
  const gb = JSON.parse(g.init.body);
  ok("the token is asked from Twitch's GQL with the public web client id and NO account token", !!CID && g.init.headers["Client-ID"] === CID &&
    !("Authorization" in g.init.headers) && gb.variables.playerType === "embed" && gb.variables.login === "somechannel" && /streamPlaybackAccessToken/.test(gb.query));
  const u = new URL(t.seen.filter((s) => USHER.test(s.url))[1].url);
  ok("the other stream's usher request keeps the player's parameters, with its own token, signature, p and session",
    u.searchParams.get("sig") === "SIG-embed" && JSON.parse(u.searchParams.get("token")).player_type === "embed" && u.searchParams.get("supported_codecs") === "av1,h265,h264" &&
    u.searchParams.get("player_version") === "1.40.0" && u.searchParams.get("p") !== "1234567" && /^[0-9a-f]{32}$/.test(u.searchParams.get("play_session_id")) && u.searchParams.get("play_session_id") !== "0123456789abcdef0123456789abcdef");
  const n = t.seen.length;
  const out2 = await txt(t.self.fetch("https://use1.playlist.ttvnw.net/v1/playlist/SITE720.m3u8?x=2"));
  ok("next poll of the ad break: no new token, one request for the other playlist", out2 === clean("embed720") && t.seen.length === n + 2 && !t.seen.slice(n).some((s) => GQL.test(s.url)));
  const out3 = await txt(t.self.fetch("https://use1.playlist.ttvnw.net/v1/playlist/SITE360.m3u8"));
  ok("another quality picks its own match (360p30)", out3 === clean("embed360"));
  ok("every request our code makes goes to Twitch only", t.seen.every((s) => /^https:\/\/(gql\.twitch\.tv|usher\.ttvnw\.net|[a-z0-9-]+\.playlist\.ttvnw\.net)\//.test(s.url)));
}
{
  // the quality stays on the other stream: it is packaged differently (HLS v3 against v6), every switch is a jump
  const state = { siteAds: true, embedAds: false, popoutAds: false, autoplayAds: false, embedDown: false, popoutDown: false };
  let tokens = 0;
  const t = worker([
    [GQL, (u, init) => { tokens++; return tokenFor(JSON.parse(init.body).variables.playerType); }],
    [USHER, (u) => { const sig = new URLSearchParams(u.split("?")[1]).get("sig"); return master(sig === "SITESIG" ? "SITE" : sig.slice(4).toUpperCase()); }],
    [/\/v1\/playlist\/SITE720\.m3u8/, () => (state.siteAds ? withAd() : clean("site"))],
    [/\/v1\/playlist\/(EMBED|POPOUT|AUTOPLAY)720\.m3u8/, (u, i, m) => {
      const k = m[1].toLowerCase();
      if (state[k + "Down"]) return new t.Resp("gone", { status: 403 });
      return state[k + "Ads"] ? withAd(3) : clean(k + "720");
    }],
  ]);
  await t.self.fetch(USHER_URL);
  const poll = () => txt(t.self.fetch("https://use1.playlist.ttvnw.net/v1/playlist/SITE720.m3u8"));
  ok("preroll → the other stream", (await poll()) === clean("embed720"));
  state.siteAds = false;
  ok("the ad on site is over → the quality STAYS on the other stream (no jump back)", (await poll()) === clean("embed720"));
  state.embedAds = true; state.popoutAds = true; state.autoplayAds = true;
  const both = await poll();
  ok("a break on every stream → the ad is taken out of the stream it stays on (embed), not site's",
    !/Amazon/.test(both) && /#EXT-X-MEDIA-SEQUENCE:5\n/.test(both) && /video\.example\/s0\.ts/.test(both));
  state.embedAds = false; state.popoutAds = false; state.autoplayAds = false;
  ok("…and back to its clean playlist after the break", (await poll()) === clean("embed720"));
  const before = tokens;
  state.embedDown = true;
  ok("that stream stops answering (403) → the next player type, whose session is already known (no new token)",
    (await poll()) === clean("popout720") && tokens === before);
  ok("…and it stays there while it answers", (await poll()) === clean("popout720") && tokens === before);
  state.embedDown = false; state.popoutDown = true;
  ok("that one stops too → back to embed, with ONE fresh token (its old session failed)", (await poll()) === clean("embed720") && tokens === before + 1);
  ok("no token is asked again while the stream answers (a new token = a new session = a jump)", (await poll()) === clean("embed720") && tokens === before + 1);
}
{
  const t = worker(twitch({ embedAds: true }));
  await t.self.fetch(USHER_URL);
  const out = await txt(t.self.fetch("https://use1.playlist.ttvnw.net/v1/playlist/SITE720.m3u8"));
  ok("embed has the ad too → popout", out === clean("popout720"));
  const before = t.seen.length;
  await t.self.fetch("https://use1.playlist.ttvnw.net/v1/playlist/SITE720.m3u8");
  ok("…and the next poll goes straight to popout (the one that worked), embed is not asked again for a while",
    t.seen.slice(before).filter((s) => /EMBED/.test(s.url)).length === 0 && t.seen.slice(before).some((s) => /POPOUT720/.test(s.url)));
}
{
  const t = worker(twitch({ embedAds: true, popoutAds: true, autoplayAds: true }));
  await t.self.fetch(USHER_URL);
  const out = await txt(t.self.fetch("https://use1.playlist.ttvnw.net/v1/playlist/SITE720.m3u8"));
  const lines = out.trim().split("\n");
  ok("every other stream has the ad too → the ad is taken out: no ad segment, no ad tag, no prefetch hint",
    !/Amazon|ads\.example|stitched-ad|twitch-ad-quartile|twitch-trigger|PREFETCH/.test(out) && /video\.example\/s0\.ts/.test(out));
  ok("…the stream segment keeps its own tags (discontinuity, init map, date)",
    /#EXT-X-DISCONTINUITY\n#EXT-X-MAP:URI="https:\/\/video\.example\/init\.mp4"/.test(out) && /#EXTINF:2\.000,live\nhttps:\/\/video\.example\/s0\.ts/.test(out));
  ok("…and the sequence numbers stay true (2 leading ad segments → MEDIA-SEQUENCE 100 + 2)", lines.includes("#EXT-X-MEDIA-SEQUENCE:102"));
  ok("…the session tags and the header are kept", lines[0] === "#EXTM3U" && /CLASS="twitch-session"/.test(out) && lines.includes("#EXT-X-TARGETDURATION:5"));
}
{
  const t = worker(twitch({ liveAds: false }));
  await t.self.fetch(USHER_URL);
  const n = t.seen.length;
  const r = await t.self.fetch("https://use1.playlist.ttvnw.net/v1/playlist/SITE720.m3u8");
  ok("no ad → the playlist is the player's own, untouched, and nothing else is asked", (await r.text()) === clean("site") && t.seen.length === n + 1);
}
{
  // a media playlist we never saw a master for (no channel known): only the strip path
  const t = worker(twitch());
  const out = await txt(t.self.fetch("https://use1.playlist.ttvnw.net/v1/playlist/SITE720.m3u8"));
  ok("unknown channel → the ad segments are taken out (no token asked)", !/Amazon/.test(out) && !t.seen.some((s) => GQL.test(s.url)));
}
{
  // an ad break in the middle of the window: [stream, ad, stream] — no renumbering
  const t = worker([[/mid\.m3u8/, () => head(50).concat(liveSegs(2, "x"), AD_TAGS, adSegs(2), liveSegs(1, "y")).join("\n")]]);
  const out = await txt(t.self.fetch("https://use1.playlist.ttvnw.net/v1/playlist/mid.m3u8"));
  ok("an ad in the middle is taken out; the sequence number is not touched", !/Amazon/.test(out) && /x0\.ts[\s\S]*x1\.ts[\s\S]*y0\.ts/.test(out) && /#EXT-X-MEDIA-SEQUENCE:50\n/.test(out));
}
{
  const t = worker([[/./, () => "ok"]]);
  const r = await t.self.fetch("https://static.twitchcdn.net/config/settings.json");
  ok("anything that is not a Twitch playlist passes untouched", (await r.text()) === "ok" && t.seen.length === 1);
}
{
  // our code failing must never take the player down: the worker script still runs
  const p = page();
  const w = new p.sb.Worker(p.twitchBlob(`importScripts('${IVS_URL}')`));
  const self = { imported: [], importScripts(u) { self.imported.push(u); } };
  Object.defineProperty(self, "fetch", { get() { throw new Error("boom"); } });
  self.self = self;
  runInNewContext(p.blobs.get(w.url).text, self);
  ok("if our code throws in the worker, the player's own script still loads", self.imported.join() === IVS_URL);
}

// ---------- the service worker registers it like the YouTube script ----------
const mock = makeChrome({ storage: { enabled: true, allowlist: ["example.com"] } });
globalThis.chrome = mock.chrome;
const bg = loadBackground({ chrome: mock.chrome, exports: "doSyncScriptlets" });
await bg.doSyncScriptlets(true);
const reg = mock.registered().find((s) => s.id === "sa-twitch");
ok("twitch_main.js registered MAIN / document_start / every frame on *.twitch.tv, not on allowed sites",
  !!reg && reg.world === "MAIN" && reg.runAt === "document_start" && reg.allFrames === true && reg.js.join() === "twitch_main.js" &&
  reg.matches.join() === "*://*.twitch.tv/*" && reg.excludeMatches.join() === "*://example.com/*,*://*.example.com/*");
mock.store.set("allowlist", ["twitch.tv"]);
await bg.doSyncScriptlets(true);
ok("Twitch on the allowlist → excluded there (the per-site off switch)", mock.registered().find((s) => s.id === "sa-twitch").excludeMatches.includes("*://*.twitch.tv/*"));
mock.store.set("features", { twitch: false });
await bg.doSyncScriptlets(true);
ok("features.twitch: false → not registered", !mock.registered().some((s) => s.id === "sa-twitch"));
await bg.doSyncScriptlets(false);
ok("protection off → not registered", !mock.registered().some((s) => s.id === "sa-twitch"));

done();
