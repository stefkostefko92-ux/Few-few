// Scriptlet-ите от 5.2.0 в реален Chromium (Playwright): нещата, които симулираният свят
// на tests/engine.test.mjs не може да покаже честно — истински fetch/XHR отговори, DOMParser
// и XMLSerializer, Element.prototype.innerHTML, eval, таймери, requestAnimationFrame, „entity“
// домейни (example.*) по истинския hostname и маскирането на toString.
//   Двигателят се билдва в temp от тестов списък (истинският билд + валидатор) и се зарежда
//   като първия скрипт на страницата — точно както MAIN world скриптът на разширението.
// Не е в `npm test` (CI няма Playwright) — `PW_ROOT=$(npm root -g) npm run test:browser`.
import { createRequire } from "node:module";
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import http from "node:http";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const require = createRequire(join(process.env.PW_ROOT || join(ROOT, "node_modules"), "/"));
let chromium;
try { ({ chromium } = require("playwright")); } catch {
  console.log("SKIP: playwright not available (PW_ROOT)"); process.exit(process.env.PW_REQUIRED ? 1 : 0);
}

let pass = 0, fail = 0;
const ok = (name, cond) => { console.log(`  ${cond ? "PASS" : "FAIL"} ${name}`); cond ? pass++ : fail++; };

// ---- the engine, baked from test directives -------------------------------
const tmp = mkdtempSync(join(tmpdir(), "sa-scr-"));
const list = join(tmp, "list.txt"), out = join(tmp, "main.js");
writeFileSync(list, [
  "sa-test.com##+js(json-prune, feed.edges.[-].node.sponsored_data)",
  "sa-test.com##+js(json-prune, items.*.ad)",
  "sa-test.com##+js(json-prune, list.[].tracking)",
  "sa-test.com##+js(json-prune, banner, , /neverInThisStack/)",
  "sa-test.com##+js(json-prune-fetch-response, data.items.[-].promoted, , propsToMatch, url:/api/feed)",
  "sa-test.com##+js(json-prune-xhr-response, data.viewer.instream_video_ads, , propsToMatch, /api/graphql)",
  "sa-test.com##+js(noeval-if, adsbygoogle)",
  "sa-test.com##+js(nano-stb, boostMe, 2000)",
  "sa-test.com##+js(set-local-storage-item, adb_warning_seen, true)",
  "sa-test.com##+js(set-local-storage-item, adb_counter, $remove$)",
  "sa-test.com##+js(set-session-storage-item, popunder_last, 0)",
  "sa-test.com##+js(nofab)",
  "sa-test.com##+js(xml-prune, Ad, , /vast.xml)",
  "sa-test.com##+js(xml-prune, 'xpath(//*[name()=\"Period\"][contains(@id\\,\"-ad-\")])', , /manifest.mpd)",
  "sa-test.com##+js(m3u-prune, /ads/segment, /playlist.m3u8)",
  "sa-test.com##+js(set-attr, img.lazy, src, [data-src])",
  "sa-test.com##+js(norafif, adLoop)",
  "sa-test.com##+js(prevent-innerHTML, script, adblock-detect)",
  "sa-test.com##+js(no-fetch-if, adserver, length:10, {\"type\":\"cors\"})",
  "sa-test.com##+js(nowoif, popunder, 1)",
  "sa-test.com##+js(set-constant, Object.prototype.hideAds, true)",
  "sa-test.com##+js(set-constant, cfg.ads, {})",
  "sa-test.com##+js(remove-cookie, ad_freq, when, scroll)",
  "sa-test.com##+js(refresh-defuser)",
  "sa-test.com,~sub.sa-test.com##+js(set-constant, negFlag, true)",
  "example.*##+js(set-constant, entityFlag, true)",
].join("\n") + "\n");
execFileSync("node", [join(ROOT, "tools", "build_scriptlets.mjs"), `--list=${list}`, `--out=${out}`], { stdio: "inherit" });
const ENGINE = readFileSync(out, "utf8");
// entity data the manifest content script would put in front of the engine
const ENT = 'Object.defineProperty(document, "__tbabScriptletEntities", { value: ' + JSON.stringify({
  "shop.*": [["set-constant", "entData", "true"]],
  "shop.co.*": [["#@", "set-constant", "entData", "true"]],
}) + ", configurable: true });";

// ---- a local site --------------------------------------------------------
const J = (o) => JSON.stringify(o);
const RUNNER = `
window.R = {};
(async () => {
  const R = window.R;
  R.prunedEdges = JSON.parse(${J(J({ feed: { edges: [{ node: { id: 1, sponsored_data: { ad_id: 9 } } }, { node: { id: 2 } }] } }))}).feed.edges.map((e) => e.node.id).join();
  const it = JSON.parse(${J(J({ items: { a: { ad: 1, v: 1 }, b: { ad: 2, v: 2 } } }))}).items;
  R.star = !("ad" in it.a) && !("ad" in it.b) && it.a.v === 1;
  R.arr = JSON.parse(${J(J({ list: [{ tracking: 1, v: 1 }, { tracking: 2, v: 2 }] }))}).list.every((x) => !("tracking" in x) && x.v);
  R.stackKept = JSON.parse('{"banner":1}').banner === 1;
  const feed = await (await fetch("/api/feed")).json();
  R.fetchPruned = feed.data.items.map((x) => x.id).join();
  const fr = await fetch("/api/feed");
  R.fetchMeta = fr.status === 200 && /\\/api\\/feed$/.test(fr.url) && /json/.test(fr.headers.get("content-type") || "");
  R.fetchOther = (await (await fetch("/api/other")).json()).data.items.length;
  const xhr = (type) => new Promise((res) => { const x = new XMLHttpRequest(); x.open("GET", "/api/graphql"); x.responseType = type; x.onload = () => res(x); x.send(); });
  const x1 = await xhr("");
  R.xhrText = !("instream_video_ads" in JSON.parse(x1.responseText).data.viewer) && JSON.parse(x1.responseText).data.viewer.name === "me" && typeof x1.response === "string";
  const x2 = await xhr("json");
  R.xhrJson = !("instream_video_ads" in x2.response.data.viewer) && x2.response.data.viewer.name === "me";
  eval("window.evalAds = 'adsbygoogle'"); eval("window.evalOk = 1");
  R.noeval = window.evalAds === undefined && window.evalOk === 1;
  const t0 = performance.now();
  await new Promise((res) => setTimeout(function boostMe() { R.nano = performance.now() - t0; res(); }, 2000));
  R.storage = localStorage.getItem("adb_warning_seen") === "true" && localStorage.getItem("adb_counter") === null && sessionStorage.getItem("popunder_last") === "0";
  fuckAdBlock.onDetected(() => { R.fabDetected = true; });
  fuckAdBlock.onNotDetected(() => { R.fabNot = true; });
  window.fuckAdBlock = { onDetected() {} };
  R.fabStays = typeof window.fuckAdBlock.onNotDetected === "function";
  const vast = await (await fetch("/vast.xml")).text();
  R.vast = !/<Ad\\b/.test(vast) && /<VAST/.test(vast);
  const vx = await new Promise((res) => { const x = new XMLHttpRequest(); x.open("GET", "/vast.xml"); x.onload = () => res(x.responseText); x.send(); });
  R.vastXhr = !/<Ad\\b/.test(vx);
  const mpd = await (await fetch("/manifest.mpd")).text();
  R.mpd = !/-ad-/.test(mpd) && /content-1/.test(mpd);
  const m3u = await (await fetch("/playlist.m3u8")).text();
  R.m3u = !/ads\\/segment/.test(m3u) && /content\\/seg1/.test(m3u) && (m3u.match(/#EXTINF/g) || []).length === 2;
  R.setAttr = document.querySelector("img.lazy").getAttribute("src") === "/pic.png";
  R.rafId = requestAnimationFrame(function adLoop() { R.rafRan = true; });
  const s = document.createElement("script"); s.innerHTML = "adblock-detect(); window.leak = 1;"; document.head.appendChild(s);
  R.innerHTML = window.leak === undefined && s.innerHTML === "";
  const ar = await fetch("https://adserver.example/ad.js");
  R.noFetch = ar.type === "cors" && (await ar.text()).length === 10 && ar.url === "https://adserver.example/ad.js";
  const w = window.open("https://popunder.example/x");
  R.decoy = !!w && typeof w.closed === "boolean" && w !== window;
  R.proto = ({}).hideAds === true;
  R.cfg = typeof cfg.ads === "object" && cfg.ads !== null;
  document.cookie = "ad_freq=3; path=/";
  dispatchEvent(new Event("scroll"));
  await new Promise((r) => setTimeout(r, 900));
  R.cookieGone = !document.cookie.includes("ad_freq=");
  R.rafRan = !!R.rafRan;
  const ts = Function.prototype.toString;
  R.cloak = ts.call(window.eval) === "function eval() { [native code] }" && ts.call(window.fetch) === "function fetch() { [native code] }" &&
    ts.call(window.requestAnimationFrame) === "function requestAnimationFrame() { [native code] }" &&
    ts.call(Object.getOwnPropertyDescriptor(XMLHttpRequest.prototype, "responseText").get) === "function get responseText() { [native code] }";
  R.done = true;
})().catch((e) => { window.R.error = String(e && e.stack || e); window.R.done = true; });`;

const page = (extraHead = "") => `<!doctype html><html><head><meta charset="utf-8"><title>t</title>
${extraHead}<script src="/main.js"></script></head><body><img class="lazy" data-src="/pic.png" alt="">
<script>${RUNNER}</script></body></html>`;
const simple = (extraHead = "") => `<!doctype html><html><head>${extraHead}<script src="/main.js"></script></head><body>
<script>window.R = { negFlag: window.negFlag, entityFlag: window.entityFlag, entData: window.entData, done: true };</script></body></html>`;

const VAST = `<?xml version="1.0"?><VAST version="3.0"><Ad id="1"><InLine><AdTitle>ad</AdTitle></InLine></Ad></VAST>`;
const MPD = `<?xml version="1.0"?><MPD xmlns="urn:mpeg:dash:schema:mpd:2011"><Period id="pre-ad-1"><BaseURL>/a/</BaseURL></Period><Period id="content-1"><BaseURL>/c/</BaseURL></Period></MPD>`;
const M3U = ["#EXTM3U", "#EXT-X-VERSION:3", "#EXTINF:5,", "/ads/segment1.ts", "#EXTINF:5,", "/content/seg1.ts", "#EXTINF:5,", "/content/seg2.ts", "#EXT-X-ENDLIST"].join("\n");
const srv = http.createServer((q, r) => {
  const host = (q.headers.host || "").split(":")[0];
  const send = (type, body) => { r.setHeader("content-type", type); r.end(body); };
  if (q.url === "/main.js") return send("text/javascript", ENGINE);
  if (q.url === "/api/feed") return send("application/json", J({ data: { items: [{ id: 1 }, { id: 2, promoted: { by: "x" } }, { id: 3 }] } }));
  if (q.url === "/api/other") return send("application/json", J({ data: { items: [{ id: 1, promoted: 1 }, { id: 2 }] } }));
  if (q.url === "/api/graphql") return send("application/json", J({ data: { viewer: { name: "me", instream_video_ads: [{ ad: 1 }] } } }));
  if (q.url === "/vast.xml") return send("application/xml", VAST);
  if (q.url === "/manifest.mpd") return send("application/dash+xml", MPD);
  if (q.url === "/playlist.m3u8") return send("application/vnd.apple.mpegurl", M3U);
  if (q.url === "/pic.png") return send("image/png", "");
  if (q.url === "/refresh") return send("text/html", `<!doctype html><head><meta http-equiv="refresh" content="1;url=/gone"><script src="/main.js"></script></head><body>stay</body>`);
  if (q.url === "/gone") return send("text/html", "<!doctype html><title>gone</title>gone");
  if (host.includes("shop")) return send("text/html", simple(`<script>${ENT}</script>`));
  if (host === "www.sa-test.com") return send("text/html", page());
  return send("text/html", simple());
});
await new Promise((res) => srv.listen(0, "127.0.0.1", res));
const port = srv.address().port;
const hosts = ["www.sa-test.com", "sub.sa-test.com", "www.example.co.uk", "www.notexample.com", "www.shop.de", "www.shop.co.uk"];

const profile = mkdtempSync(join(tmpdir(), "sa-scr-p-"));
const ctx = await chromium.launchPersistentContext(profile, {
  channel: "chromium", headless: true,
  args: ["--no-sandbox", `--host-resolver-rules=${hosts.map((h) => `MAP ${h} 127.0.0.1:${port}`).join(", ")}, MAP adserver.example ~NOTFOUND, MAP popunder.example ~NOTFOUND`],
});
try {
  const p = await ctx.newPage();
  await p.addInitScript(() => { try { if (location.hostname === "www.sa-test.com") localStorage.setItem("adb_counter", "5"); } catch (e) {} });
  await p.goto(`http://www.sa-test.com:${port}/`);
  await p.waitForFunction(() => window.R && window.R.done, null, { timeout: 15000 });
  const R = await p.evaluate(() => window.R);
  if (R.error) console.log("  page error:", R.error);
  ok("json-prune [-]: the sponsored edge is removed, the rest kept", R.prunedEdges === "2");
  ok("json-prune *: a property is removed from every member", R.star);
  ok("json-prune []: a property is removed from every array item", R.arr);
  ok("json-prune stack needle: no prune when the caller's stack does not match", R.stackKept);
  ok("json-prune-fetch-response: promoted items pruned from the matching endpoint", R.fetchPruned === "1,3");
  ok("json-prune-fetch-response: status, url and headers survive the rewrite", R.fetchMeta);
  ok("json-prune-fetch-response: other endpoints untouched", R.fetchOther === 2);
  ok("json-prune-xhr-response: responseText and response (text) pruned", R.xhrText);
  ok("json-prune-xhr-response: responseType json pruned", R.xhrJson);
  ok("noeval-if: matching code is not run, other code is", R.noeval);
  ok(`nano-stb: a 2000 ms timer fires ~20× sooner (${Math.round(R.nano)} ms)`, R.nano < 600);
  ok("set-local/session-storage-item: values written, $remove$ removed", R.storage);
  ok("nofab: onNotDetected runs, onDetected never, the page cannot replace the stub", R.fabNot === true && !R.fabDetected && R.fabStays);
  ok("xml-prune: the VAST <Ad> is removed (fetch)", R.vast);
  ok("xml-prune: the VAST <Ad> is removed (XHR)", R.vastXhr);
  ok("xml-prune xpath(…): the ad Period of a DASH manifest goes, content stays", R.mpd);
  ok("m3u-prune: the ad segment and its #EXTINF go, content stays", R.m3u);
  ok("set-attr: src copied from [data-src]", R.setAttr);
  ok("norafif: the matching animation frame never runs", R.rafId === 0 && !R.rafRan);
  ok("prevent-innerHTML: the matching script body is refused", R.innerHTML);
  ok("no-fetch-if length:10 + type cors: a fake answer, no network", R.noFetch);
  ok("nowoif seconds: a decoy window instead of null", R.decoy);
  ok("set-constant through a prototype (baked list): every object sees it", R.proto);
  ok("set-constant {}: an empty object", R.cfg);
  ok("remove-cookie when scroll: removed after the visitor scrolls", R.cookieGone);
  ok("cloak: eval, fetch, requestAnimationFrame and the XHR getter still read as native", R.cloak);

  const visit = async (host) => {
    const q = await ctx.newPage();
    await q.goto(`http://${host}:${port}/`);
    const v = await q.evaluate(() => window.R);
    await q.close();
    return v;
  };
  const neg = await visit("sub.sa-test.com");
  ok("~sub.host: the directive is cancelled on the excluded subdomain", neg.negFlag === undefined);
  ok("entity example.*: applies on www.example.co.uk", (await visit("www.example.co.uk")).entityFlag === true);
  ok("entity example.*: not on www.notexample.com", (await visit("www.notexample.com")).entityFlag === undefined);
  ok("entity data (manifest file): shop.* applies on www.shop.de", (await visit("www.shop.de")).entData === true);
  ok("entity data: an exception under shop.co.* cancels it on www.shop.co.uk", (await visit("www.shop.co.uk")).entData === undefined);

  const rp = await ctx.newPage();
  await rp.goto(`http://www.sa-test.com:${port}/refresh`);
  await rp.waitForTimeout(1800);
  ok("refresh-defuser: the meta refresh never navigates", /\/refresh$/.test(rp.url()));
} finally {
  await ctx.close();
  rmSync(profile, { recursive: true, force: true });
  rmSync(tmp, { recursive: true, force: true });
}

// ---- the real extension: an entity from the shipped uBO list, end to end ----
// manifest content script (include_globs) → scriptlets/ubo/entities.js → registered
// engine → entityKeys(): 123link.* carries abort-on-property-read(ads_block). (Not its
// blockAdBlock one: our global set-constant already pins that name, so it never throws.)
{
  const entSrv = http.createServer((q, r) => {
    r.setHeader("content-type", "text/html");
    r.end(`<!doctype html><title>e</title><script>
      let threw = false; try { void window.ads_block; } catch (e) { threw = e instanceof ReferenceError; }
      document.title = JSON.stringify({ threw, leftover: "__tbabScriptletEntities" in document });
    </script>`);
  });
  await new Promise((res) => entSrv.listen(0, "127.0.0.1", res));
  const ep = entSrv.address().port;
  const prof2 = mkdtempSync(join(tmpdir(), "sa-scr-e-"));
  const ectx = await chromium.launchPersistentContext(prof2, {
    channel: "chromium", headless: true,
    args: ["--no-sandbox", `--disable-extensions-except=${ROOT}`, `--load-extension=${ROOT}`,
      `--host-resolver-rules=MAP www.123link.co 127.0.0.1:${ep}, MAP www.not123link-site.org 127.0.0.1:${ep}`],
  });
  try {
    const sw = ectx.serviceWorkers()[0] || await ectx.waitForEvent("serviceworker");
    await new Promise((r) => setTimeout(r, 3000)); // rulesets + script registration
    const look = async (host) => {
      const q = await ectx.newPage();
      await q.goto(`http://${host}:${ep}/`);
      const t = JSON.parse(await q.title());
      await q.close();
      return t;
    };
    const hit = await look("www.123link.co");
    ok("extension: an entity directive from the shipped uBO list runs on www.123link.co", hit.threw === true);
    ok("extension: the entity data is consumed, nothing left on the page", hit.leftover === false);
    const miss = await look("www.not123link-site.org");
    ok("extension: not on an unrelated host", miss.threw === false && miss.leftover === false);
    void sw;
  } finally {
    await ectx.close();
    entSrv.close();
    rmSync(prof2, { recursive: true, force: true });
  }
}
srv.close();
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
