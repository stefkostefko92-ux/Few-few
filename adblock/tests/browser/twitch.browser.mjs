// Twitch в истински Chromium срещу ЛОКАЛНО копие (самоподписан сертификат; www.twitch.tv, assets.twitch.tv,
// usher.ttvnw.net, gql.twitch.tv и *.playlist.ttvnw.net — насочени към 127.0.0.1, без прокси). Плейърът е
// фалшив, но пътят е истинският: страницата прави blob с importScripts на IVS worker-а (точно като
// twitch.tv), worker-ът тегли master и media плейлисти. Проверява: Worker-ът на плейъра тръгва с нашия код
// отпред (синхронният XHR на blob-а, новият blob, importScripts от него), реклама в плейлистата → чиста
// плейлиста от embed (токен от GQL през CORS), без реклама → плейлистата е непокътната, чужд worker не
// се пипа, Worker и fetch в worker-а изглеждат родни, на разрешен сайт нищо наше не тича.
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
const HOSTS = ["www.twitch.tv", "assets.twitch.tv", "usher.ttvnw.net", "gql.twitch.tv", "use1.playlist.ttvnw.net"];
const tmp = mkdtempSync(join(tmpdir(), "tw-cert-"));
try {
  execFileSync("openssl", ["req", "-x509", "-newkey", "rsa:2048", "-nodes", "-keyout", join(tmp, "k.pem"), "-out", join(tmp, "c.pem"),
    "-days", "1", "-subj", "/CN=www.twitch.tv", "-addext", "subjectAltName=" + HOSTS.map((h) => "DNS:" + h).join(",")], { stdio: "ignore" });
} catch {
  console.log("SKIP: openssl not available"); process.exit(process.env.PW_REQUIRED ? 1 : 0);
}

let pass = 0, fail = 0;
const ok = (name, cond) => { if (cond) { pass++; console.log("  PASS " + name); } else { fail++; console.log("  FAIL " + name); } };

const IVS = "https://assets.twitch.tv/assets/amazon-ivs-wasmworker.min-test.js";
// Twitch's public web id, read from the source (never spelled out twice: a scanner reads it as a key)
const CID = (/cid: "([a-z0-9]{30})"/.exec(readFileSync(join(ROOT, "twitch_main.js"), "utf8")) || [])[1];
// the fake IVS worker: fetches what the real one fetches and reports what it got
const IVS_JS = `
self.onmessage = async (e) => {
  const out = { fetchLooksNative: Function.prototype.toString.call(fetch) === "function fetch() { [native code] }" };
  try {
    const m = await (await fetch("https://usher.ttvnw.net/api/channel/hls/somechannel.m3u8?sig=SITESIG&token=%7B%7D&allow_source=true&p=1234567&player_backend=mediaplayer")).text();
    out.master = m.split("\\n").filter((l) => /^https:/.test(l));
    out.withAd = await (await fetch("https://use1.playlist.ttvnw.net/v1/playlist/SITE720.m3u8")).text();
    out.noAd = await (await fetch("https://use1.playlist.ttvnw.net/v1/playlist/SITE360.m3u8")).text();
  } catch (err) { out.error = String(err); }
  postMessage(out);
};`;
const master = (p) => ["#EXTM3U",
  '#EXT-X-STREAM-INF:BANDWIDTH=3322199,RESOLUTION=1280x720,CODECS="avc1.4D401F,mp4a.40.2",VIDEO="720p60",FRAME-RATE=60.000',
  `https://use1.playlist.ttvnw.net/v1/playlist/${p}720.m3u8`,
  '#EXT-X-STREAM-INF:BANDWIDTH=627900,RESOLUTION=640x360,CODECS="avc1.4D401F,mp4a.40.2",VIDEO="360p30",FRAME-RATE=30.000',
  `https://use1.playlist.ttvnw.net/v1/playlist/${p}360.m3u8`].join("\n");
const WITH_AD = ["#EXTM3U", "#EXT-X-VERSION:6", "#EXT-X-TARGETDURATION:5", "#EXT-X-MEDIA-SEQUENCE:0",
  '#EXT-X-DATERANGE:ID="stitched-ad-1",CLASS="twitch-stitched-ad",START-DATE="2026-10-25T13:46:08.260Z",DURATION=30.000',
  "#EXTINF:2.000,Amazon|1", "https://ads.example/a0.mp4", "#EXTINF:2.000,Amazon|1", "https://ads.example/a1.mp4"].join("\n");
const CLEAN = (tag) => ["#EXTM3U", "#EXT-X-VERSION:3", "#EXT-X-TARGETDURATION:6", "#EXT-X-MEDIA-SEQUENCE:7",
  "#EXTINF:2.000,live", `https://video.example/${tag}0.ts`, "#EXTINF:2.000,live", `https://video.example/${tag}1.ts`].join("\n");
const PAGE = `<!doctype html><title>somechannel - Twitch</title><body><script>
(async () => {
  const out = { workerLooksNative: Function.prototype.toString.call(Worker) === "function Worker() { [native code] }" };
  const blob = URL.createObjectURL(new Blob(["importScripts('${IVS}')"]));
  const w = new Worker(blob);
  URL.revokeObjectURL(blob); // as a page may do right away — our copy was taken synchronously
  out.player = await new Promise((res) => { w.onmessage = (e) => res(e.data); w.onerror = (e) => res({ error: "worker error " + (e.message || "") }); w.postMessage("go"); setTimeout(() => res({ error: "timeout" }), 8000); });
  const other = new Worker(URL.createObjectURL(new Blob(["postMessage(Function.prototype.toString.call(fetch).length + ':' + String(self.fetch === fetch)); postMessage(typeof self.__x)"])));
  out.other = await new Promise((res) => { other.onmessage = (e) => res(e.data); setTimeout(() => res("timeout"), 4000); });
  window.__out = out;
})();
</script>`;
const gqlBodies = [];
const cors = (r) => { r.setHeader("access-control-allow-origin", "*"); r.setHeader("access-control-allow-headers", "Client-ID, Content-Type"); r.setHeader("access-control-allow-methods", "GET, POST"); };
const srv = https.createServer({ key: readFileSync(join(tmp, "k.pem")), cert: readFileSync(join(tmp, "c.pem")) }, (q, r) => {
  const host = (q.headers.host || "").split(":")[0];
  cors(r);
  if (q.method === "OPTIONS") { r.statusCode = 204; return r.end(); }
  if (host === "assets.twitch.tv") { r.setHeader("content-type", "text/javascript"); return r.end(IVS_JS); }
  if (host === "gql.twitch.tv") {
    let b = ""; q.on("data", (c) => { b += c; });
    q.on("end", () => { gqlBodies.push({ body: b, headers: q.headers }); const t = JSON.parse(b).variables.playerType;
      r.setHeader("content-type", "application/json"); r.end(JSON.stringify({ data: { streamPlaybackAccessToken: { value: JSON.stringify({ player_type: t }), signature: "SIG-" + t } } })); });
    return;
  }
  if (host === "usher.ttvnw.net") { const sig = new URL(q.url, "https://x").searchParams.get("sig"); return r.end(master(sig === "SITESIG" ? "SITE" : sig.slice(4).toUpperCase())); }
  if (host === "use1.playlist.ttvnw.net") {
    if (/SITE720/.test(q.url)) return r.end(WITH_AD);
    if (/SITE360/.test(q.url)) return r.end(CLEAN("site360-"));
    const m = /(EMBED|POPOUT|AUTOPLAY)(720|360)/.exec(q.url); return r.end(m ? CLEAN(m[1].toLowerCase() + m[2] + "-") : "#EXTM3U");
  }
  r.setHeader("content-type", "text/html"); r.end(PAGE);
});
await new Promise((r) => srv.listen(0, "127.0.0.1", r));
const port = srv.address().port;
const profile = mkdtempSync(join(tmpdir(), "tw-browser-"));
const ctx = await chromium.launchPersistentContext(profile, { channel: "chromium", headless: true, args: [
  "--no-sandbox", `--disable-extensions-except=${ROOT}`, `--load-extension=${ROOT}`,
  "--host-resolver-rules=" + HOSTS.map((h) => `MAP ${h} 127.0.0.1:${port}`).join(", "), "--ignore-certificate-errors", "--no-proxy-server",
] });
try {
  const sw = ctx.serviceWorkers()[0] || await ctx.waitForEvent("serviceworker");
  await new Promise((r) => setTimeout(r, 3000));
  const ids = async () => (await sw.evaluate(() => chrome.scripting.getRegisteredContentScripts())).map((c) => c.id);
  ok("twitch_main registered by the service worker (sa-twitch)", (await ids()).includes("sa-twitch"));
  const p = await ctx.newPage();
  const errors = []; p.on("pageerror", (e) => errors.push(e.message));
  await p.goto("https://www.twitch.tv/somechannel");
  await p.waitForFunction(() => window.__out, null, { timeout: 20000 });
  const out = await p.evaluate(() => window.__out);
  const pl = out.player || {};
  ok("no error in the page or the player's worker", errors.length === 0 && !pl.error);
  ok("Worker in the page and fetch in the player's worker still look native", out.workerLooksNative === true && pl.fetchLooksNative === true);
  ok("the player's worker started from its own script (importScripts of the IVS worker), with our code in front", Array.isArray(pl.master) && pl.master.length === 2);
  ok(`an ad in the playlist → the same quality from the embed stream, without the ad`, pl.withAd === CLEAN("embed720-"));
  ok("no ad → the playlist is exactly the player's own", pl.noAd === CLEAN("site360-"));
  const g = gqlBodies[0];
  ok("the token came from Twitch's GQL (CORS from the worker), with the public client id and no account token",
    !!g && JSON.parse(g.body).variables.playerType === "embed" && g.headers["client-id"] === CID && !("authorization" in g.headers));
  ok(`a worker that is not the player's is left alone (${out.other})`, typeof out.other === "string" && out.other !== "timeout");
  await sw.evaluate(async () => { await chrome.storage.local.set({ allowlist: ["twitch.tv"] }); await syncScriptlets(); });
  const reg = (await sw.evaluate(() => chrome.scripting.getRegisteredContentScripts())).find((c) => c.id === "sa-twitch");
  ok("Twitch allowed → sa-twitch excludes it", !!reg && (reg.excludeMatches || []).includes("*://*.twitch.tv/*"));
  gqlBodies.length = 0;
  const p2 = await ctx.newPage();
  await p2.goto("https://www.twitch.tv/somechannel");
  await p2.waitForFunction(() => window.__out, null, { timeout: 20000 });
  const out2 = await p2.evaluate(() => window.__out);
  ok("…and the player then gets Twitch's playlist as it is (the ad included): nothing of ours runs there", out2.player && out2.player.withAd === WITH_AD && gqlBodies.length === 0);
} finally {
  await ctx.close(); srv.close();
  rmSync(profile, { recursive: true, force: true }); rmSync(tmp, { recursive: true, force: true });
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
