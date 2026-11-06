// Режимите на защита (6.0, lib/modes.js): кой режим важи за хост и кои скриптове за страницата се
// регистрират — Basic нищо, Standard в главната рамка (+ рамките за съгласие), Strict навсякъде.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { runInNewContext } from "node:vm";
import { ROOT, ok, done } from "./_harness.mjs";

const ctx = {};
ctx.globalThis = ctx;
runInNewContext(readFileSync(join(ROOT, "lib", "modes.js"), "utf8"), ctx);
const M = ctx.SA_MODES;
const byId = (plan) => Object.fromEntries(plan.map((r) => [r.id.replace(M.PAGE_PREFIX, ""), r]));

// ---- values ----
ok("modes: basic, standard, strict; default standard", M.MODES.join() === "basic,standard,strict" && M.DEFAULT_MODE === "standard");
ok("normMode: anything else → standard", M.normMode("strict") === "strict" && M.normMode("turbo") === "standard" && M.normMode(undefined) === "standard");
const clean = M.cleanSiteModes({ "WWW.Example.com": "basic", "bad host": "strict", "news.example.org": "nope", "shop.test.net": "strict", "10.0.0.1": "standard" });
ok(`cleanSiteModes: valid hosts and modes only, lower case, no www (${JSON.stringify(clean)})`,
  JSON.stringify(clean) === '{"example.com":"basic","shop.test.net":"strict","10.0.0.1":"standard"}');
ok("cleanSiteModes: junk → {}", JSON.stringify(M.cleanSiteModes(null)) === "{}" && JSON.stringify(M.cleanSiteModes([1])) === "{}");

// ---- effective mode ----
const sm = { "example.com": "strict", "a.example.com": "basic" };
ok("effectiveMode: the most specific entry wins", M.effectiveMode("x.a.example.com", "standard", sm) === "basic" && M.effectiveMode("www.example.com", "standard", sm) === "strict");
ok("effectiveMode: otherwise the global mode", M.effectiveMode("other.org", "basic", sm) === "basic" && M.effectiveMode("other.org", "x", sm) === "standard");

// ---- the plan ----
{
  const p = byId(M.pageScriptPlan("standard", {}));
  ok("standard: content, generic CSS, cookies, anti-adblock, picker + consent frames",
    ["standard-content", "standard-generic", "standard-cookies", "standard-antiadblock", "standard-picker", "standard-cookies-cmp"].every((k) => p[k]) && Object.keys(p).length === 6);
  ok("standard: content and cookies only in the top frame", p["standard-content"].allFrames === false && p["standard-cookies"].allFrames === false);
  ok("standard: consent platforms get cookies.js in their frames, and the top-frame copy skips them",
    p["standard-cookies-cmp"].allFrames === true && p["standard-cookies-cmp"].matches.includes("*://*.privacy-mgmt.com/*") &&
    p["standard-cookies"].excludeMatches.includes("*://*.privacy-mgmt.com/*"));
  ok("standard: the same files as the 5.8 manifest", p["standard-content"].js.join() === "scriptlets/policy.js,content.js" && p["standard-content"].runAt === "document_start" &&
    p["standard-generic"].css.join() === "cosmetic_generic.css" && p["standard-cookies"].runAt === "document_idle");
}
{
  const p = byId(M.pageScriptPlan("strict", {}));
  ok("strict: everything in every frame (5.8), no separate consent registration",
    p["strict-content"].allFrames === true && p["strict-cookies"].allFrames === true && !p["standard-cookies-cmp"] && p["strict-content"].matches.join() === "<all_urls>");
}
ok("basic: nothing is injected anywhere", M.pageScriptPlan("basic", {}).length === 0);
{
  const p = byId(M.pageScriptPlan("standard", { "shop.test.net": "basic" }));
  ok("standard + a basic site → that site is excluded", p["standard-content"].excludeMatches.includes("*://shop.test.net/*") && p["standard-content"].excludeMatches.includes("*://*.shop.test.net/*"));
}
{
  const p = byId(M.pageScriptPlan("standard", { "example.com": "strict", "a.example.com": "basic" }));
  ok("standard + a strict site → strict scripts only there, in every frame; the standard ones skip it",
    p["strict-content"].matches.join() === "*://example.com/*,*://*.example.com/*" && p["strict-content"].allFrames === true &&
    p["standard-content"].excludeMatches.includes("*://*.example.com/*"));
  ok("…and a basic subdomain of the strict site is excluded from the strict scripts", p["strict-content"].excludeMatches.includes("*://*.a.example.com/*"));
}
{
  const p = byId(M.pageScriptPlan("basic", { "news.example.org": "standard" }));
  ok("basic + a standard site → standard scripts only there, no consent-frame registration",
    p["standard-content"].matches.join() === "*://news.example.org/*,*://*.news.example.org/*" && !p["standard-cookies-cmp"] && Object.keys(p).length === 5);
}
ok("ids are unique", (() => { const ids = M.pageScriptPlan("standard", { "example.com": "strict" }).map((r) => r.id); return new Set(ids).size === ids.length; })());
ok("basicSites", M.basicSites({ "a.org": "basic", "b.org": "strict" }).join() === "a.org");

// ---- the consent platforms list is the one cookies.js uses ----
const cookiesSrc = readFileSync(join(ROOT, "cookies.js"), "utf8");
const re = /CMP_FRAME_HOST_RE = \/\(\^\|\\\.\)\(([^)]+)\)\$\/i/.exec(cookiesSrc);
const fromCookies = re ? re[1].split("|").map((x) => x.replace(/\\\./g, ".")).sort().join() : "";
ok(`consent platforms == CMP_FRAME_HOST_RE in cookies.js (${fromCookies})`, fromCookies === [...M.CMP_FRAME_HOSTS].sort().join());

// ---- the service worker: registration, the popup's message, import ----
{
  const { makeChrome, sendMessage } = await import("./_chrome.mjs");
  const { loadBackground } = await import("./_harness.mjs");
  const mock = makeChrome({ storage: { enabled: true, allowlist: [], features: {}, mode: "standard", siteModes: { "shop.test.net": "basic" } } });
  globalThis.chrome = mock.chrome;
  globalThis.fetch = async () => ({ json: async () => [] }); // no uBO chunks here
  const bg = loadBackground({ chrome: mock.chrome, exports: "doSyncScriptlets, doSyncPageScripts, DEFAULTS, SYNC_KEYS, foldNoCosmetics, helpDue" });
  await bg.doSyncPageScripts();
  const page = mock.registered().filter((s) => s.id.startsWith(M.PAGE_PREFIX));
  ok(`SW: page scripts registered by the plan (${page.length}), persistent, the basic site excluded`,
    page.length === 6 && page.every((s) => s.persistAcrossSessions === true) && page.find((s) => s.id === "sa-page-standard-content").excludeMatches.includes("*://*.shop.test.net/*"));
  const unregBefore = mock.calls.unregistered.length, regBefore = mock.calls.registered.length;
  await bg.doSyncPageScripts();
  ok("SW: the same plan again (every browser start) → nothing unregistered or registered (no gap for restored tabs)",
    mock.calls.unregistered.length === unregBefore && mock.calls.registered.length === regBefore);
  await bg.doSyncScriptlets(true);
  const main = mock.registered().find((s) => s.id === "sa-scriptlets");
  ok("SW: a basic site gets no MAIN-world scripts either (main.js, GPC)",
    main.excludeMatches.includes("*://*.shop.test.net/*") && mock.registered().find((s) => s.id === "sa-gpc").excludeMatches.includes("*://*.shop.test.net/*"));
  ok("SW: main.js follows the level — Standard: the top frame only (in every frame it cost ~33 MB on the test pages)", main.allFrames === false && main.matches.join() === "<all_urls>");
  mock.store.set("siteModes", { "shop.test.net": "basic", "video.example": "strict" });
  await bg.doSyncScriptlets(true);
  const strictMain = mock.registered().find((s) => s.id === "sa-scriptlets-strict");
  ok("SW: a Strict site gets main.js in every frame, and the global registration skips it",
    strictMain && strictMain.allFrames === true && strictMain.matches.includes("*://*.video.example/*") &&
    mock.registered().find((s) => s.id === "sa-scriptlets").excludeMatches.includes("*://*.video.example/*"));
  const u0 = mock.calls.unregistered.length, r0 = mock.calls.registered.length;
  await bg.doSyncScriptlets(true);
  ok("SW: the same MAIN-world group again (browser start) → nothing re-registered (restored YouTube tabs keep it)",
    mock.calls.unregistered.length === u0 && mock.calls.registered.length === r0);
  ok("SW: the uBO chunks stay in every frame (host-specific fixes)", !mock.registered().some((s) => s.id.startsWith("sa-ubo-") && s.allFrames !== true));
  mock.store.set("siteModes", { "shop.test.net": "basic" });

  mock.store.set("mode", "basic");
  mock.store.set("siteModes", { "news.example.org": "strict" });
  await bg.doSyncScriptlets(true);
  const m2 = mock.registered().filter((s) => (s.js || []).includes("scriptlets/main.js"));
  ok("SW: Basic for every site → main.js only on the site set higher (in every frame: it is Strict), no GPC script",
    m2.length === 1 && m2[0].id === "sa-scriptlets-strict" && m2[0].allFrames === true &&
    m2[0].matches.join() === "*://news.example.org/*,*://*.news.example.org/*" && !mock.registered().some((s) => s.id === "sa-gpc"));
  mock.store.set("siteModes", {});
  await bg.doSyncScriptlets(true);
  ok("SW: Basic everywhere and no exceptions → no main.js at all", !mock.registered().some((s) => (s.js || []).includes("scriptlets/main.js")));
  await bg.doSyncPageScripts();
  ok("SW: Basic everywhere → no page scripts", !mock.registered().some((s) => s.id.startsWith(M.PAGE_PREFIX)));

  mock.store.set("mode", "standard");
  let r = await sendMessage(mock.listeners, { type: "setSiteMode", host: "WWW.Shop.Test.net", mode: "strict" });
  ok("setSiteMode: stored for the site (lower case, no www)", r && r.ok && mock.store.get("siteModes")["shop.test.net"] === "strict");
  r = await sendMessage(mock.listeners, { type: "setSiteMode", host: "shop.test.net", mode: "standard" });
  ok("setSiteMode: the global mode clears the entry", r && r.ok && !("shop.test.net" in mock.store.get("siteModes")));
  r = await sendMessage(mock.listeners, { type: "setSiteMode", host: "bad host", mode: "strict" });
  const r2 = await sendMessage(mock.listeners, { type: "setSiteMode", host: "a.org", mode: "turbo" });
  ok("setSiteMode: a bad host or mode is refused", r && r.ok === false && r2 && r2.ok === false);
  const r3 = await sendMessage(mock.listeners, { type: "setSiteMode", host: "a.org", mode: "basic" }, { id: "test-ext", url: "https://evil.example/" , tab: { id: 1 } });
  ok("setSiteMode: a web page cannot send it", r3 === undefined && !("a.org" in (mock.store.get("siteModes") || {})));
  // "Hide ad boxes here: Off" (≤ 5.8) is the site's Basic mode now
  const folded = bg.foldNoCosmetics(["WWW.Old.example", "kept.example", "bad host", 7], "standard", { "kept.example": "strict" });
  ok(`foldNoCosmetics: the old list → Basic sites, an existing entry wins, junk dropped (${JSON.stringify(folded)})`,
    JSON.stringify(folded) === JSON.stringify({ "kept.example": "strict", "old.example": "basic" }));
  ok("foldNoCosmetics: under a global Basic nothing to add", JSON.stringify(bg.foldNoCosmetics(["a.example"], "basic", {})) === "{}");
  r = await sendMessage(mock.listeners, { type: "setNoCosmetics", host: "fix.example", off: true });
  ok("setNoCosmetics (the repair page) → the site's Basic mode", r && r.ok && mock.store.get("siteModes")["fix.example"] === "basic" && !(mock.store.get("noCosmetics") || []).includes("fix.example"));
  r = await sendMessage(mock.listeners, { type: "setNoCosmetics", host: "fix.example", off: false });
  ok("…and back on → the global mode (entry cleared)", r && r.ok && !("fix.example" in mock.store.get("siteModes")));
  const now = Date.now();
  ok("help card: two Basic sites are the old \"hiding off on 2 sites\" sign", bg.helpDue({ siteModes: { "a.example": "basic", "b.example": "basic" } }, now) === true &&
    bg.helpDue({ siteModes: { "a.example": "basic", "b.example": "strict" } }, now) === false);
  mock.store.set("siteModes", {});
  r = await sendMessage(mock.listeners, { type: "importSettings", data: { noCosmetics: ["legacy.example"], mode: "standard" } });
  await new Promise((res) => setTimeout(res, 50));
  ok("import of a pre-6.0 backup: its hiding-off sites become Basic, noCosmetics is not stored",
    r && r.ok && (mock.store.get("siteModes") || {})["legacy.example"] === "basic" && !(mock.store.get("noCosmetics") || []).length);
  ok("defaults and sync: mode standard, siteModes {}, both synced", bg.DEFAULTS.mode === "standard" && JSON.stringify(bg.DEFAULTS.siteModes) === "{}" && bg.SYNC_KEYS.includes("mode") && bg.SYNC_KEYS.includes("siteModes"));
}
const bgSrc = readFileSync(join(ROOT, "background.js"), "utf8");
ok("import: mode only from the known list, siteModes cleaned", /k === "mode"\) \{\s*if \(SA_MODES\.MODES\.includes\(v\)\)/.test(bgSrc) && /k === "siteModes"\) \{\s*clean\[k\] = SA_MODES\.cleanSiteModes\(v\)/.test(bgSrc));

ok("update: the old noCosmetics list is folded into siteModes before the page scripts are registered",
  /stored\.noCosmetics\.length\) \{\s*patch\.siteModes = foldNoCosmetics\(stored\.noCosmetics, stored\.mode, stored\.siteModes\);\s*patch\.noCosmetics = \[\];/.test(bgSrc) &&
  bgSrc.indexOf("patch.siteModes = foldNoCosmetics") < bgSrc.indexOf("await syncPageScripts(); // 6.0"));

// ---- the popup: one row (the level replaced "Hide ad boxes here"), no picker in Basic ----
const popHtml = readFileSync(join(ROOT, "popup", "popup.html"), "utf8");
const popJs = readFileSync(join(ROOT, "popup", "popup.js"), "utf8");
ok("popup: the level picker replaced the ad-box switch (no extra row)", popHtml.includes('id="modeSel"') && !popHtml.includes("cosmToggle") && !popJs.includes("cosmToggle"));
ok("popup: in Basic the picker button is off (what it hid would not apply)", /effectiveMode === "basic"\) \{\s*\$\("pickBtn"\)\.disabled = true;/.test(popJs));
// ---- meta.js (Facebook / Instagram / Threads) stops in Basic too ----
const metaSrc = readFileSync(join(ROOT, "meta.js"), "utf8");
ok("meta.js: gated on Basic, and lib/modes.js runs before it", /!st\.noCosm && !st\.basic/.test(metaSrc) && /SA_MODES\.effectiveMode\(location\.hostname, st\.mode, st\.siteModes\) === "basic"/.test(metaSrc));

// ---- the manifest no longer injects them; the package still ships them ----
const manifest = JSON.parse(readFileSync(join(ROOT, "manifest.json"), "utf8"));
const inManifest = manifest.content_scripts.flatMap((c) => [...(c.js || []), ...(c.css || [])]);
ok("manifest: lib/modes.js right before meta.js", manifest.content_scripts.some((c) => (c.js || []).join() === "lib/modes.js,meta.js"));
ok("manifest: content.js, cookies.js, anti-adblock, picker and the generic CSS are registered by the SW now",
  ["content.js", "cookies.js", "antiadblock.js", "picker.js", "cosmetic_generic.css"].every((f) => !inManifest.includes(f)));
const pkg = readFileSync(join(ROOT, "tools", "package.sh"), "utf8");
ok("package.sh insists on the page scripts and lib/modes.js",
  ["content.js", "cookies.js", "antiadblock.js", "picker.js", "cosmetic_generic.css", "lib/modes.js"].every((f) => pkg.includes(`"${f}"`)) && /"lib\/modes\.js", ("lib\/who\.js", )?"background\.js"\]/.test(pkg));

done();
