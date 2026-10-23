// 5.5.0 — Global Privacy Control и дневните броячи (само числа, последните 30 дни); 5.5.1 — страницата
// след деинсталиране (фиксиран адрес, без параметри).
// GPC: Sec-GPC: 1 (статичният рулсет rules/gpc.json) + navigator.globalPrivacyControl (gpc.js,
// MAIN world) — включено по подразбиране, изключва се с превключвателя, не на разрешен сайт.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { ROOT, ok, done, loadBackground } from "./_harness.mjs";
import { makeChrome, sendMessage } from "./_chrome.mjs";

const mock = makeChrome({ storage: { enabled: true, allowlist: ["example.com"] } });
globalThis.chrome = mock.chrome;
const bg = loadBackground({ chrome: mock.chrome, exports: "doSyncScriptlets, applyState, bumpDaily, dayKey, record" });

// ---- GPC: the request header rule ----
const gpcRules = JSON.parse(readFileSync(join(ROOT, "rules", "gpc.json"), "utf8"));
const manifest = JSON.parse(readFileSync(join(ROOT, "manifest.json"), "utf8"));
ok("rules/gpc.json: one rule that sets Sec-GPC: 1 on every kind of request (main frame included)",
  gpcRules.length === 1 && gpcRules[0].action.type === "modifyHeaders" &&
  JSON.stringify(gpcRules[0].action.requestHeaders) === JSON.stringify([{ header: "Sec-GPC", operation: "set", value: "1" }]) &&
  gpcRules[0].condition.resourceTypes.includes("main_frame") && gpcRules[0].condition.resourceTypes.includes("xmlhttprequest") && !gpcRules[0].condition.urlFilter);
ok("manifest: the gpc ruleset is declared", manifest.declarative_net_request.rule_resources.some((r) => r.id === "gpc" && r.path === "rules/gpc.json"));
ok("priority 1: allowed sites and a pause (allowAllRequests, higher priority) outrank it", gpcRules[0].priority === 1);

await bg.applyState();
ok("applyState: GPC on by default", mock.enabled().includes("gpc"));
mock.store.set("features", { gpc: false });
await bg.applyState();
ok("applyState: GPC switched off → the ruleset is off", !mock.enabled().includes("gpc"));
mock.store.delete("features");

// ---- GPC: the page script ----
await bg.doSyncScriptlets(true);
const gpcReg = mock.registered().find((s) => s.id === "sa-gpc");
ok("gpc.js registered MAIN / document_start / every frame, not on allowed sites",
  !!gpcReg && gpcReg.world === "MAIN" && gpcReg.runAt === "document_start" && gpcReg.allFrames === true && gpcReg.js.join() === "gpc.js" &&
  gpcReg.matches.join() === "<all_urls>" && gpcReg.excludeMatches.join() === "*://example.com/*,*://*.example.com/*");
mock.store.set("features", { gpc: false });
await bg.doSyncScriptlets(true);
ok("gpc.js not registered while the switch is off", !mock.registered().some((s) => s.id === "sa-gpc"));
await bg.doSyncScriptlets(false);
ok("protection off → no GPC script either", !mock.registered().some((s) => s.id === "sa-gpc"));
mock.store.delete("features");
const gpcSrc = readFileSync(join(ROOT, "gpc.js"), "utf8");
ok("gpc.js defines navigator.globalPrivacyControl = true and nothing else", /Object\.defineProperty\(proto, "globalPrivacyControl", \{ get: function \(\) \{ return true; \}/.test(gpcSrc) && !/fetch|XMLHttpRequest|sendMessage|localStorage/.test(gpcSrc));

// ---- daily totals ----
const day = (offset) => bg.dayKey(Date.now() - offset * 86400000);
let d = {};
for (let i = 40; i >= 0; i--) d = bg.bumpDaily(d, "b", 1, Date.now() - i * 86400000);
ok("bumpDaily keeps the last 30 days only", Object.keys(d).length === 30 && d[day(0)].b === 1 && !(day(31) in d));
d = bg.bumpDaily({ "junk": { b: 9 }, "__proto__": 1 }, "c", 2);
ok("bumpDaily drops keys that are not days and counts per field", Object.keys(d).join() === day(0) && d[day(0)].c === 2 && d[day(0)].b === 0);
ok("dayKey is the device-local date", /^\d{4}-\d{2}-\d{2}$/.test(bg.dayKey()) && bg.dayKey(new Date(2026, 0, 5, 23, 30).getTime()) === "2026-01-05");

mock.store.set("daily", {});
sendMessage(mock.listeners, { type: "cookieRejected" }, { id: "test-ext", url: "https://news.example.org/", tab: { id: 3 }, frameId: 0 });
bg.record(5, 5000);
await new Promise((r) => setTimeout(r, 1400));
const today = mock.store.get("daily")[bg.dayKey()];
ok(`a rejected cookie banner and blocked requests land in today's totals (${JSON.stringify(today)})`, today && today.c === 1 && today.b === 5);
await sendMessage(mock.listeners, { type: "resetStats" });
ok("resetStats clears the daily totals too", JSON.stringify(mock.store.get("daily")) === "{}");
const st = await sendMessage(mock.listeners, { type: "getStats" });
ok("getStats returns the daily totals (for the Settings chart)", st && typeof st.daily === "object");

// ---- the page the browser opens after an uninstall: one fixed address, nothing about the user ----
globalThis.fetch = async () => ({ ok: false, status: 404, json: async () => ({}), text: async () => "" }); // no network in tests
await mock.listeners.installed[0]({ reason: "install" });
await mock.listeners.installed[0]({ reason: "update" });
const un = mock.calls.uninstallUrl;
ok(`install and update set the uninstall page to exactly https://adblock.carbonstealth.eu/bye (${un.join(" | ")})`, un.length === 2 && un.every((u) => u === "https://adblock.carbonstealth.eu/bye"));
// /bye leads to the Chrome Web Store listing: other stores (Edge Add-ons, AMO) allow no reference to another
// store, so an install from them gets no uninstall page at all ("" clears it)
const realManifest = mock.chrome.runtime.getManifest;
for (const [name, m, want] of [
  ["Chrome Web Store", { manifest_version: 3, update_url: "https://clients2.google.com/service/update2/crx" }, "https://adblock.carbonstealth.eu/bye"],
  ["Edge Add-ons", { manifest_version: 3, update_url: "https://edge.microsoft.com/extensionwebstorebase/v1/crx" }, ""],
  ["Firefox (AMO)", { manifest_version: 3, browser_specific_settings: { gecko: { id: "supreme-adblock@carbonstealth.eu" } } }, ""],
]) {
  mock.chrome.runtime.getManifest = () => structuredClone(m);
  await mock.listeners.installed[0]({ reason: "update" });
  ok(`${name} install → uninstall page ${want ? want : "none (cleared)"}`, un.at(-1) === want);
}
mock.chrome.runtime.getManifest = realManifest;
const bgSrc = readFileSync(join(ROOT, "background.js"), "utf8");
ok("…set from a constant only: no version, id, reason or anything else appended", (bgSrc.match(/setUninstallURL\(/g) || []).length === 1 && /setUninstallURL\(url\)/.test(bgSrc) &&
  /const url = fromChromeStore\(chrome\.runtime\.getManifest\(\)\) \? UNINSTALL_URL : "";/.test(bgSrc) &&
  /const UNINSTALL_URL = "https:\/\/adblock\.carbonstealth\.eu\/bye";/.test(bgSrc));
const bye = readFileSync(join(ROOT, "server", "bye.html"), "utf8");
ok("server/bye.html: help first, then the reinstall link, then the feedback address — and no script at all", bye.indexOf('class="fixes"') < bye.indexOf('id="reinstall"') && bye.indexOf('id="reinstall"') < bye.indexOf('id="feedback"') &&
  !/<script(?! type="application\/ld\+json")/.test(bye) && !/<form/.test(bye));
const policy = readFileSync(join(ROOT, "server", "privacy.html"), "utf8");
ok("privacy.html explains the uninstall page (#uninstall), only for Chrome Web Store installs", policy.includes('id="uninstall"') && /installed from the Chrome Web Store, your browser opens adblock\.carbonstealth\.eu\/bye/.test(policy) && /another store, the extension opens no page/.test(policy));
ok("privacy.html says what happens to email sent to us (purpose, basis, 12 months) — /bye and /support ask for it", /id="email"/.test(policy) && /Art\. 6\(1\)\(f\)/.test(policy.slice(policy.indexOf('id="email"'))) && /deleted within 12 months/.test(policy));
const md = readFileSync(join(ROOT, "PRIVACY.md"), "utf8");
ok("PRIVACY.md carries the same three passages", md.includes("**Writing to us.**") && md.includes("installed from the Chrome Web Store, your browser opens") && md.includes("only the first in browsers older than Chrome 137"));

done();
