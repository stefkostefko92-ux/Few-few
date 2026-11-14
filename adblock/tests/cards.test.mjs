// 5.6 — двете редки карти в popup-а и „Сподели“: „Сайтовете се чупят?“ (веднъж, при признаци: ≥ 3 разрешени
// сайта, скриване изключено на ≥ 2 сайта, ≥ 3 паузи за 7 дни), месечната разписка (веднъж на календарен
// месец, от дневните броячи за 30 дни, данните — приблизително) и чистият адрес на листинга. Картата за
// отзив не се пипа: признаците за счупени сайтове НЕ влизат в reviewDue (без филтър по мнение), а popup-ът
// показва най-много една карта на отваряне, отзивът с предимство.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { ROOT, ok, done, loadBackground } from "./_harness.mjs";
import { makeChrome, sendMessage } from "./_chrome.mjs";

const DAY = 86400000;
const now = Date.now();
globalThis.fetch = async (url) => {
  const m = /^chrome-extension:\/\/test-ext\/(.+)$/.exec(String(url));
  if (!m) return { ok: false, status: 404, text: async () => "", json: async () => { throw new Error("404"); } };
  const body = readFileSync(join(ROOT, m[1]), "utf8");
  return { ok: true, status: 200, text: async () => body, json: async () => JSON.parse(body) };
};
const mock = makeChrome({ storage: { enabled: true, allowlist: [], blockedTotal: 0 } });
globalThis.chrome = mock.chrome;
const bg = loadBackground({ chrome: mock.chrome, exports: "helpDue, receiptOf, reviewDue, monthKey, dayKey" });

// ---------- 1) „Сайтовете се чупят?“ ----------
ok("no signs → no help card", bg.helpDue({ allowlist: ["a.example", "b.example"], noCosmetics: ["c.example"] }, now) === false);
ok("3 allowed sites → help card", bg.helpDue({ allowlist: ["a.example", "b.example", "c.example"] }, now) === true);
ok("element hiding off on 2 sites → help card", bg.helpDue({ noCosmetics: ["a.example", "b.example"] }, now) === true);
ok("3 pauses in the last 7 days → help card; older ones do not count",
  bg.helpDue({ pauseLog: [now - DAY, now - 2 * DAY, now - 3 * DAY] }, now) === true &&
  bg.helpDue({ pauseLog: [now - DAY, now - 2 * DAY, now - 8 * DAY] }, now) === false);
ok("shown once or never → not again", bg.helpDue({ allowlist: ["a", "b", "c"], helpCard: { shown: true } }, now) === false &&
  bg.helpDue({ allowlist: ["a", "b", "c"], helpCard: { never: true } }, now) === false);
ok("a malformed stored state cannot force it", bg.helpDue({ allowlist: "abc", noCosmetics: 7, pauseLog: "x", helpCard: "y" }, now) === false);

// ---------- 2) месечната разписка ----------
const daily = {};
for (let i = 0; i < 40; i++) daily[bg.dayKey(now - i * DAY)] = { b: 10, c: 1 };
const st = { daily, installedAt: now - 60 * DAY, blockedTotal: 1000, savedBytes: 1000 * 50 * 1024 };
let r = bg.receiptOf(st, now);
ok(`receipt sums the last 30 days only (${r.blocked} blocked, ${r.cookies} banners)`, r.blocked === 300 && r.cookies === 30);
ok(`…and estimates the data from the average blocked request (${r.mb.toFixed(2)} MB)`, Math.abs(r.mb - (300 * 50) / 1024) < 1e-9);
ok("due: installed ≥ 25 days ago, ≥ 7 days recorded, ≥ 100 blocked, not shown this month", r.due === true);
ok("already shown this month → not again; next month → again",
  bg.receiptOf({ ...st, receipt: { month: bg.monthKey(now) } }, now).due === false &&
  bg.receiptOf({ ...st, receipt: { month: "2000-01" } }, now).due === true);
ok("never → never", bg.receiptOf({ ...st, receipt: { never: true } }, now).due === false);
ok("too new, too few days or too few blocks → not due",
  bg.receiptOf({ ...st, installedAt: now - 10 * DAY }, now).due === false &&
  bg.receiptOf({ ...st, daily: { [bg.dayKey(now)]: { b: 500, c: 0 } } }, now).due === false &&
  bg.receiptOf({ ...st, daily: Object.fromEntries(Object.keys(daily).map((k) => [k, { b: 1, c: 0 }])) }, now).due === false);
ok("garbage in the daily totals is ignored", bg.receiptOf({ ...st, daily: { "x": { b: 1e9 }, [bg.dayKey(now)]: "y", [bg.dayKey(now - DAY)]: { b: "7" } } }, now).blocked === 7);

// ---------- 3) пауза → запис (само кога), не повече от 10, само 7 дни ----------
mock.store.set("pauseLog", [now - 9 * DAY, now - DAY]);
await sendMessage(mock.listeners, { type: "pause", minutes: 30 });
const log = mock.store.get("pauseLog");
ok(`a pause stores its time only, last 7 days (${log.length} entries)`, Array.isArray(log) && log.length === 2 && log.every((t) => typeof t === "number" && now - t < 7 * DAY + 5000));
await sendMessage(mock.listeners, { type: "resume" });

// ---------- 4) getStats → popup ----------
const stats = (tabUrl) => sendMessage(mock.listeners, { type: "getStats", tabUrl }, { id: "test-ext", url: "chrome-extension://test-ext/popup/popup.html" });
mock.store.set("allowlist", ["a.example", "b.example", "c.example"]);
let s = await stats("https://news.example/a");
ok("getStats: help.ask on a website when there are signs", s && s.help && s.help.ask === true);
ok("…not on a new tab (the button opens the fixes for a site)", (await stats("chrome://newtab/")).help.ask === false);
ok("getStats: receipt {ask, blocked, cookies, mb}", s.receipt && typeof s.receipt.ask === "boolean" && typeof s.receipt.blocked === "number" && typeof s.receipt.mb === "number");
ok("getStats: shareUrl is the clean listing address (no parameters) on a Chrome Web Store / unpacked install",
  s.shareUrl === "https://chromewebstore.google.com/detail/supreme-adblock/chbjbiabkgocfbbfhednpbhfeipjcclk");
mock.chrome.runtime.getManifest = () => ({ manifest_version: 3, update_url: "https://edge.microsoft.com/extensionwebstorebase/v1/crx" });
ok("…and none from another store", (await stats("https://news.example/a")).shareUrl === null);
mock.chrome.runtime.getManifest = () => ({ manifest_version: 3 });

// ---------- 5) показана / никога ----------
mock.store.set("pauseLog", [now - 9 * DAY, now - DAY]);
await stats("https://news.example/a");
await new Promise((r) => setTimeout(r, 30));
ok("pause times older than 7 days go when they are read", mock.store.get("pauseLog").length === 1);
await sendMessage(mock.listeners, { type: "card", card: "help", action: "shown" });
ok("help shown → stored, not asked again", mock.store.get("helpCard").shown === true && (await stats("https://news.example/a")).help.ask === false);
ok("…and the pause times are deleted (they served only this card)", !mock.store.has("pauseLog"));
await sendMessage(mock.listeners, { type: "pause", minutes: 30 });
ok("…and no longer recorded after it", !mock.store.has("pauseLog"));
await sendMessage(mock.listeners, { type: "resume" });
mock.store.set("pauseLog", [now]);
await sendMessage(mock.listeners, { type: "resetStats" });
ok("Settings → Reset statistics clears the pause times too", JSON.stringify(mock.store.get("pauseLog")) === "[]");
await Promise.all([sendMessage(mock.listeners, { type: "card", card: "receipt", action: "shown" }), sendMessage(mock.listeners, { type: "card", card: "receipt", action: "never" })]);
const rc = mock.store.get("receipt");
ok("receipt shown + never at once: both kept (serialised writes)", rc.month === bg.monthKey(Date.now()) && rc.never === true);
ok("unknown card or action is ignored", (await sendMessage(mock.listeners, { type: "card", card: "review", action: "shown" })) === undefined &&
  (await sendMessage(mock.listeners, { type: "card", card: "help", action: "reset" })) === undefined);
ok("a web page (content script) cannot set a card", (await sendMessage(mock.listeners, { type: "card", card: "help", action: "never" }, { id: "test-ext", url: "https://evil.example/", tab: { id: 3 }, frameId: 0 })) === undefined);

// ---------- 6) отзивът не зависи от признаците (без филтър по мнение) ----------
const base = { installedAt: now - 8 * DAY, blockedTotal: 5000 };
ok("reviewDue is the same with or without breakage signs",
  bg.reviewDue(base, now) === bg.reviewDue({ ...base, allowlist: ["a", "b", "c"], noCosmetics: ["x", "y"], pauseLog: [now, now, now] }, now));
const src = readFileSync(join(ROOT, "background.js"), "utf8");
const reviewFn = (src.match(/function reviewDue\([\s\S]*?\n\}/) || [""])[0];
ok("reviewDue does not read the help/receipt state", reviewFn.length > 0 && !/helpCard|pauseLog|noCosmetics|receipt/.test(reviewFn));
const popup = readFileSync(join(ROOT, "popup", "popup.js"), "utf8");
ok("popup: one card per opening, review first", /function showCard\(res\) \{\s*if \(sheetShown\) return;\s*const rv = res\.review;\s*if \(rv && rv\.url && rv\.on && rv\.ask\) return showReviewCard/.test(popup));

done();
