// 6.1 managed policies (docs/ENTERPRISE.md): what an administrator sets in chrome.storage.managed.
// lib/managed.js validates it, applies it to storage.local and says which user changes it forbids.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { runInNewContext } from "node:vm";
import { ROOT, ok, done } from "./_harness.mjs";

const ctx = {};
ctx.globalThis = ctx;
runInNewContext(readFileSync(join(ROOT, "lib", "managed.js"), "utf8"), ctx);
const M = ctx.SA_MANAGED;
const J = (v) => JSON.stringify(v);

// ---- clean: only known keys of the right type ----
const raw = {
  mode: "strict", siteModes: { "WWW.Intranet.Example": "basic", "bad host": "basic", "x.example": "turbo" },
  allowlist: ["Corp.Example", "corp.example", "not a host", 7], features: { cookies: false, gpc: "yes", unknown: true },
  lists: { "reg-de": true, "nope": true, "BAD ID": false }, autoUpdate: false, reviewAsk: "no", disablePause: true, extra: 1,
};
const p = M.clean(raw, ["reg-de", "ubo"]);
ok(`clean: known keys, valid hosts (lower case, no www), right types; the rest dropped (${J(p)})`,
  J(p) === J({ mode: "strict", siteModes: { "intranet.example": "basic" }, allowlist: ["corp.example"], features: { cookies: false },
    lists: { "reg-de": true }, autoUpdate: false, disablePause: true }));
ok("clean: junk → {} (never throws)", J(M.clean(null)) === "{}" && J(M.clean([1, 2])) === "{}" && J(M.clean("x")) === "{}" && J(M.clean({ mode: 3 })) === "{}");
const bigAllow = M.clean({ allowlist: Array.from({ length: 6000 }, (_, i) => `h${i}.example`) });
ok("clean: at most 5000 allowed sites", bigAllow.allowlist.length === 5000);

// ---- apply: what to write so the policy holds ----
const state = { mode: "standard", siteModes: { "user.example": "strict" }, allowlist: ["mine.example"], features: { cookies: true, gpc: true },
  lists: { ubo: true }, autoUpdate: true, reviewAsk: true, enabled: false, pausedUntil: 0 };
const patch = M.apply(state, p);
ok(`apply: level replaced; site levels and allowed sites MERGED with the user's (${J(patch)})`,
  patch.mode === "strict" && J(patch.siteModes) === J({ "user.example": "strict", "intranet.example": "basic" }) &&
  J(patch.allowlist) === J(["mine.example", "corp.example"]));
ok("apply: only the locked features and lists change", J(patch.features) === J({ cookies: false, gpc: true }) && J(patch.lists) === J({ ubo: true, "reg-de": true }));
ok("apply: disablePause switches protection back on", patch.enabled === true && patch.pausedUntil === 0);
ok("apply: autoUpdate forced", patch.autoUpdate === false && !("reviewAsk" in patch));
ok("apply: already in force → nothing to write", J(M.apply({ ...state, ...patch }, p)) === "{}");
ok("apply: no policy → nothing (6.0 behaviour)", J(M.apply(state, {})) === "{}" && J(M.apply(state, null)) === "{}");

// ---- allows: which user changes the policy forbids ----
ok("allows: the global level is locked", !M.allows(p, { kind: "mode" }) && M.allows({}, { kind: "mode" }));
ok("allows: a locked site's level (and its subdomains) cannot change; other sites can",
  !M.allows(p, { kind: "siteMode", host: "intranet.example" }) && !M.allows(p, { kind: "siteMode", host: "a.intranet.example" }) &&
  M.allows(p, { kind: "siteMode", host: "news.example" }));
ok("allows: a site the policy allows cannot be taken out; the user may still allow others",
  !M.allows(p, { kind: "allow", host: "corp.example", allow: false }) && !M.allows(p, { kind: "allow", host: "www.corp.example", allow: false }) &&
  M.allows(p, { kind: "allow", host: "other.example", allow: true }) && M.allows(p, { kind: "allow", host: "mine.example", allow: false }));
ok("allows: a locked feature or list only to its policy value", !M.allows(p, { kind: "feature", key: "cookies", value: true }) &&
  M.allows(p, { kind: "feature", key: "cookies", value: false }) && M.allows(p, { kind: "feature", key: "gpc", value: false }) &&
  !M.allows(p, { kind: "list", id: "reg-de", value: false }) && M.allows(p, { kind: "list", id: "ubo", value: false }));
ok("allows: pause and switch-off refused under disablePause", !M.allows(p, { kind: "pause" }) && !M.allows(p, { kind: "disable" }) && M.allows({ mode: "basic" }, { kind: "pause" }));
const noEx = M.clean({ disableUserExceptions: true });
ok("allows: disableUserExceptions → no allowing and no site levels", !M.allows(noEx, { kind: "allow", host: "x.example", allow: true }) &&
  !M.allows(noEx, { kind: "siteMode", host: "x.example" }) && M.allows(noEx, { kind: "allow", host: "x.example", allow: false }));
ok("allows: autoUpdate/reviewAsk/sync only to the policy value", !M.allows(p, { kind: "autoUpdate", value: true }) && M.allows(p, { kind: "autoUpdate", value: false }) && M.allows(p, { kind: "sync", value: true }));

// ---- locks: what the UI draws disabled ----
const L = M.locks(p);
ok(`locks (${J(L)})`, L.any && L.mode && J(L.siteModes) === J(["intranet.example"]) && J(L.features) === J(["cookies"]) && L.pause && !L.exceptions && L.autoUpdate && !L.sync);
ok("locks: none without a policy", !M.locks({}).any && !M.locks(null).mode);

// ---- the service worker enforces it (every path a user could take) ----
{
  const { makeChrome, sendMessage } = await import("./_chrome.mjs");
  const { loadBackground } = await import("./_harness.mjs");
  const policy = { mode: "strict", allowlist: ["corp.example"], features: { cookies: false }, lists: { "reg-de": true },
    autoUpdate: false, disablePause: true, siteModes: { "intranet.example": "basic" } };
  const mock = makeChrome({ storage: { enabled: false, pausedUntil: 0, allowlist: ["mine.example"], features: { cookies: true, gpc: true }, mode: "standard", siteModes: {}, lists: {}, autoUpdate: true } });
  mock.chrome.storage.managed = { get: async () => structuredClone(policy) };
  globalThis.chrome = mock.chrome;
  globalThis.fetch = async (u) => ({ json: async () => (String(u).endsWith("lists.json") ? [{ id: "reg-de" }, { id: "ubo" }] : []) });
  const bg = loadBackground({ chrome: mock.chrome, exports: "applyManaged, setAllowHost, pauseFor, resetPolicy: () => { policyP = null; policyValue = null; }" });
  const patch = await bg.applyManaged();
  ok(`SW: the policy is written into the state (${JSON.stringify(Object.keys(patch || {}))})`,
    mock.store.get("mode") === "strict" && mock.store.get("allowlist").join() === "mine.example,corp.example" && mock.store.get("features").cookies === false &&
    mock.store.get("enabled") === true && mock.store.get("autoUpdate") === false && mock.store.get("siteModes")["intranet.example"] === "basic");
  const refused = (r) => r && r.ok === false && r.reason === "managed";
  ok("SW: the level for every site cannot be changed", refused(await sendMessage(mock.listeners, { type: "setMode", mode: "basic" })) && mock.store.get("mode") === "strict");
  ok("SW: a locked site's level cannot be changed", refused(await sendMessage(mock.listeners, { type: "setSiteMode", host: "intranet.example", mode: "strict" })));
  ok("SW: a site the policy allows cannot be taken out (popup, repair page, shortcut — all through setAllowHost)",
    refused(await bg.setAllowHost("corp.example", false)) && mock.store.get("allowlist").includes("corp.example"));
  ok("SW: no pause and no switch-off", refused(await sendMessage(mock.listeners, { type: "pause", minutes: 30 })) &&
    refused(await sendMessage(mock.listeners, { type: "toggle", enabled: false })) && mock.store.get("enabled") === true);
  const f = await sendMessage(mock.listeners, { type: "setFeatures", features: { cookies: true, gpc: false } });
  ok("SW: a locked feature keeps the policy's value, the others follow the user", f && f.ok && mock.store.get("features").cookies === false && mock.store.get("features").gpc === false);
  ok("SW: a locked list and a locked switch are refused", refused(await sendMessage(mock.listeners, { type: "setList", id: "reg-de", on: false })) &&
    refused(await sendMessage(mock.listeners, { type: "setAutoUpdate", on: true })));
  await sendMessage(mock.listeners, { type: "importSettings", data: { mode: "basic", allowlist: [], features: { cookies: true } } });
  await new Promise((r) => setTimeout(r, 50));
  ok("SW: importing a backup cannot undo the policy", mock.store.get("mode") === "strict" && mock.store.get("allowlist").includes("corp.example") && mock.store.get("features").cookies === false);
  const st = await sendMessage(mock.listeners, { type: "getStats" });
  ok("getStats: the locks for the popup and Settings", st && st.managed && st.managed.any && st.managed.mode && st.managed.pause && st.managed.features.includes("cookies"));
  ok("SW: a user change the policy allows still works", (await bg.setAllowHost("other.example", true)).ok === true);
  // the administrator removes the policy (or managed storage is unavailable: it throws) → nothing is enforced any more
  mock.chrome.storage.managed = { get: async () => { throw new Error("Managed storage manifest key missing"); } };
  bg.resetPolicy();
  ok("SW: no policy (or managed storage unavailable) → nothing enforced, nothing refused",
    (await bg.applyManaged()) === null && (await sendMessage(mock.listeners, { type: "setMode", mode: "basic" })).ok === true &&
    (await bg.setAllowHost("corp.example", false)).ok === true);
}

// ---- the schema Chrome validates the policy against ----
const schema = JSON.parse(readFileSync(join(ROOT, "managed_schema.json"), "utf8"));
const manifest = JSON.parse(readFileSync(join(ROOT, "manifest.json"), "utf8"));
ok("manifest: storage.managed_schema → managed_schema.json", manifest.storage && manifest.storage.managed_schema === "managed_schema.json");
ok("schema: every key lib/managed.js reads, with the same feature names",
  ["mode", "siteModes", "allowlist", "features", "lists", "autoUpdate", "reviewAsk", "sync", "disablePause", "disableUserExceptions"].every((k) => k in schema.properties) &&
  J(Object.keys(schema.properties.features.properties)) === J(M.FEATURES) && J(schema.properties.mode.enum) === J(M.MODES));

done();
