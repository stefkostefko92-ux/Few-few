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
  exports: "fetchLiveConfig, applyState, doSyncScriptlets, canVerifyEd25519",
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

done();
