// 5.2.0 — контрол: клавишни комбинации, „Разреши за 1 час“, отмяна на скритото с picker-а
// и внос от други блокери (uBlock Origin, AdGuard, Adblock Plus) — lib/foreign.js чете
// файла, service worker-ът проверява всичко отново.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { runInNewContext } from "node:vm";
import { ROOT, ok, done, loadBackground } from "./_harness.mjs";
import { makeChrome, sendMessage } from "./_chrome.mjs";

const manifest = JSON.parse(readFileSync(join(ROOT, "manifest.json"), "utf8"));
const en = JSON.parse(readFileSync(join(ROOT, "_locales", "en", "messages.json"), "utf8"));

// ---- manifest commands ----
const cmds = manifest.commands || {};
ok("manifest: three commands — this site on/off, pause, the picker", Object.keys(cmds).sort().join() === "pause,picker,toggle-site");
ok("every command description is a localised message that exists",
  Object.values(cmds).every((c) => /^__MSG_(\w+)__$/.test(c.description) && en[c.description.slice(6, -2)]));
const keys = Object.values(cmds).flatMap((c) => Object.values(c.suggested_key || {}));
ok("suggested keys: Alt+Shift on Windows/Linux, Ctrl+Shift (MacCtrl) on a Mac — Option+Shift types characters there",
  keys.length === 4 && Object.values(cmds).every((c) => !c.suggested_key || (/^Alt\+Shift\+[A-Z]$/.test(c.suggested_key.default) && /^MacCtrl\+Shift\+[A-Z]$/.test(c.suggested_key.mac))));
// Google Docs/Sheets/Slides open their menus with Alt+Shift+<letter> (F E V I O T H A N D X S R):
// an extension shortcut is browser-wide and would take those away
ok("no default key steals a Google Docs/Sheets/Slides menu (Alt+Shift+F/E/V/I/O/T/H/A/N/D/X/S/R)",
  !keys.some((k) => /\+(F|E|V|I|O|T|H|A|N|D|X|S|R)$/.test(k)));
// Chrome keeps these for itself and silently refuses them as suggested keys (measured in Chromium:
// Alt+Shift+B is "focus the bookmarks bar"), so the shortcut would just not exist
ok("no default key Chrome refuses (Alt+Shift+B/C/P/W/X/Z)", !keys.some((k) => /\+(B|C|P|W|X|Z)$/.test(k)));

// ---- the service worker ----
const mock = makeChrome({ storage: { enabled: true, allowlist: ["example.com"] } });
const reloaded = [], tabMsgs = [];
const commandListeners = [];
mock.chrome.tabs.reload = (id) => { reloaded.push(id); return Promise.resolve(); };
mock.chrome.tabs.sendMessage = (id, m) => { tabMsgs.push({ id, m }); return Promise.resolve(); };
mock.chrome.tabs.query = (q, cb) => { const r = [{ id: 9, url: "https://news.site.org/a" }]; if (cb) return cb(r); return Promise.resolve(r); };
mock.chrome.commands = { onCommand: { addListener: (f) => commandListeners.push(f) } };
const cleared = [];
mock.chrome.alarms.clear = (n) => { cleared.push(n); return Promise.resolve(true); };
globalThis.chrome = mock.chrome;
const bg = loadBackground({ chrome: mock.chrome, exports: "expireAllows, runCommand, setAllowHost, parseImportedList" });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
ok("onCommand is registered at the top level (MV3: listeners before the first await)", commandListeners.length === 1);

// ---- allow for an hour ----
let r = await sendMessage(mock.listeners, { type: "setAllow", host: "Shop.Example.org", allow: true, minutes: 60 });
const until = mock.store.get("allowUntil") || {};
ok("setAllow minutes:60 → in the allowlist with an expiry about an hour away",
  r && r.ok && mock.store.get("allowlist").includes("shop.example.org") && Math.abs(until["shop.example.org"] - (Date.now() + 3600000)) < 5000);
ok("…and the expiry alarm is armed for that moment", mock.calls.alarms.some((a) => a.name === "allow-expire" && Math.abs(a.info.when - until["shop.example.org"]) < 5000));
const st = await sendMessage(mock.listeners, { type: "getStats", tabUrl: "https://shop.example.org/cart" });
ok("getStats tells the popup how long the site stays allowed", st && st.allowed === true && st.allowedUntil === until["shop.example.org"]);
r = await sendMessage(mock.listeners, { type: "setAllow", host: "x".repeat(300) + ".com", allow: true, minutes: 60 });
ok("an invalid host is refused, nothing stored", r && r.ok === false && !Object.keys(mock.store.get("allowUntil")).some((h) => h.startsWith("xxx")));
r = await sendMessage(mock.listeners, { type: "setAllow", host: "long.example.net", allow: true, minutes: 100000 });
ok("a timer is capped at 24 hours", mock.store.get("allowUntil")["long.example.net"] <= Date.now() + 24 * 3600000 + 1000);

await bg.expireAllows(Date.now() + 3600000 + 1000);
ok("after the hour: the site is out of the allowlist and its timer gone",
  !mock.store.get("allowlist").includes("shop.example.org") && !("shop.example.org" in mock.store.get("allowUntil")));
ok("…a permanent entry stays, and so does a timer that has not run out",
  mock.store.get("allowlist").includes("example.com") && mock.store.get("allowlist").includes("long.example.net") && "long.example.net" in mock.store.get("allowUntil"));
ok("…the allowlist rules follow (no allowAllRequests rule for the expired site)",
  !mock.dynamic().some((x) => JSON.stringify(x.condition).includes("shop.example.org")));
await sendMessage(mock.listeners, { type: "setAllow", host: "long.example.net", allow: true });
ok("allowing it for good clears the timer", !("long.example.net" in mock.store.get("allowUntil")) && mock.store.get("allowlist").includes("long.example.net"));
await bg.expireAllows();
ok("no timer left → the alarm is cleared", cleared.includes("allow-expire"));

// a parent entry covers its subdomains, so "block here again" must take it out
await sendMessage(mock.listeners, { type: "setAllow", host: "news.example.com", allow: false });
ok("switching blocking back on for news.example.com removes the example.com entry that covered it",
  !mock.store.get("allowlist").includes("example.com"));

// ---- keyboard shortcuts ----
reloaded.length = 0;
await bg.runCommand("toggle-site", { id: 4, url: "https://www.blog.site.org/post" });
ok("toggle-site: the active site goes into the allowlist and the tab reloads", mock.store.get("allowlist").includes("blog.site.org") && reloaded.includes(4));
await bg.runCommand("toggle-site", { id: 4, url: "https://www.blog.site.org/post" });
ok("…pressed again: out again", !mock.store.get("allowlist").includes("blog.site.org"));
await bg.runCommand("toggle-site", { id: 5, url: "chrome://settings/" });
ok("…never on a browser page", !mock.store.get("allowlist").some((h) => h.includes("settings")) && !reloaded.includes(5));
await bg.runCommand("pause", { id: 4, url: "https://a.org/" });
ok("pause: protection pauses for 30 minutes", mock.store.get("pausedUntil") > Date.now() + 29 * 60000);
await bg.runCommand("pause", { id: 4, url: "https://a.org/" });
ok("…pressed again: resumes", !(mock.store.get("pausedUntil") > Date.now()));
await bg.runCommand("picker");
ok("picker: the element picker opens in the active tab (no tab passed → the active one)", tabMsgs.some((t) => t.id === 9 && t.m.type === "activatePicker"));

// ---- undo what the picker hid ----
mock.store.set("customHidden", { "news.site.org": [".a", ".b", ".c"], "other.org": [".x"] });
const s2 = await sendMessage(mock.listeners, { type: "getStats", tabUrl: "https://www.news.site.org/" });
ok("getStats counts what the picker hid on this site", s2 && s2.hiddenHere === 3);
r = await sendMessage(mock.listeners, { type: "undoHidden", host: "news.site.org" });
ok("undoHidden takes back the LAST one only", r && r.ok && r.left === 2 && mock.store.get("customHidden")["news.site.org"].join() === ".a,.b");
r = await sendMessage(mock.listeners, { type: "undoHidden", host: "news.site.org", all: true });
ok("…all:true clears the site; other sites keep theirs", r.left === 0 && !("news.site.org" in mock.store.get("customHidden")) && mock.store.get("customHidden")["other.org"].join() === ".x");
r = await sendMessage(mock.listeners, { type: "undoHidden", host: "other.org" }, { id: "test-ext", url: "https://other.org/", tab: { id: 2 }, frameId: 0 });
ok("a web page (content script) cannot undo anything", r === undefined && mock.store.get("customHidden")["other.org"].length === 1);

// ---- lib/foreign.js ----
const fsrc = readFileSync(join(ROOT, "lib", "foreign.js"), "utf8");
const sandbox = { URL };
runInNewContext(fsrc, sandbox);
const F = sandbox.ForeignImport;
const fcode = fsrc.split("\n").filter((l) => !/^\s*\/\//.test(l)).join("\n");
ok("foreign.js: no chrome.*, no network, no eval — it only splits text", !/chrome\.|fetch\(|XMLHttpRequest|eval\(|new Function/.test(fcode));

const ubo = JSON.stringify({
  timeStamp: 1, version: "1.60.0", userSettings: {}, selectedFilterLists: ["easylist"],
  whitelist: ["chrome-extension-scheme", "moz-extension-scheme", "about-scheme", "behind-the-scene", "www.bank.example", "https://shop.example/*",
    "https://forum.example/thread/1", "/^https?:\\/\\/re\\.example\\//", "*.wild.example"],
  userFilters: "! my rules\n||ads.tracker.example^\nnews.example##.promo\n||cdn.example/ads/*.js$script\nexample.org##+js(set-constant, x, 1)\n@@||video.example^$document",
});
let p = F.parse(ubo, "my-ublock-backup_2026-10-16_10.20.11.txt");
ok("uBO backup: trusted sites → hosts (www. dropped), schemes/paths/regexes left out",
  p.source === "ublock" && JSON.stringify(p.allowlist.slice().sort()) === JSON.stringify(["bank.example", "shop.example", "video.example", "wild.example"]));
ok("uBO backup: userFilters come through as lines, the $document exception became a site", p.filters.split("\n").length === 4 && !p.filters.includes("@@") && !p.filters.includes("! my rules"));
p = F.parse(JSON.stringify({ timeStamp: 1, userFilters: "", netWhitelist: "a.example\nbehind-the-scene\nb.example" }));
ok("old uBO backup (netWhitelist as text)", p.source === "ublock" && p.allowlist.join() === "a.example,b.example");

const ag = JSON.stringify({
  "protocol-version": "1.0",
  filters: {
    "enabled-filters": [1, 2],
    "user-filter": { rules: "||ag.ads.example^\nsite.example##.banner\n||off.example^", "disabled-rules": "||off.example^", enabled: true },
    whitelist: { inverted: false, domains: ["allowed.example", "bad host", "www.two.example"], "inverted-domains": [], enabled: true },
  },
});
p = F.parse(ag, "settings.json");
ok("AdGuard export: user rules (minus the disabled ones) and the allowlist", p.source === "adguard" &&
  p.filters === "||ag.ads.example^\nsite.example##.banner" && p.allowlist.join() === "allowed.example,two.example");
p = F.parse(JSON.stringify({ filters: { "user-filter": { rules: "x.example", enabled: false }, whitelist: { inverted: true, domains: ["only.example"] } } }));
ok("AdGuard: a switched-off rule set and an INVERTED allowlist (block only there) bring nothing", p.source === "adguard" && !p.filters && !p.allowlist.length);

const abp = "# Adblock Plus preferences\nversion=5\n\n[Subscription]\nurl=https://easylist-downloads.adblockplus.org/easylist.txt\ntitle=EasyList\n\n[Subscription filters]\n! own\n||abp.ads.example^\n@@||friend.example^$document\n\\[weird]##.x\n\n[Subscription]\nurl=~user~1\n";
p = F.parse(abp, "adblockplus-backup.txt");
ok("ABP backup: only the user's own filters; key=value lines and list URLs left out; \\[ unescaped",
  p.source === "abp" && p.filters === "||abp.ads.example^\n[weird]##.x" && p.allowlist.join() === "friend.example");

p = F.parse("example.com\nwww.second.example\n# comment\nbehind-the-scene", "my-ublock-trusted-sites_2026.txt");
ok("a trusted-sites export (only sites) is read as sites to ALLOW, never as domains to block",
  p.allowlist.join() === "example.com,second.example" && !p.filters);
p = F.parse("example.com\nsecond.example", "my-filters.txt");
ok("…the same lines in a file named as filters are filters", !p.allowlist.length && p.filters === "example.com\nsecond.example");
p = F.parse("[Adblock Plus 2.0]\n! Title: mine\n||x.example^\n@@||y.example^$document,domain=z.example\n@@||w.example^$elemhide");
ok("plain filter text: a $document exception limited by domain= or a cosmetic-only exception is not a site",
  !p.allowlist.length && p.filters.split("\n").length === 3);
ok("unknown JSON / empty / too large → an error, nothing imported",
  F.parse('{"a":1}').error === "unknown" && F.parse("  ").error === "empty" && F.parse("x".repeat(10 * 1024 * 1024 + 1)).error === "too-large" && F.parse("{oops").error === "unknown");
ok("IDN hosts → punycode, a port is dropped", F.siteOf("https://пример.бг:8443/") === "xn--e1afmkfd.xn--90ae" && F.siteOf("http://a.example:80/*") === "a.example");

// ---- importForeign in the SW ----
mock.store.set("allowlist", ["kept.example"]);
mock.store.set("userFilters", "mine.example");
const parsed = F.parse(ubo, "my-ublock-backup.txt");
r = await sendMessage(mock.listeners, { type: "importForeign", allowlist: parsed.allowlist.concat(["not a host", "kept.example", "WWW.Upper.Example"]), filters: parsed.filters + "\nmine.example" });
const af = mock.store.get("allowlist"), uf = mock.store.get("userFilters").split("\n");
ok(`importForeign: the sites are added after the user's own, invalid ones dropped (${JSON.stringify(r)})`,
  r && r.ok && af[0] === "kept.example" && af.includes("bank.example") && af.includes("upper.example") && !af.includes("not a host") && r.sites === 5);
ok("…a whole-domain block and a safe ##selector are taken, the user's own lines stay first",
  uf[0] === "mine.example" && uf.includes("ads.tracker.example") && uf.includes("news.example##.promo"));
ok("…a path rule is NOT widened into blocking its whole domain, a scriptlet is not taken",
  !uf.includes("cdn.example") && !uf.some((l) => l.includes("+js(")) && r.filters === 2 && r.skipped === 2);
ok("…the allowlist and user rules are re-synced (allowAllRequests for an imported site)",
  mock.dynamic().some((x) => x.action.type === "allowAllRequests" && JSON.stringify(x.condition).includes("bank.example")));
r = await sendMessage(mock.listeners, { type: "importForeign", allowlist: ["bank.example"], filters: "ads.tracker.example" }, { id: "test-ext", url: "https://evil.example/", tab: { id: 1 }, frameId: 0 });
ok("a web page (content script) cannot import anything", r === undefined);

// ---- the options page and the report page wire it up ----
const opt = readFileSync(join(ROOT, "options", "options.html"), "utf8");
const optJs = readFileSync(join(ROOT, "options", "options.js"), "utf8");
ok("Settings: the GPC switch, the 30-day chart, the shortcuts card and the import button", ["featGpc", "daysChart", "keysList", "foreignBtn"].every((id) => opt.includes(`id="${id}"`)) && opt.includes("../lib/foreign.js"));
ok("Settings: the GPC switch is saved with the other features", /gpc: \$\("featGpc"\)\.checked/.test(optJs));
const rep = readFileSync(join(ROOT, "report", "report.js"), "utf8");
ok("the repair page offers “Allow ads here for 1 hour” (minutes: 60)", /type: "setAllow", host, allow: true, minutes: 60/.test(rep));
const content = readFileSync(join(ROOT, "content.js"), "utf8");
ok("content.js gives back what a rule taken back had hidden, without a reload", /revealGone\(before\)/.test(content));

done();
