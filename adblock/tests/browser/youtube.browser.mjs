// YouTube в истински Chromium срещу ЛОКАЛНО копие на www.youtube.com (самоподписан
// сертификат, домейнът насочен към 127.0.0.1, без прокси). Пази срещу връщане на
// следите, по които YouTube ни хващаше („блокира след 3 клипа“, 5.1.3):
//  - youtube_main е регистриран от SW (MAIN world, document_start) — без <script> в DOM;
//  - рекламните записи са махнати от player отговора ПРЕДИ страницата да го прочете,
//    видео данните са непокътнати;
//  - всяка подменена функция се представя точно като родната (fetch, XHR, JSON.parse,
//    setTimeout, window.open, addEventListener, самият toString);
//  - „чистият“ fetch от свеж iframe също е закачен;
//  - по време на bypass нищо наше не тича в YouTube страниците.
// 5.7: грешка през кука не носи наш кадър в e.stack; отказ (UNPLAYABLE → помощната страница за
// блокерите) → клипът се зарежда отново на място с формата 8AUB/#reloadxhr; реклама, вшита в потока
// (SSAP) → скок до края ѝ през API-то на плейъра; колбекът „abnormality detected“ не тича; рекламна
// кутия скрита от youtube_ads.css без нито един наш атрибут/inline стил; фалшивият googlevideo
// (expire от 2020) е блокиран от динамичното правило, истинският минава.
// 6.1.1: формите на uBO от 2026-11 (отказ → YAHI, после isInlinePlaybackNoAd); засядане, за което
// плейърът сам казва (onSnackbarMessage) → нов опит веднага, не след 10 s; вграденият
// ytInitialPlayerResponse е чист и на ниво Основна (там правилата на uBO не тичат).
// Иска Playwright (PW_ROOT) и openssl; CI с PW_REQUIRED=1 пада, ако липсват.
import { createRequire } from "node:module";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import https from "node:https";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const require = createRequire(join(process.env.PW_ROOT || join(ROOT, "node_modules"), "/"));
let chromium;
try { ({ chromium } = require("playwright")); } catch {
  console.log("SKIP: playwright not available (PW_ROOT)"); process.exit(process.env.PW_REQUIRED ? 1 : 0);
}
const tmp = mkdtempSync(join(tmpdir(), "yt-cert-"));
try {
  execFileSync("openssl", ["req", "-x509", "-newkey", "rsa:2048", "-nodes", "-keyout", join(tmp, "k.pem"), "-out", join(tmp, "c.pem"),
    "-days", "1", "-subj", "/CN=www.youtube.com", "-addext", "subjectAltName=DNS:www.youtube.com"], { stdio: "ignore" });
} catch {
  console.log("SKIP: openssl not available"); process.exit(process.env.PW_REQUIRED ? 1 : 0);
}

let pass = 0, fail = 0;
const ok = (name, cond) => { if (cond) { pass++; console.log("  PASS " + name); } else { fail++; console.log("  FAIL " + name); } };

const PLAYER = JSON.stringify({ playabilityStatus: { status: "OK" }, streamingData: { formats: [1] }, adPlacements: [{ ad: 1 }], adSlots: [{ s: 1 }], playerAds: [{ p: 1 }] });
const PAGE = `<!doctype html><html><head><script>
window.__early = Function.prototype.toString.call(window.fetch);
</script><script>
var ytInitialData = { contents: { richGridRenderer: { contents: [ { richItemRenderer: { content: { adSlotRenderer: { a: 1 } } } }, { richItemRenderer: { content: { videoRenderer: { videoId: "v" } } } } ] } } };
var ytInitialPlayerResponse = { playabilityStatus: { status: "OK" }, streamingData: { formats: [1] }, adPlacements: [{ a: 1 }], playerAds: [{ p: 1 }], adSlots: [{ s: 1 }] };
</script></head><body><ytd-ad-slot-renderer id=adslot>ad</ytd-ad-slot-renderer><div id=player-ads></div><div id=adbanner class="ad-banner">x</div>
<div id=movie_player></div><script>
// a stand-in for YouTube's player API: first a refusal, then (on request) a stitched ad
(() => {
  const mp = document.getElementById("movie_player");
  const REFUSED = { videoDetails: { videoId: "vid1", lengthSeconds: "212" }, playabilityStatus: { status: "UNPLAYABLE", errorScreen: { playerErrorMessageRenderer: { subreason: { runs: [
    { text: "Learn more", navigationEndpoint: { commandMetadata: { webCommandMetadata: { url: "https://support.google.com/youtube/answer/3037019", webPageType: "WEB_PAGE_TYPE_UNKNOWN" } } } } ] } } } } };
  const OK = { videoDetails: { videoId: "vid1", lengthSeconds: "212" }, playabilityStatus: { status: "OK" } };
  let resp = REFUSED, stats = { debug_info: "s:8 t:0.00", resolution: "1280x720", buffer_health_seconds: "4.00 s" }, prog = { current: 1, duration: 212 }, buffering = false;
  window.__mp = { loads: [], seeks: [] };
  mp.getPlayerResponse = () => resp; mp.getStatsForNerds = () => stats; mp.getProgressState = () => prog;
  mp.getPlayerStateObject = () => ({ isBuffering: buffering });
  mp.loadVideoById = (id, start) => {
    __mp.loads.push([id, start]); resp = OK;
    fetch("/youtubei/v1/player?prettyPrint=false", { method: "POST", body: JSON.stringify({ videoId: id, context: { client: { clientName: "WEB" } },
      playbackContext: { contentPlaybackContext: { referer: "https://www.youtube.com/", lactMilliseconds: "-1" } }, attestationRequest: { omitBotguardData: true } }) });
  };
  mp.seekTo = (t) => __mp.seeks.push(t);
  window.__ssap = () => { stats = { debug_info: "SSAP, AD 1/1 s:8", resolution: "1280x720" }; prog = { current: 2, duration: 15 }; };
  // a start YouTube starves: 0x0, empty buffer — and the player says so (its onSnackbarMessage lookup)
  window.__stuck = () => { resp = Object.assign({}, OK); stats = { debug_info: "s:5 t:0.00", resolution: "0x0", buffer_health_seconds: "0.00 s" }; prog = { current: 0, duration: 212 }; buffering = true; };
  window.__say = () => new Map([["onError", 1]]).has("onSnackbarMessage");
})();
</script><script>
(async () => {
  const out = {};
  try {
    const t = await (await fetch("/youtubei/v1/player?prettyPrint=false", { method: "POST", body: "{}" })).text();
    const j = JSON.parse(t);
    out.adsVisible = "adPlacements" in j || "adSlots" in j || "playerAds" in j;
    out.stream = !!(j.streamingData && j.streamingData.formats) && j.playabilityStatus.status === "OK";
    const ts = (f) => Function.prototype.toString.call(f);
    out.natives = {
      fetch: ts(fetch), parse: ts(JSON.parse), open: ts(XMLHttpRequest.prototype.open), send: ts(XMLHttpRequest.prototype.send),
      setTimeout: ts(setTimeout), windowOpen: ts(window.open), ael: ts(EventTarget.prototype.addEventListener),
      toString: ts(Function.prototype.toString), getter: ts(Object.getOwnPropertyDescriptor(XMLHttpRequest.prototype, "responseText").get),
      has: ts(Map.prototype.has), push: ts(Array.prototype.push),
    };
    out.pushWorks = [1, 2].push(3) === 3 && new Map([[1, 2]]).has(1) === true;
    const f = document.createElement("iframe"); document.body.appendChild(f);
    const j2 = JSON.parse(await (await f.contentWindow.fetch(location.origin + "/youtubei/v1/player", { method: "POST", body: "{}" })).text());
    out.iframeAdsVisible = "adPlacements" in j2;
    out.iframeFetch = ts(f.contentWindow.fetch);
    document.body.insertAdjacentHTML("beforeend", "<iframe id=adj></iframe>");
    const w3 = document.getElementById("adj").contentWindow;
    const j3 = JSON.parse(await (await w3.fetch(location.origin + "/youtubei/v1/player", { method: "POST", body: "{}" })).text());
    out.adjAdsVisible = "adPlacements" in j3;
    const st = (f) => { try { f(); } catch (e) { return String(e.stack); } return ""; };
    out.stacks = [st(() => Function.prototype.toString.call({})), st(() => JSON.parse("{bad")), st(() => XMLHttpRequest.prototype.open.call({}, "GET", "/"))];
    out.fetchStack = await fetch("http://[").then(() => "", (e) => String(e.stack));
    out.adHidden = getComputedStyle(document.getElementById("adslot")).display === "none";
    out.sheets = [...document.styleSheets].map((x) => x.href || (x.ownerNode && x.ownerNode.tagName) || "?").concat((document.adoptedStyleSheets || []).map(() => "adopted"));
    out.marks = [...document.querySelectorAll("*")].flatMap((el) => [...el.attributes].map((a) => a.name)).filter((n) => /tbab/.test(n));
    out.inlineStyles = ["player-ads", "adbanner"].filter((id) => document.getElementById(id).hasAttribute("style"));
    out.fakeGv = await fetch("https://rr3---sn-aigl6nsd.googlevideo.com/videoplayback?expire=1605819180&ei=x&id=o", { mode: "no-cors" }).then(() => "passed", () => "blocked");
    out.realGv = await fetch("https://rr3---sn-aigl6nsd.googlevideo.com/videoplayback?expire=" + (Math.floor(Date.now() / 1000) + 21600) + "&ei=x&id=o", { mode: "no-cors" }).then(() => "passed", () => "blocked");
    await new Promise((res) => {
      Promise.resolve().then(function () { window.__abn = 1; /* api.onAbnormalityDetected() */ }).then(function () { window.__after = 1; res(); });
    });
    out.abnRan = window.__abn === 1; out.afterRan = window.__after === 1;
    const d = Object.getOwnPropertyDescriptor(window, "ytInitialData");
    out.initialItems = window.ytInitialData.contents.richGridRenderer.contents.length;
    out.initialPlain = !!d && "value" in d && !d.get;
    const ipr = window.ytInitialPlayerResponse;
    out.initialPlayerAds = ipr ? ["adPlacements", "playerAds", "adSlots"].filter((k) => !!ipr[k]) : ["(none)"];
    out.initialPlayerStream = !!(ipr && ipr.streamingData && ipr.streamingData.formats);
    out.htmlAttrs = [...document.documentElement.attributes].map((a) => a.name).filter((n) => /tbab/.test(n));
    out.extScripts = [...document.scripts].filter((s) => (s.src || "").startsWith("chrome-extension:")).length;
  } catch (e) { out.error = String(e); }
  window.__out = out;
})();
</script></body></html>`;
const playerBodies = [];
const srv = https.createServer({ key: readFileSync(join(tmp, "k.pem")), cert: readFileSync(join(tmp, "c.pem")) }, (q, r) => {
  if (q.url.startsWith("/videoplayback")) { r.statusCode = 204; return r.end(); }
  if (q.url.startsWith("/youtubei/v1/player")) {
    let b = ""; q.on("data", (c) => { b += c; });
    q.on("end", () => { playerBodies.push(b); r.setHeader("content-type", "application/json"); r.end(PLAYER); });
    return;
  }
  r.setHeader("content-type", "text/html"); r.end(PAGE);
});
await new Promise((r) => srv.listen(0, "127.0.0.1", r));
const profile = mkdtempSync(join(tmpdir(), "yt-browser-"));
const ctx = await chromium.launchPersistentContext(profile, { channel: "chromium", headless: true, args: [
  "--no-sandbox", `--disable-extensions-except=${ROOT}`, `--load-extension=${ROOT}`,
  `--host-resolver-rules=MAP www.youtube.com 127.0.0.1:${srv.address().port}, MAP rr3---sn-aigl6nsd.googlevideo.com 127.0.0.1:${srv.address().port}`, "--ignore-certificate-errors", "--no-proxy-server",
] });
try {
  const sw = ctx.serviceWorkers()[0] || await ctx.waitForEvent("serviceworker");
  await new Promise((r) => setTimeout(r, 3000));
  const ids = async () => (await sw.evaluate(() => chrome.scripting.getRegisteredContentScripts())).map((c) => c.id);
  ok("youtube_main registered by the service worker (MAIN world, document_start)", (await ids()).includes("sa-youtube"));
  const p = await ctx.newPage();
  const errors = []; p.on("pageerror", (e) => errors.push(e.message));
  await p.goto("https://www.youtube.com/watch?v=test");
  await p.waitForFunction(() => window.__out, null, { timeout: 15000 });
  const out = await p.evaluate(() => window.__out);
  const early = await p.evaluate(() => window.__early);
  ok("no error in the page", !out.error && errors.length === 0);
  ok("ad entries gone from the player response before the page reads it; video data intact", out.adsVisible === false && out.stream === true);
  const n = out.natives || {};
  ok("every replaced native stringifies exactly like the real one",
    n.fetch === "function fetch() { [native code] }" && n.parse === "function parse() { [native code] }" && n.open === "function open() { [native code] }" &&
    n.send === "function send() { [native code] }" && n.setTimeout === "function setTimeout() { [native code] }" && n.windowOpen === "function open() { [native code] }" &&
    n.ael === "function addEventListener() { [native code] }" && n.toString === "function toString() { [native code] }" && n.getter === "function get responseText() { [native code] }" &&
    n.has === "function has() { [native code] }" && n.push === "function push() { [native code] }" && out.pushWorks === true);
  ok("already in place before the page's first script (document_start)", early === "function fetch() { [native code] }");
  ok("a fresh iframe's pristine fetch is hooked too, and still looks native", out.iframeAdsVisible === false && out.iframeFetch === "function fetch() { [native code] }");
  ok("no extension <script> element in the page", out.extScripts === 0);
  ok("an iframe inserted any other way (insertAdjacentHTML) is hooked too, via its contentWindow", out.adjAdsVisible === false);
  ok("ytInitialData: feed ad pruned on assignment, then a plain data property again (no accessor left as a tell)", out.initialItems === 1 && out.initialPlain === true);
  ok(`ytInitialPlayerResponse (the inline first answer of a full load): no ads, the stream intact (${out.initialPlayerAds.join(",")})`,
    out.initialPlayerAds.length === 0 && out.initialPlayerStream === true);
  ok("no attribute of ours on <html> in YouTube pages", out.htmlAttrs.length === 0);
  ok(`an error thrown through a hook has no frame of ours (toString, JSON.parse, XHR open, fetch rejection)`,
    out.stacks.length === 3 && out.stacks.every((x) => x && !/chrome-extension:/.test(x)) && /requires that 'this' be a Function/.test(out.stacks[0]) &&
    !!out.fetchStack && !/chrome-extension:/.test(out.fetchStack));
  ok(`a YouTube ad box is hidden by youtube_ads.css, which the page cannot list (document.styleSheets: ${JSON.stringify(out.sheets)})`,
    out.adHidden === true && !out.sheets.some((x) => /chrome-extension:|adopted|STYLE/.test(x)));
  ok(`…and nothing of ours is written on the page: no data-tbab-* anywhere, no inline style on #player-ads or an "ad-banner" box (${out.marks.join(",")}|${out.inlineStyles.join(",")})`,
    out.marks.length === 0 && out.inlineStyles.length === 0);
  ok(`the fake googlevideo request (expire 2020) fails like a blocked one; a real one passes (${out.fakeGv}/${out.realGv})`, out.fakeGv === "blocked" && out.realGv === "passed");
  ok("the \"abnormality detected\" callback never runs; the next callback in the chain does", out.abnRan === false && out.afterRan === true);
  await p.waitForFunction(() => window.__mp && window.__mp.loads.length > 0, null, { timeout: 5000 }).catch(() => {});
  await p.waitForTimeout(800);
  const mp = await p.evaluate(() => window.__mp);
  const shaped = playerBodies.map((b) => { try { return JSON.parse(b); } catch { return {}; } }).find((b) => b.attestationRequest);
  ok(`refusal → the clip is reloaded in place, once (${JSON.stringify(mp.loads)})`, mp.loads.length === 1 && mp.loads[0][0] === "vid1");
  ok(`…and that /player request reached the server shaped: params YAHI + #reloadxhr referer, lactMilliseconds as built (${shaped && shaped.params}, ${shaped && shaped.playbackContext.contentPlaybackContext.referer})`,
    !!shaped && shaped.params === "YAHI" && /#reloadxhr$/.test(shaped.playbackContext.contentPlaybackContext.referer) && shaped.playbackContext.contentPlaybackContext.lactMilliseconds === "-1");
  await p.evaluate(() => window.__ssap());
  await p.waitForFunction(() => window.__mp.seeks.length > 0, null, { timeout: 4000 }).catch(() => {});
  ok(`an ad stitched into the stream (SSAP) is jumped to its end through the player API (${JSON.stringify(await p.evaluate(() => window.__mp.seeks))})`,
    (await p.evaluate(() => window.__mp.seeks))[0] === 15);
  // 6.1.1: a stuck start the player reports is retried at once with the next shape (it used to wait 10 s)
  await p.evaluate(() => { window.__stuck(); window.__say(); });
  const t0 = Date.now();
  await p.waitForFunction(() => window.__mp.loads.length > 1, null, { timeout: 5000 }).catch(() => {});
  const waited = Date.now() - t0;
  await p.waitForTimeout(500);
  const inline = playerBodies.map((b) => { try { return JSON.parse(b); } catch { return {}; } }).filter((b) => b.attestationRequest).pop();
  ok(`stuck + the player's word → retried within ${waited} ms (not 10 s), with the next shape: isInlinePlaybackNoAd (${!!(inline && inline.playbackContext.contentPlaybackContext.isInlinePlaybackNoAd)})`,
    (await p.evaluate(() => window.__mp.loads.length)) === 2 && waited < 2500 && !!inline && inline.playbackContext.contentPlaybackContext.isInlinePlaybackNoAd === true);
  ok("youtube_ads.css registered with youtube_main (sa-youtube-css), and the fake-googlevideo rule accepted by Chrome",
    (await ids()).includes("sa-youtube-css") && (await sw.evaluate(async () => (await chrome.declarativeNetRequest.getDynamicRules()).some((r) => r.id === 69998))));
  // 6.1.1: the Basic level — no uBO rules on the page, YouTube keeps its own protection, a full load is clean too
  await sw.evaluate(async () => { await chrome.storage.local.set({ mode: "basic" }); await syncPageScripts(); await syncScriptlets(); });
  const basicIds = await ids();
  ok("Basic: no uBO chunk registered, youtube_main and youtube_ads.css still are",
    !basicIds.some((id) => id.startsWith("sa-ubo-")) && basicIds.includes("sa-youtube") && basicIds.includes("sa-youtube-css"));
  const pb = await ctx.newPage();
  await pb.goto("https://www.youtube.com/watch?v=test");
  await pb.waitForFunction(() => window.__out, null, { timeout: 15000 });
  const ob = await pb.evaluate(() => window.__out);
  ok(`Basic, full load: the inline player answer and the /player response carry no ads (${ob.initialPlayerAds.join(",")}|${ob.adsVisible})`,
    !ob.error && ob.initialPlayerAds.length === 0 && ob.initialPlayerStream === true && ob.adsVisible === false);
  await pb.close();
  await sw.evaluate(async () => { await chrome.storage.local.set({ mode: "standard", siteModes: { "youtube.com": "basic" } }); await syncPageScripts(); await syncScriptlets(); });
  const siteIds = await sw.evaluate(() => chrome.scripting.getRegisteredContentScripts());
  const yt = siteIds.find((c) => c.id === "sa-youtube");
  ok("youtube.com set to Basic: youtube_main still registered and not excluded there (6.0 dropped it)", !!yt && !(yt.excludeMatches || []).some((m) => m.includes("youtube.com")));
  await sw.evaluate(async () => { await chrome.storage.local.set({ siteModes: {} }); await syncPageScripts(); await syncScriptlets(); });
  await sw.evaluate(async () => { await chrome.storage.local.set({ ytBypassUntil: Date.now() + 3600e3 }); await syncScriptlets(); });
  ok("session bypass: nothing of ours registered for YouTube (script and stylesheet)", !(await ids()).includes("sa-youtube") && !(await ids()).includes("sa-youtube-css"));
  await sw.evaluate(async () => { await chrome.storage.local.remove("ytBypassUntil"); await syncScriptlets(); });
  ok("bypass over: registered again", (await ids()).includes("sa-youtube"));
} finally {
  await ctx.close(); srv.close();
  rmSync(profile, { recursive: true, force: true }); rmSync(tmp, { recursive: true, force: true });
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
