// „Връзки на страницата“: popup-ът показва другите сайтове, от които страницата е заредила
// нещо (content.js чете Resource Timing), и „Блокирай тук“ блокира един хост само на този сайт —
// едно DNR правило на сайт, initiatorDomains = сайтът, приоритет над изключенията в листите,
// под разрешен сайт и пауза. Синхронизира се и се изнася/внася с проверка на формата.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { ROOT, ok, done, loadBackground } from "./_harness.mjs";
import { makeChrome, sendMessage } from "./_chrome.mjs";

const mock = makeChrome({ storage: { enabled: true } });
globalThis.chrome = mock.chrome;
const bg = loadBackground({ chrome: mock.chrome, exports: "syncSiteBlocks, cleanSiteBlocks, logListKey, SYNC_KEYS, DEFAULTS" });
const rulesOf = () => mock.dynamic().filter((r) => r.id >= 60000 && r.id < 62000);

let r = await sendMessage(mock.listeners, { type: "siteBlock", site: "www.News.example.org", host: "Tracker.Third.net", block: true });
ok("block a host on a site → stored under the site (www. dropped, lowercase)", r && r.ok && JSON.stringify(mock.store.get("siteBlocks")) === '{"news.example.org":["tracker.third.net"]}' && r.hosts.join() === "tracker.third.net");
let rule = rulesOf()[0];
ok("…one DNR block rule for that site: its initiator, that host, every subresource type but never the page itself",
  rulesOf().length === 1 && rule.action.type === "block" && rule.condition.initiatorDomains.join() === "news.example.org" &&
  rule.condition.requestDomains.join() === "tracker.third.net" && ["script", "image", "xmlhttprequest", "sub_frame", "websocket"].every((t) => rule.condition.resourceTypes.includes(t)) &&
  !rule.condition.resourceTypes.includes("main_frame"));
ok("…priority 5000: above the lists' own exceptions (≤ 5), below an allowed site (10000), the YouTube bypass and a pause", rule.priority === 5000);

await sendMessage(mock.listeners, { type: "siteBlock", site: "news.example.org", host: "cdn.ads.net", block: true });
await sendMessage(mock.listeners, { type: "siteBlock", site: "shop.example.com", host: "tracker.third.net", block: true });
ok("a second host on the same site joins its rule; another site gets its own", rulesOf().length === 2 &&
  rulesOf().find((x) => x.condition.initiatorDomains[0] === "news.example.org").condition.requestDomains.join() === "tracker.third.net,cdn.ads.net");

const st = await sendMessage(mock.listeners, { type: "getStats", tabUrl: "https://www.news.example.org/article" });
ok("getStats tells the popup what is blocked on this site", st && st.siteBlocked.join() === "tracker.third.net,cdn.ads.net");

for (const [what, m] of [["the site itself", { site: "news.example.org", host: "news.example.org" }], ["an invalid host", { site: "news.example.org", host: "not a host" }],
  ["an invalid site", { site: "<script>", host: "x.example.net" }]]) {
  r = await sendMessage(mock.listeners, { type: "siteBlock", ...m, block: true });
  ok(`refused: ${what}`, r && r.ok === false);
}
r = await sendMessage(mock.listeners, { type: "siteBlock", site: "news.example.org", host: "www.gstatic.com", block: true });
ok("a protected host (core CDNs the web needs) is never blocked this way", r && r.ok === false && r.reason === "protected");
r = await sendMessage(mock.listeners, { type: "siteBlock", site: "news.example.org", host: "x.example.net", block: true }, { id: "test-ext", url: "https://news.example.org/", tab: { id: 3 }, frameId: 0 });
ok("a web page (content script) cannot block or unblock anything", r === undefined && !mock.store.get("siteBlocks")["news.example.org"].includes("x.example.net"));

for (let i = 0; i < 120; i++) await sendMessage(mock.listeners, { type: "siteBlock", site: "big.example.org", host: `h${i}.cdn.net`, block: true });
ok("at most 100 hosts per site", mock.store.get("siteBlocks")["big.example.org"].length === 100);

r = await sendMessage(mock.listeners, { type: "siteBlock", site: "news.example.org", host: "tracker.third.net", block: false });
ok("unblock takes it out of the site's rule", r.ok && r.hosts.join() === "cdn.ads.net" && rulesOf().find((x) => x.condition.initiatorDomains[0] === "news.example.org").condition.requestDomains.join() === "cdn.ads.net");
await sendMessage(mock.listeners, { type: "siteBlock", site: "news.example.org", host: "cdn.ads.net", block: false });
ok("…the last one gone → the site and its rule are gone", !("news.example.org" in mock.store.get("siteBlocks")) && !rulesOf().some((x) => x.condition.initiatorDomains[0] === "news.example.org"));

// sync, export/import with a checked shape
ok("siteBlocks syncs with the other settings", bg.SYNC_KEYS.includes("siteBlocks") && JSON.stringify(bg.DEFAULTS.siteBlocks) === "{}");
const clean = bg.cleanSiteBlocks({ "Good.example.org": ["A.cdn.net", "a.cdn.net", "bad host", "good.example.org", "www.gstatic.com", 7], "<x>": ["a.net"], "list.example": "not a list", "e.example": [] });
ok(`import: only valid sites and hosts, no duplicates, never the site itself or a protected host (${JSON.stringify(clean)})`, JSON.stringify(clean) === '{"good.example.org":["a.cdn.net"]}');
await sendMessage(mock.listeners, { type: "importSettings", data: { siteBlocks: { "imp.example.org": ["x.tracker.net"], "__proto__": ["y.net"] } } });
ok("importSettings applies the checked map and its rules", JSON.stringify(mock.store.get("siteBlocks")) === '{"imp.example.org":["x.tracker.net"]}' && rulesOf().length === 1 && rulesOf()[0].condition.initiatorDomains[0] === "imp.example.org");
ok("Settings exports it", /EXPORT_KEYS = \[[^\]]*"siteBlocks"/.test(readFileSync(join(ROOT, "options", "options.js"), "utf8")));

// the popup's log: a site block counts as "your filters"; "Continue anyway" (session allow) counts as nothing
ok("log: a site block is listed as the user's own rule", bg.logListKey({ rulesetId: "_dynamic", ruleId: 60000 }) === "user");
ok("log: the warning page counts as malware blocked; “Continue anyway” is not a block", bg.logListKey({ rulesetId: "_dynamic", ruleId: 69000 }) === "malware" && bg.logListKey({ rulesetId: "_session", ruleId: 1 }) === null);

// content.js answers only our popup, only in the top frame, from Resource Timing
const content = readFileSync(join(ROOT, "content.js"), "utf8");
ok("content.js: the connections come from Resource Timing, top frame only, the site's own hosts left out",
  /if \(window === window\.top\) \{\s*chrome\.runtime\.onMessage\.addListener/.test(content) && /performance\.getEntriesByType\("resource"\)/.test(content) && /baseOf\(h\) === baseHost/.test(content));
const popup = readFileSync(join(ROOT, "popup", "popup.js"), "utf8");
ok("popup asks the page only when the box is opened, top frame only", /addEventListener\("toggle"/.test(popup) && /\{ frameId: 0 \}/.test(popup));

done();
