// 6.0 "Who we stopped": blocked requests per company per day, on this device only.
// rules/who.json (tools/build_who.mjs) maps a static rule to the company owning its domain;
// lib/who.js keeps the counts (31 days, ≤ 60 companies a day, no address, no site).
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { runInNewContext } from "node:vm";
import { execFileSync } from "node:child_process";
import { ROOT, ok, done } from "./_harness.mjs";
import { filterHost, companyOfRule, loadCompanies } from "../tools/build_who.mjs";

// ---- the build-time map ----
let fresh = true;
try { execFileSync(process.execPath, [join(ROOT, "tools", "build_who.mjs"), "--check"], { stdio: "pipe" }); } catch { fresh = false; }
ok("rules/who.json is fresh (node tools/build_who.mjs)", fresh);
const whoJson = JSON.parse(readFileSync(join(ROOT, "rules", "who.json"), "utf8"));
const nRules = Object.values(whoJson.rules).reduce((a, m) => a + Object.keys(m).length, 0);
ok(`the map covers the big rulesets (${nRules} rules, ${whoJson.companies.length} companies)`,
  nRules > 1000 && whoJson.companies.includes("Google") && whoJson.companies.includes("Meta") && whoJson.rules.easyprivacy);
ok("…and stays small in the package (< 64 KB)", readFileSync(join(ROOT, "rules", "who.json")).length < 64 * 1024);

ok("filterHost: ||host^, ||host/path, |https://host/ → host; a path or a pattern → nothing",
  filterHost("||google-analytics.com^") === "google-analytics.com" && filterHost("||stats.g.doubleclick.net/j/") === "stats.g.doubleclick.net" &&
  filterHost("|https://connect.facebook.net/en_US/") === "connect.facebook.net" && filterHost("/ads/banner.") === "" && filterHost("||*.example.com^") === "");
const co = loadCompanies();
ok("companyOfRule: a block rule on a known domain → its company",
  companyOfRule({ action: { type: "block" }, condition: { urlFilter: "||www.google-analytics.com^" } }, co) === "Google");
ok("companyOfRule: allow / header rules are not \"stopped\"",
  companyOfRule({ action: { type: "allow" }, condition: { urlFilter: "||google-analytics.com^" } }, co) === "" &&
  companyOfRule({ action: { type: "modifyHeaders" }, condition: { urlFilter: "||google-analytics.com^" } }, co) === "");
ok("companyOfRule: domains of different companies, or an unknown one → nothing (never a guess)",
  companyOfRule({ action: { type: "block" }, condition: { requestDomains: ["doubleclick.net", "criteo.com"] } }, co) === "" &&
  companyOfRule({ action: { type: "block" }, condition: { requestDomains: ["doubleclick.net", "google-analytics.com"] } }, co) === "Google" &&
  companyOfRule({ action: { type: "block" }, condition: { urlFilter: "||ads.unknown-network.example^" } }, co) === "");

// ---- lib/who.js ----
const ctx = {};
ctx.globalThis = ctx;
runInNewContext(readFileSync(join(ROOT, "lib", "who.js"), "utf8"), ctx);
const W = ctx.SA_WHO;
const DAY = 86400000;
const now = new Date(2026, 10, 6, 12).getTime();
ok("companyOfRule (runtime): the matched rule → its company from the map",
  W.companyOfRule({ companies: ["Google"], rules: { easyprivacy: { 42: 0 } } }, { rulesetId: "easyprivacy", ruleId: 42 }) === "Google" &&
  W.companyOfRule({ companies: ["Google"], rules: { easyprivacy: { 42: 0 } } }, { rulesetId: "_dynamic", ruleId: 42 }) === "" &&
  W.companyOfRule(null, { rulesetId: "easyprivacy", ruleId: 42 }) === "");
let who = W.bump({}, new Map([["Google", 3], ["Meta", 1]]), now);
who = W.bump(who, { Google: 2 }, now);
ok(`bump: per day, per company (${JSON.stringify(who)})`, JSON.stringify(who) === JSON.stringify({ "2026-11-06": { Google: 5, Meta: 1 } }));
let long = {};
for (let i = 40; i >= 0; i--) long = W.bump(long, { Google: 1 }, now - i * DAY);
ok(`bump: only the last ${W.KEEP_DAYS} days are kept`, Object.keys(long).length === W.KEEP_DAYS && !("2026-09-26" in long));
const many = {};
for (let i = 0; i < 80; i++) many["Company " + i] = 1;
ok(`bump: at most ${W.PER_DAY} companies a day`, Object.keys(W.bump({}, many, now)["2026-11-06"]).length === W.PER_DAY);
ok("bump: junk in storage or in the input is dropped (no crash)",
  JSON.stringify(W.bump({ x: 1, "2026-11-01": { A: -1, B: "3", C: 2 }, "2026-11-02": [1] }, { "": 4, D: NaN, E: 1 }, now)) ===
  JSON.stringify({ "2026-11-01": { C: 2 }, "2026-11-06": { E: 1 } }));
const sum = W.summary({ "2026-11-06": { Google: 5, Meta: 1 }, "2026-11-01": { Google: 2, Criteo: 6 }, "2026-09-01": { Old: 99 } }, now, 30);
ok(`summary: the last 30 days, most requests first, with the number of days (${JSON.stringify(sum)})`,
  JSON.stringify(sum) === JSON.stringify([{ name: "Google", n: 7, days: 2 }, { name: "Criteo", n: 6, days: 1 }, { name: "Meta", n: 1, days: 1 }]));
const worst = {};
for (let d = 0; d < W.KEEP_DAYS; d++) { const row = {}; for (let i = 0; i < W.PER_DAY; i++) row["Company name " + i] = 123456; worst[W.dayKey(now - d * DAY)] = row; }
ok(`storage stays ≤ 50 KB even at the caps (${(JSON.stringify(W.bump(worst, {}, now)).length / 1024).toFixed(1)} KB with ${W.PER_DAY} long names × ${W.KEEP_DAYS} days)`,
  JSON.stringify(W.bump(worst, {}, now)).length <= 50 * 1024 && JSON.stringify(W.bump({}, many, now)).length < 2048);

// ---- the service worker: counted from getMatchedRules, once per match ----
{
  const { makeChrome, sendMessage } = await import("./_chrome.mjs");
  const { loadBackground } = await import("./_harness.mjs");
  const mock = makeChrome({ storage: { enabled: true, allowlist: [], features: {} } });
  const session = new Map();
  mock.chrome.storage.session = {
    get: async (k) => (session.has(k) ? { [k]: structuredClone(session.get(k)) } : {}),
    set: async (o) => { for (const [k, v] of Object.entries(o)) session.set(k, structuredClone(v)); },
  };
  globalThis.chrome = mock.chrome;
  const map = { v: 1, companies: ["Google", "Criteo"], rules: { easyprivacy: { 7: 0 }, easylist: { 9: 1 } } };
  const passive = { v: 1, rules: { easylist: [50], gpc: [1] } }; // an @@ exception and the Sec-GPC header rule
  const fetched = [];
  globalThis.fetch = async (u) => { fetched.push(String(u)); return { json: async () => (String(u).endsWith("passive.json") ? passive : map) }; };
  const exportsList = "countBlocked, forgetTab, blocks, passiveMap";
  const bg = loadBackground({ chrome: mock.chrome, exports: exportsList });
  const m = (rulesetId, ruleId, t) => ({ rule: { rulesetId, ruleId }, tabId: 5, timeStamp: t });
  const first = [m("easyprivacy", 7, 1000), m("easyprivacy", 7, 1001), m("easylist", 9, 1002), m("_dynamic", 60001, 1003), m("easylist", 999, 1004)];
  await bg.countBlocked(5, first);
  await bg.countBlocked(5, first); // the same matches read again (the next badge refresh)
  await bg.countBlocked(5, first.concat([m("easylist", 9, 2000)]));
  await new Promise((r) => setTimeout(r, 1200)); // the 1 s write-behind
  const today = Object.values(mock.store.get("who") || {})[0] || {};
  ok(`SW: each match counted once, by company, unknown rules ignored (${JSON.stringify(today)})`, today.Google === 2 && today.Criteo === 2 && Object.keys(today).length === 2);
  ok("SW: …and the blocked total counts each one once (6 matches, read three times)", mock.store.get("blockedTotal") === 6);
  ok("SW: the maps come from the package (no network)", fetched.length >= 1 && fetched.every((u) => /^chrome-extension:\/\/test-ext\/rules\/(who|passive)\.json$/.test(u)));
  ok("SW: the last counted match of a tab survives a restart (storage.session)", session.get("seenMatches")["5"] === 2000);
  ok("SW: no counting state in memory (5.x kept the per-tab count in a Map and counted a page again after the worker slept)",
    !/const tabMatched = new Map/.test(readFileSync(join(ROOT, "background.js"), "utf8")));
  const pm = await bg.passiveMap();
  ok("blocks: a list's exception, the header rules and our allow rules are not blocks; a block rule is",
    !bg.blocks({ rulesetId: "easylist", ruleId: 50 }, pm) && !bg.blocks({ rulesetId: "gpc", ruleId: 1 }, pm) &&
    !bg.blocks({ rulesetId: "_dynamic", ruleId: 90000 }, pm) && !bg.blocks({ rulesetId: "_session", ruleId: 1 }, pm) &&
    bg.blocks({ rulesetId: "easylist", ruleId: 9 }, pm) && bg.blocks({ rulesetId: "_dynamic", ruleId: 60001 }, pm));
  await bg.forgetTab(5);
  await new Promise((r) => setTimeout(r, 20));
  ok("SW: a closed tab's mark is dropped", !("5" in (session.get("seenMatches") || {})));
  const r = await sendMessage(mock.listeners, { type: "getWho" });
  ok("getWho: the summary for Settings (supported where Chrome reports our blocks)",
    r && r.ok && r.supported === true && r.items.length === 2 && r.items[0].n === 2);
  const r2 = await sendMessage(mock.listeners, { type: "getWho" }, { id: "test-ext", url: "https://evil.example/", tab: { id: 1 } });
  ok("getWho: a web page cannot ask for it", r2 === undefined);
  await sendMessage(mock.listeners, { type: "resetStats" });
  ok("resetStats clears it too", JSON.stringify(mock.store.get("who")) === "{}");
}

// ---- wiring ----
const bgSrc = readFileSync(join(ROOT, "background.js"), "utf8");
ok("SW loads lib/who.js", /importScripts\([^)]*"lib\/who\.js"/.test(bgSrc));
ok("not part of a settings export/import (DEFAULTS has no who)", !/^\s+who:/m.test(bgSrc.slice(bgSrc.indexOf("const DEFAULTS"), bgSrc.indexOf("const SYNC_KEYS"))) && !/"who"/.test(readFileSync(join(ROOT, "options", "options.js"), "utf8")));
const html = readFileSync(join(ROOT, "options", "options.html"), "utf8");
ok("Settings: the card is hidden until the SW says it is supported, who.js after options.js",
  /<section class="card" id="whoCard" hidden>/.test(html) && html.indexOf('<script src="who.js">') > html.indexOf('<script src="options.js">'));
const pkg = readFileSync(join(ROOT, "tools", "package.sh"), "utf8");
ok("package.sh insists on lib/who.js, rules/who.json, options/who.js; Firefox loads lib/who.js",
  /refs\.add\("lib\/who\.js"\)/.test(pkg) && /refs\.add\("rules\/who\.json"\)/.test(pkg) && /refs\.add\("options\/who\.js"\)/.test(pkg) && /"lib\/who\.js", ("lib\/managed\.js", )?"background\.js"\]/.test(pkg));
const privacy = readFileSync(join(ROOT, "server", "privacy.html"), "utf8");
ok("the privacy policy describes it", /Who we stopped/.test(privacy));

done();
