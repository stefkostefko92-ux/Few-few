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
</script></head><body><script>
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
    };
    const f = document.createElement("iframe"); document.body.appendChild(f);
    const j2 = JSON.parse(await (await f.contentWindow.fetch(location.origin + "/youtubei/v1/player", { method: "POST", body: "{}" })).text());
    out.iframeAdsVisible = "adPlacements" in j2;
    out.iframeFetch = ts(f.contentWindow.fetch);
    document.body.insertAdjacentHTML("beforeend", "<iframe id=adj></iframe>");
    const w3 = document.getElementById("adj").contentWindow;
    const j3 = JSON.parse(await (await w3.fetch(location.origin + "/youtubei/v1/player", { method: "POST", body: "{}" })).text());
    out.adjAdsVisible = "adPlacements" in j3;
    const d = Object.getOwnPropertyDescriptor(window, "ytInitialData");
    out.initialItems = window.ytInitialData.contents.richGridRenderer.contents.length;
    out.initialPlain = !!d && "value" in d && !d.get;
    out.htmlAttrs = [...document.documentElement.attributes].map((a) => a.name).filter((n) => /tbab/.test(n));
    out.extScripts = [...document.scripts].filter((s) => (s.src || "").startsWith("chrome-extension:")).length;
  } catch (e) { out.error = String(e); }
  window.__out = out;
})();
</script></body></html>`;
const srv = https.createServer({ key: readFileSync(join(tmp, "k.pem")), cert: readFileSync(join(tmp, "c.pem")) }, (q, r) => {
  if (q.url.startsWith("/youtubei/v1/player")) { r.setHeader("content-type", "application/json"); return r.end(PLAYER); }
  r.setHeader("content-type", "text/html"); r.end(PAGE);
});
await new Promise((r) => srv.listen(0, "127.0.0.1", r));
const profile = mkdtempSync(join(tmpdir(), "yt-browser-"));
const ctx = await chromium.launchPersistentContext(profile, { channel: "chromium", headless: true, args: [
  "--no-sandbox", `--disable-extensions-except=${ROOT}`, `--load-extension=${ROOT}`,
  `--host-resolver-rules=MAP www.youtube.com 127.0.0.1:${srv.address().port}`, "--ignore-certificate-errors", "--no-proxy-server",
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
    n.ael === "function addEventListener() { [native code] }" && n.toString === "function toString() { [native code] }" && n.getter === "function get responseText() { [native code] }");
  ok("already in place before the page's first script (document_start)", early === "function fetch() { [native code] }");
  ok("a fresh iframe's pristine fetch is hooked too, and still looks native", out.iframeAdsVisible === false && out.iframeFetch === "function fetch() { [native code] }");
  ok("no extension <script> element in the page", out.extScripts === 0);
  ok("an iframe inserted any other way (insertAdjacentHTML) is hooked too, via its contentWindow", out.adjAdsVisible === false);
  ok("ytInitialData: feed ad pruned on assignment, then a plain data property again (no accessor left as a tell)", out.initialItems === 1 && out.initialPlain === true);
  ok("no attribute of ours on <html> in YouTube pages", out.htmlAttrs.length === 0);
  await sw.evaluate(async () => { await chrome.storage.local.set({ ytBypassUntil: Date.now() + 3600e3 }); await syncScriptlets(); });
  ok("session bypass: nothing of ours registered for YouTube", !(await ids()).includes("sa-youtube"));
  await sw.evaluate(async () => { await chrome.storage.local.remove("ytBypassUntil"); await syncScriptlets(); });
  ok("bypass over: registered again", (await ids()).includes("sa-youtube"));
} finally {
  await ctx.close(); srv.close();
  rmSync(profile, { recursive: true, force: true }); rmSync(tmp, { recursive: true, force: true });
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
