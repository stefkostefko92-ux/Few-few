// 5.5.0 — Global Privacy Control и дневните броячи (само числа, последните 30 дни).
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

done();
