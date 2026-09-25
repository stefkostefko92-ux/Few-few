// Service worker: вратата на доверието (Ed25519 + anti-rollback + ротация на ключ),
// регистрация на scriptlet engine-а (excludeMatches, retry), applyState таблица, health.
import { ok, done, loadBackground } from "./_harness.mjs";
import { makeChrome, sendMessage } from "./_chrome.mjs";

const b64 = (buf) => Buffer.from(buf).toString("base64");
const keys = async () => {
  const kp = await crypto.subtle.generateKey({ name: "Ed25519" }, true, ["sign", "verify"]);
  return { kp, pub: b64(await crypto.subtle.exportKey("raw", kp.publicKey)) };
};
const sign = async (kp, text) => b64(await crypto.subtle.sign("Ed25519", kp.privateKey, new TextEncoder().encode(text)));

const k1 = await keys(), k2 = await keys(), kEvil = await keys();
const mock = makeChrome({ storage: { autoUpdate: true, enabled: true, allowlist: ["example.com", "bad host", "sub.test.org"] } });
globalThis.chrome = mock.chrome;
// Инжектираме тестовите ключове на мястото на вградените (ротация: два валидни ключа).
const bg = loadBackground({
  chrome: mock.chrome,
  patch: (src) => src.replace(/const SIG_PUBKEYS_B64 = \[[^\]]*\];/, `const SIG_PUBKEYS_B64 = [${JSON.stringify(k1.pub)}, ${JSON.stringify(k2.pub)}];`),
  exports: "fetchLiveConfig, applyState, doSyncScriptlets, canVerifyEd25519, setEd25519: (v) => { ed25519Supported = v; }",
});

// ---------- 1) Ed25519 trust gate ----------
let served = {};
globalThis.fetch = async (url) => {
  const key = String(url).endsWith(".sig") ? "sig" : "cfg";
  if (!(key in served)) return { ok: false, status: 404, text: async () => "" };
  return { ok: true, status: 200, text: async () => served[key] };
};
const cfg = (version, extra = {}) => JSON.stringify({ version, blockDomains: ["ads.example.net"], cosmetic: [], youtube: {}, ...extra });

ok("ed25519 is verifiable in this runtime", await bg.canVerifyEd25519() === true);
served = { cfg: cfg(7), sig: await sign(k1.kp, cfg(7)) };
let r = await bg.fetchLiveConfig(true);
ok("valid signature (key 1) → accepted, version stored, live rules applied", r.ok && r.version === 7 && mock.store.get("liveConfig").version === 7 && mock.dynamic().some((x) => x.id >= 100000));
served = { cfg: cfg(8), sig: await sign(k2.kp, cfg(8)) };
r = await bg.fetchLiveConfig(true);
ok("rotation: signature by key 2 accepted", r.ok && r.version === 8);
served = { cfg: cfg(9), sig: await sign(kEvil.kp, cfg(9)) };
r = await bg.fetchLiveConfig(true);
ok("unknown key → rejected 'bad signature', previous config kept", !r.ok && r.reason === "bad signature" && mock.store.get("liveConfig").version === 8);
served = { cfg: cfg(9) + " ", sig: await sign(k1.kp, cfg(9)) };
r = await bg.fetchLiveConfig(true);
ok("tampered body → rejected", !r.ok && r.reason === "bad signature");
served = { cfg: cfg(9) };
r = await bg.fetchLiveConfig(true);
ok("missing .sig → rejected 'no signature' (fail-closed when Ed25519 is available)", !r.ok && r.reason === "no signature");
served = { cfg: cfg(3), sig: await sign(k1.kp, cfg(3)) };
r = await bg.fetchLiveConfig(true);
ok("anti-rollback: older valid-signed version rejected", !r.ok && r.reason === "stale version" && mock.store.get("liveConfig").version === 8);
served = { cfg: cfg(8), sig: await sign(k1.kp, cfg(8)) };
r = await bg.fetchLiveConfig(true);
ok("equal version accepted (re-sign to recover from a poisoned version)", r.ok);
ok("liveError cleared on success, recorded on failure", mock.store.get("liveError") === "" && (await (async () => { served = {}; const x = await bg.fetchLiveConfig(true); return !x.ok && mock.store.get("liveError") === x.reason; })()));
mock.store.set("autoUpdate", false);
r = await bg.fetchLiveConfig(false);
ok("auto-update off → 'off' without fetching", !r.ok && r.reason === "off");
mock.store.set("autoUpdate", true);
served = { cfg: cfg(20, { scriptlets: [{ h: "s.com", n: "aopr", a: ["x"] }], blockDomains: Array.from({ length: 25000 }, (_, i) => `d${i}.example`) }), sig: "" };
served.sig = await sign(k1.kp, served.cfg);
r = await bg.fetchLiveConfig(true);
ok("live channel: 25 000 domains capped to 20 000 across 20 chunked rules; scriptlets sanitised", r.ok && r.domains === 20000 && mock.dynamic().filter((x) => x.id >= 100000).length === 20 && mock.store.get("liveConfig").scriptlets.length === 1);

// ---------- 2) scriptlet registration ----------
await bg.doSyncScriptlets(true);
const reg = mock.calls.registered.at(-1);
ok("engine registered MAIN/document_start/allFrames with excludeMatches only for valid allowlist hosts",
  reg && reg.world === "MAIN" && reg.runAt === "document_start" && reg.allFrames === true && reg.persistAcrossSessions === true &&
  reg.excludeMatches.join() === "*://example.com/*,*://*.example.com/*,*://sub.test.org/*,*://*.sub.test.org/*");
await bg.doSyncScriptlets(false);
ok("off → unregistered, nothing registered", mock.registered().length === 0 && mock.calls.unregistered.length >= 1);
const failing = makeChrome({ registerThrows: "quota", storage: { enabled: true, allowlist: [] } });
globalThis.chrome = failing.chrome;
await bg.doSyncScriptlets(true);
ok("registration failure → scriptletsError recorded + one-shot retry alarm", failing.store.get("scriptletsError") === "quota" && failing.calls.alarms.some((a) => a.name === "scriptlets-retry"));
globalThis.chrome = mock.chrome;

// ---------- 3) applyState table ----------
mock.store.set("enabled", true);
mock.store.set("features", { youtube: false, malware: true, topics: false, privacy: false, removeparam: true });
await bg.applyState();
let last = mock.calls.rulesets.at(-1);
ok("applyState: feature → ruleset table", ["ad_rules", "easylist", "easyprivacy", "surrogates", "removeparam", "urlhaus"].every((x) => last.enable.includes(x)) && ["youtube_rules", "headers", "privacy"].every((x) => last.disable.includes(x)));
mock.store.set("enabled", false);
await bg.applyState();
last = mock.calls.rulesets.at(-1);
ok("applyState: global off disables every ruleset and unregisters the engine", last.enable.length === 0 && last.disable.length === 9 && mock.registered().length === 0);
mock.store.set("enabled", true);

// ---------- 4) health ----------
const health = await sendMessage(mock.listeners, { type: "getHealth" });
ok("getHealth reports engine/rulesets/dynamic counts/live state/ed25519", health && typeof health.engineRegistered === "boolean" && Array.isArray(health.enabledRulesets) && typeof health.liveVersion === "number" && health.ed25519 === true && health.keys === 2 && typeof health.dynamic === "object");
const foreign = await sendMessage(mock.listeners, { type: "getHealth" }, { id: "someone-else" });
ok("messages from another extension are ignored", foreign === undefined);

// ---------- 5) content scripts speak only for their own page (червен екип F3) ----------
const page = { id: "test-ext", url: "https://evil.example/page", tab: { id: 5 } };
mock.store.set("enabled", true);
ok("content script cannot toggle protection", (await sendMessage(mock.listeners, { type: "toggle", enabled: false }, page)) === undefined && mock.store.get("enabled") === true);
ok("content script cannot edit the allowlist", (await sendMessage(mock.listeners, { type: "setAllow", host: "doubleclick.net", allow: true }, page)) === undefined && !mock.store.get("allowlist").includes("doubleclick.net"));
ok("content script cannot add a subscription or import settings",
  (await sendMessage(mock.listeners, { type: "addSubscription", url: "https://evil.example/list.txt" }, page)) === undefined &&
  (await sendMessage(mock.listeners, { type: "importSettings", data: { enabled: false } }, page)) === undefined);
let sv = await sendMessage(mock.listeners, { type: "saveCustomSelector", host: "victim.example", selector: ".ad-box" }, page);
ok("saveCustomSelector: stored under the SENDER's host, not msg.host", sv && sv.ok && (mock.store.get("customHidden")["evil.example"] || []).includes(".ad-box") && !mock.store.get("customHidden")["victim.example"]);
sv = await sendMessage(mock.listeners, { type: "saveCustomSelector", selector: "iframe[sandbox]:remove-attr(sandbox)" }, page);
ok("saveCustomSelector: unsafe procedural selector refused", sv && !sv.ok);

// ---------- 6) allowlist: hosts only, IDN as punycode, one bad entry cannot poison the rest (Кодаджията) ----------
let al = await sendMessage(mock.listeners, { type: "setAllow", host: "пример.бг", allow: true });
ok("setAllow: raw Unicode IDN refused (DNR takes punycode only)", al && !al.ok);
al = await sendMessage(mock.listeners, { type: "setAllow", host: "xn--e1afmkfd.xn--90ae", allow: true });
const allowRules = mock.dynamic().filter((x) => x.id >= 90000 && x.id < 100000);
ok("setAllow: punycode accepted; allow rules built only from valid hosts",
  al && al.ok && al.allowlist.includes("xn--e1afmkfd.xn--90ae") &&
  allowRules.some((x) => x.condition.requestDomains[0] === "xn--e1afmkfd.xn--90ae") && !allowRules.some((x) => x.condition.requestDomains[0] === "bad host"));
await bg.doSyncScriptlets(true);
const ex = mock.calls.registered.at(-1).excludeMatches;
ok("scriptlets excluded on IDN / IP / localhost too (no invalid *. patterns)", ex.includes("*://xn--e1afmkfd.xn--90ae/*") &&
  await (async () => { mock.store.set("allowlist", ["192.168.1.10", "localhost"]); await bg.doSyncScriptlets(true); const e = mock.calls.registered.at(-1).excludeMatches; return e.join() === "*://192.168.1.10/*,*://localhost/*"; })());

// ---------- 7) a pause survives an extension update (Кодаджията) ----------
mock.store.set("enabled", false); mock.store.set("pausedUntil", Date.now() + 20 * 60000);
await mock.listeners.installed[0]({ reason: "update" });
ok("update during a pause re-arms the resume alarm", mock.calls.alarms.some((a) => a.name === "resume"));
mock.store.set("enabled", false); mock.store.set("pausedUntil", Date.now() - 1000);
await mock.listeners.installed[0]({ reason: "update" });
ok("update after the pause expired turns protection back on", mock.store.get("enabled") === true && mock.store.get("pausedUntil") === 0);

// ---------- 8) anti-rollback only between SIGNED configs (червен екип F4) ----------
served = { cfg: cfg(2e308 > 1 ? Number.MAX_VALUE : 1), sig: "" };
served.cfg = JSON.stringify({ version: Number.MAX_VALUE, blockDomains: [], cosmetic: [], youtube: {} });
served.sig = await sign(k1.kp, served.cfg);
r = await bg.fetchLiveConfig(true);
ok("absurd version (Number.MAX_VALUE) neutralised, cannot pin the baseline", !r.ok && r.reason === "stale version" && mock.store.get("liveConfig").version < 1e10);
bg.setEd25519(false); // a browser without Ed25519 (Chrome < 137)
served = { cfg: JSON.stringify({ version: 9999999999, blockDomains: [], cosmetic: [], youtube: {} }) };
r = await bg.fetchLiveConfig(true);
const pinned = mock.store.get("liveConfig");
served = { cfg: cfg(5) };
const r2 = await bg.fetchLiveConfig(true);
ok("unsigned (no Ed25519): a huge version cannot lock out later updates", r.ok && pinned.verified === false && r2.ok && mock.store.get("liveConfig").version === 5);
bg.setEd25519(true);
served = { cfg: cfg(3), sig: await sign(k1.kp, cfg(3)) };
r = await bg.fetchLiveConfig(true);
ok("first signed config after unsigned ones is accepted and becomes the baseline", r.ok && mock.store.get("liveConfig").verified === true);
served = { cfg: cfg(2), sig: await sign(k1.kp, cfg(2)) };
r = await bg.fetchLiveConfig(true);
ok("…and an older signed one is then rejected", !r.ok && r.reason === "stale version");

// ---------- 9) per-page log groups by list (Chrome gives no URL in packed builds) ----------
mock.chrome.declarativeNetRequest.getMatchedRules = async () => ({ rulesMatchedInfo: [
  { rule: { ruleId: 5, rulesetId: "easyprivacy" }, timeStamp: 1 },
  { rule: { ruleId: 6, rulesetId: "easyprivacy" }, timeStamp: 2 },
  { rule: { ruleId: 100003, rulesetId: "_dynamic" }, timeStamp: 3 },
  { rule: { ruleId: 80001, rulesetId: "_dynamic" }, timeStamp: 4 },
  { rule: { ruleId: 90001, rulesetId: "_dynamic" }, timeStamp: 5 },   // allowlist → not a block
  { rule: { ruleId: 70000, rulesetId: "_dynamic" }, timeStamp: 6 },   // YouTube bypass → not a block
] });
const log = await sendMessage(mock.listeners, { type: "getTabLog", tabId: 5 });
ok("getTabLog: per-list counts, allow rules excluded",
  log && log.ok && log.total === 4 && log.items[0].list === "easyprivacy" && log.items[0].n === 2 &&
  log.items.some((x) => x.list === "live") && log.items.some((x) => x.list === "user") && !log.items.some((x) => !x.list));
ok("getTabLog is not available to content scripts (other tabs' activity)", (await sendMessage(mock.listeners, { type: "getTabLog", tabId: 5 }, page)) === undefined);

done();
