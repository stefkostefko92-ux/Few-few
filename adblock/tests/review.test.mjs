// Молбата за отзив в Chrome Web Store (5.1.8): кога картата идва (≥ 7 дни, ≥ 1000 блокирани, най-много
// 2 пъти през ≥ 60 дни, само при работеща защита), кой магазин получава линк, че „край“ е завинаги, че
// Настройки махат всичко и че content script не може да пипа нищо от това.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { ROOT, ok, done, loadBackground } from "./_harness.mjs";
import { makeChrome, sendMessage } from "./_chrome.mjs";

const DAY = 86400000;
const now = Date.now();
// файловете на пакета — от диска; нищо навън (filters.json → 404)
globalThis.fetch = async (url) => {
  const m = /^chrome-extension:\/\/test-ext\/(.+)$/.exec(String(url));
  if (!m) return { ok: false, status: 404, text: async () => "", json: async () => { throw new Error("404"); } };
  const body = readFileSync(join(ROOT, m[1]), "utf8");
  return { ok: true, status: 200, text: async () => body, json: async () => JSON.parse(body) };
};
const mock = makeChrome({ storage: { enabled: true, allowlist: ["allowed.example"], blockedTotal: 0 } });
globalThis.chrome = mock.chrome;
const bg = loadBackground({ chrome: mock.chrome, exports: "reviewUrl, reviewDue, REVIEW_URL, SYNC_KEYS, DEFAULTS" });

// ---------- 1) кой магазин има наша страница ----------
const CWS = "https://clients2.google.com/service/update2/crx";
ok("review link is our listing's reviews page", /^https:\/\/chromewebstore\.google\.com\/detail\/supreme-adblock\/chbjbiabkgocfbbfhednpbhfeipjcclk\/reviews$/.test(bg.REVIEW_URL));
ok("Chrome Web Store install → link", bg.reviewUrl({ manifest_version: 3, update_url: CWS }) === bg.REVIEW_URL);
ok("unpacked (no update_url) → link, so it can be tested", bg.reviewUrl({ manifest_version: 3 }) === bg.REVIEW_URL);
ok("Edge Add-ons install → no link (no wrong store)", bg.reviewUrl({ update_url: "https://edge.microsoft.com/extensionwebstorebase/v1/crx" }) === null);
ok("Firefox build → no link", bg.reviewUrl({ browser_specific_settings: { gecko: { id: "x@y" } } }) === null);

// ---------- 2) правилата ----------
const base = { installedAt: now - 8 * DAY, blockedTotal: 5000 };
ok("asks after ≥ 7 days and ≥ 1000 blocked", bg.reviewDue(base, now) === true);
ok("not in the first 7 days", bg.reviewDue({ ...base, installedAt: now - 6 * DAY }, now) === false);
ok("not without an install date", bg.reviewDue({ blockedTotal: 5000 }, now) === false);
ok("not below 1000 blocked", bg.reviewDue({ ...base, blockedTotal: 999 }, now) === false);
ok("not when switched off in Settings", bg.reviewDue({ ...base, reviewAsk: false }, now) === false);
ok("never again after „done“", bg.reviewDue({ ...base, review: { never: true } }, now) === false);
ok("second ask only ≥ 60 days after the first", bg.reviewDue({ ...base, review: { count: 1, last: now - 59 * DAY } }, now) === false && bg.reviewDue({ ...base, review: { count: 1, last: now - 60 * DAY } }, now) === true);
ok("at most twice, ever", bg.reviewDue({ ...base, review: { count: 2, last: now - 400 * DAY } }, now) === false);
ok("a malformed stored state cannot force an ask", bg.reviewDue({ ...base, review: "x", installedAt: "yesterday" }, now) === false);

// ---------- 3) getStats → popup / options ----------
const stats = (tabUrl) => sendMessage(mock.listeners, { type: "getStats", tabUrl }, { id: "test-ext", url: "chrome-extension://test-ext/popup/popup.html" });
mock.store.set("installedAt", now - 8 * DAY); mock.store.set("blockedTotal", 5000);
let s = await stats("https://news.example/a");
ok("getStats: review {url, on, ask} for the popup", s && s.review && s.review.url === bg.REVIEW_URL && s.review.on === true && s.review.ask === true);
ok("no card on a new tab / chrome:// page / without a page (protection does not run there)",
  (await stats("chrome://newtab/")).review.ask === false && (await stats("about:blank")).review.ask === false && (await stats("")).review.ask === false);
s = await stats("https://allowed.example/a");
ok("no card on an allowlisted site (protection is not running there)", s.review.ask === false && s.review.url === bg.REVIEW_URL);
mock.store.set("enabled", false); mock.store.set("pausedUntil", now + 20 * 60000);
s = await stats("https://news.example/a");
ok("no card while paused / off", s.review.ask === false);
mock.store.set("enabled", true); mock.store.set("pausedUntil", 0);
mock.chrome.runtime.getManifest = () => ({ manifest_version: 3, update_url: "https://edge.microsoft.com/extensionwebstorebase/v1/crx" });
s = await stats("https://news.example/a");
ok("Edge Add-ons: no link, no card (options hide the switch)", s.review.url === null && s.review.ask === false);
mock.chrome.runtime.getManifest = () => ({ manifest_version: 3, update_url: CWS });

// ---------- 4) показана / край ----------
await sendMessage(mock.listeners, { type: "review", action: "shown" });
let rv = mock.store.get("review");
ok("„shown“ counts the ask and stamps it", rv && rv.count === 1 && Math.abs(rv.last - Date.now()) < 5000 && !rv.never);
s = await stats("https://news.example/a");
ok("…so the next popup does not ask again", s.review.ask === false && s.review.on === true);
mock.store.set("review", {});
await Promise.all([sendMessage(mock.listeners, { type: "review", action: "shown" }), sendMessage(mock.listeners, { type: "review", action: "done" })]);
rv = mock.store.get("review");
ok("„shown“ + „done“ at once: both kept (serialised writes)", rv.count === 1 && rv.never === true);
ok("unknown action is ignored", (await sendMessage(mock.listeners, { type: "review", action: "reset" })) === undefined && mock.store.get("review").never === true);

// ---------- 5) ключът в Настройки ----------
mock.store.set("review", {});
await sendMessage(mock.listeners, { type: "setReviewAsk", on: false });
s = await stats("https://news.example/a");
ok("Settings off → no ★, no card (popup checks `on`)", mock.store.get("reviewAsk") === false && s.review.on === false && s.review.ask === false);
await sendMessage(mock.listeners, { type: "setReviewAsk", on: true });
ok("Settings on again → back", (await stats("https://news.example/a")).review.on === true);
ok("the switch is a synced setting and has a default", bg.SYNC_KEYS.includes("reviewAsk") && bg.DEFAULTS.reviewAsk === true);
await sendMessage(mock.listeners, { type: "importSettings", data: { reviewAsk: "no" } });
ok("import: a non-boolean reviewAsk is refused", mock.store.get("reviewAsk") === true);
await sendMessage(mock.listeners, { type: "importSettings", data: { reviewAsk: false, review: { never: true }, installedAt: 1 } });
ok("import: reviewAsk restored; the ask history and install date are never imported", mock.store.get("reviewAsk") === false && !mock.store.get("review").never && mock.store.get("installedAt") > 1);

// ---------- 6) сайтът не може да пипа това ----------
const page = { id: "test-ext", url: "https://evil.example/page", tab: { id: 5 } };
mock.store.set("review", {}); mock.store.set("reviewAsk", true);
ok("content script cannot mark the review done, count asks or switch it off",
  (await sendMessage(mock.listeners, { type: "review", action: "done" }, page)) === undefined &&
  (await sendMessage(mock.listeners, { type: "review", action: "shown" }, page)) === undefined &&
  (await sendMessage(mock.listeners, { type: "setReviewAsk", on: false }, page)) === undefined &&
  !mock.store.get("review").never && !mock.store.get("review").count && mock.store.get("reviewAsk") === true);

// ---------- 7) датата на инсталация ----------
// същият service worker, празно хранилище (background.js чете глобалния chrome при всяко извикване)
const fresh = makeChrome({ storage: {} });
globalThis.chrome = fresh.chrome;
await mock.listeners.installed[0]({ reason: "install" });
const at = fresh.store.get("installedAt");
ok("install stamps installedAt (and reviewAsk defaults on)", at > 0 && Math.abs(at - Date.now()) < 5000 && fresh.store.get("reviewAsk") === true);
fresh.store.set("installedAt", 1234);
await mock.listeners.installed[0]({ reason: "update" });
ok("an update keeps the original install date", fresh.store.get("installedAt") === 1234);
fresh.store.delete("installedAt");
await mock.listeners.installed[0]({ reason: "update" });
ok("updating from a version without it starts the 7 days now", Math.abs(fresh.store.get("installedAt") - Date.now()) < 5000);

done();
