// 5.6 с истинското разширение в реален Chromium (Playwright): картата „Сайтовете се чупят?“ (веднъж, при
// признаци; „Поправи този сайт“ отваря страницата за поправки на сайта), месечната разписка (числа и „около“),
// най-много една карта на отваряне с предимство за отзива, „Сподели“ (копира чистия адрес на листинга),
// „Поправи ли се?“ в страницата за поправки (следващата поправка, редът „Tried“ в доклада, видимият адрес)
// и „Мислите, че е грешка?“ на страницата-предупреждение.
// Не е в `npm test` (CI няма Playwright) — `PW_ROOT=$(npm root -g) npm run test:browser`.
import { createRequire } from "node:module";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import http from "node:http";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const require = createRequire(join(process.env.PW_ROOT || join(ROOT, "node_modules"), "/"));
let chromium;
try { ({ chromium } = require("playwright")); } catch {
  console.log("SKIP: playwright not available (PW_ROOT)"); process.exit(process.env.PW_REQUIRED ? 1 : 0);
}

let pass = 0, fail = 0;
const ok = (name, cond) => { console.log(`  ${cond ? "PASS" : "FAIL"} ${name}`); cond ? pass++ : fail++; };
const DAY = 86400000;

const srv = http.createServer((q, r) => { r.setHeader("content-type", "text/html"); r.end("<!doctype html><title>news</title><p>news</p>"); });
await new Promise((r) => srv.listen(0, "127.0.0.1", r));
const profile = mkdtempSync(join(tmpdir(), "sa-cards-"));
const ctx = await chromium.launchPersistentContext(profile, {
  channel: "chromium", headless: true,
  args: ["--no-sandbox", `--disable-extensions-except=${ROOT}`, `--load-extension=${ROOT}`, "--host-resolver-rules=MAP chromewebstore.google.com ~NOTFOUND"],
});
try {
  const sw = ctx.serviceWorkers()[0] || await ctx.waitForEvent("serviceworker", { timeout: 20000 });
  await new Promise((r) => setTimeout(r, 2000));
  const id = sw.url().split("/")[2];
  const set = (o) => sw.evaluate((x) => chrome.storage.local.set(x), o);
  const get = (k) => sw.evaluate((x) => chrome.storage.local.get(x), k);
  const site = await ctx.newPage(); await site.goto(`http://127.0.0.1:${srv.address().port}/news`);
  // loaded ONCE, with the site as the active tab (as if opened from the toolbar over it): a card counts on its first showing
  const popup = async () => {
    const p = await ctx.newPage(); await p.setViewportSize({ width: 320, height: 600 });
    await site.bringToFront();
    await p.goto(`chrome-extension://${id}/popup/popup.html`); await p.waitForTimeout(800);
    return p;
  };
  const shown = (p) => p.evaluate(() => ["review", "help", "receipt"].filter((x) => !document.getElementById(x).hidden));

  // review never due in this profile unless we say so
  await set({ review: { never: true }, enabled: true, pausedUntil: 0, allowlist: [], noCosmetics: [], pauseLog: [], helpCard: {}, receipt: { never: true } });

  // ---- 1) no signs → no card ----
  let p = await popup();
  ok("no breakage signs: no card", (await shown(p)).length === 0);
  await p.close();

  // ---- 2) three pauses this week → „Sites breaking?“ once ----
  await set({ pauseLog: [Date.now() - DAY, Date.now() - 2 * DAY, Date.now() - 3 * DAY] });
  p = await popup();
  ok(`3 pauses in 7 days: the help card (${(await shown(p)).join(",")})`, (await shown(p)).join() === "help");
  const inert = await p.evaluate(() => [...document.querySelectorAll("[inert]")].map((e) => e.className || e.id));
  ok(`…covered blocks are inert (${inert.join(", ")})`, inert.includes("actions") && inert.some((x) => /foot/.test(x)));
  ok("…and it is counted as shown, and the pause times are gone", (await get("helpCard")).helpCard.shown === true && !(await get("pauseLog")).pauseLog);
  const reportPage = ctx.waitForEvent("page", { timeout: 5000 });
  await p.click("#helpGo");
  const rep = await reportPage; await rep.waitForLoadState();
  ok(`„Fix this site“ opens the repair page for that tab (${rep.url().replace(/^.*\/report\//, "report/")})`, /\/report\/report\.html\?tab=\d+$/.test(rep.url()));
  await rep.close();
  p = await popup();
  ok("shown once: not again", (await shown(p)).length === 0);
  await p.close();

  // ---- 3) the review card wins; at most one card per opening ----
  // (showing the help card deleted the pause times — they served only it; seed them again)
  await set({ helpCard: {}, pauseLog: [Date.now() - DAY, Date.now() - 2 * DAY, Date.now() - 3 * DAY], review: {}, reviewAsk: true, installedAt: Date.now() - 40 * DAY, blockedTotal: 54321 });
  p = await popup();
  ok(`review due + help due: only the review card (${(await shown(p)).join(",")})`, (await shown(p)).join() === "review");
  await p.close();
  p = await popup();
  ok(`next opening: the help card (${(await shown(p)).join(",")})`, (await shown(p)).join() === "help");
  await p.click("#helpNever"); await p.waitForTimeout(400);
  ok("„Don't show this again“ stores never and closes it", (await get("helpCard")).helpCard.never === true && (await shown(p)).length === 0);
  await p.close();

  // ---- 4) monthly receipt: numbers from the last 30 days, the data figure says „about“ ----
  const daily = {};
  const key = (t) => { const d = new Date(t); return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"); };
  for (let i = 0; i < 20; i++) daily[key(Date.now() - i * DAY)] = { b: 1000, c: 3 };
  await set({ review: { never: true }, receipt: {}, daily, savedBytes: 54321 * 40 * 1024 });
  p = await popup();
  const text = await p.textContent("#receiptText");
  ok(`receipt card: “${text}”`, (await shown(p)).join() === "receipt" && /20,000 requests blocked/.test(text) && /60 cookie banners/.test(text) && /about .+ of data saved \(an estimate\)/.test(text));
  ok("…shown once this month", (await get("receipt")).receipt.month === key(Date.now()).slice(0, 7));
  await p.click("#receiptClose"); await p.waitForTimeout(400);
  ok("„Close“ closes it", (await shown(p)).length === 0);
  await p.close();
  p = await popup();
  ok("not again this month", (await shown(p)).length === 0);

  // ---- 5) Share: the clean listing address, nothing else ----
  ok("Share is in the footer (unpacked = Chrome Web Store build)", await p.isVisible("#share"));
  await p.evaluate(() => { window.__copied = null; navigator.clipboard.writeText = async (t) => { window.__copied = t; }; });
  await p.click("#share"); await p.waitForTimeout(150);
  const copied = await p.evaluate(() => window.__copied);
  ok(`Share copies the listing address without parameters (${copied})`, copied === "https://chromewebstore.google.com/detail/supreme-adblock/chbjbiabkgocfbbfhednpbhfeipjcclk");
  ok("…and says so (status for screen readers)", (await p.textContent("#shareStatus")) === "Link copied");
  const bottom = await p.evaluate(() => Math.ceil(document.body.getBoundingClientRect().bottom));
  ok(`popup with Share still fits 600 px (${bottom})`, bottom <= 600);
  await p.close();

  // ---- 6) repair page: „Did it fix the site?“ ----
  const tabId = await sw.evaluate(async () => (await chrome.tabs.query({ url: "http://127.0.0.1/*" }))[0]?.id);
  const r = await ctx.newPage();
  await r.goto(`chrome-extension://${id}/report/report.html?tab=${tabId}`); await r.waitForTimeout(800);
  ok("the email address is visible for webmail users", /info@carbonstealth\.eu/.test(await r.textContent("#webmail")));
  ok("no question before a fix", await r.isHidden("#fixedAsk"));
  await r.click("#fixCosm"); await r.waitForTimeout(700);
  ok("after a fix: „Did it fix the site?“", await r.isVisible("#fixedAsk"));
  await r.click("#fixedNo"); await r.waitForTimeout(300);
  const hint = await r.textContent("#fixedHint");
  const focused = await r.evaluate(() => document.activeElement.id);
  ok(`„No“ → the next fix is suggested and focused (${hint} / ${focused})`, /Allow ads here for 1 hour/.test(hint) && focused === "fixHour");
  ok("…and the report says what was tried", /Tried: element hiding off here → still broken/.test(await r.textContent("#preview")));
  await r.click("#fixHour"); await r.waitForTimeout(700);
  await r.click("#fixedYes"); await r.waitForTimeout(300);
  ok("„Yes“ → thanks, and the report has both answers", /Glad it works/.test(await r.textContent("#fixedHint")) &&
    /element hiding off here → still broken; allowed here for 1 hour → worked/.test(await r.textContent("#preview")));
  ok("…focus moves on to the report after „Yes“", (await r.evaluate(() => document.activeElement.id)) === "what");
  await r.close();
  await sw.evaluate(() => chrome.storage.local.set({ allowlist: [], allowUntil: {}, noCosmetics: [] }));
  // „No“ after „for 1 hour“: allowing for good is the same rule without the end — the pause comes next
  const r2 = await ctx.newPage();
  await r2.goto(`chrome-extension://${id}/report/report.html?tab=${tabId}`); await r2.waitForTimeout(800);
  await r2.click("#fixHour"); await r2.waitForTimeout(700);
  await r2.click("#fixedNo"); await r2.waitForTimeout(300);
  ok(`after „for 1 hour“ did not help: the pause is suggested, not „allow for good“ (${await r2.evaluate(() => document.activeElement.id)})`,
    (await r2.evaluate(() => document.activeElement.id)) === "fixPause" && /Pause everywhere/.test(await r2.textContent("#fixedHint")));
  await r2.close();
  await sw.evaluate(() => chrome.storage.local.set({ allowlist: [], allowUntil: {}, noCosmetics: [] }));

  // welcome: the test-page link only for a Chrome Web Store (here: unpacked) install
  const w = await ctx.newPage();
  await w.goto(`chrome-extension://${id}/welcome/welcome.html`); await w.waitForTimeout(800);
  ok("welcome: the test-page link is shown (unpacked = Chrome Web Store build)", await w.isVisible("#testLink a"));
  await w.close();

  // ---- 7) warning page: „Think this is a mistake?“ — a mail with the site name only ----
  const b = await ctx.newPage();
  await b.goto(`chrome-extension://${id}/blocked/blocked.html#http://bad.example/x?y=1`); await b.waitForTimeout(300);
  const href = await b.getAttribute("#mistake", "href");
  ok(`warning page: a mailto with the site name (${href && href.slice(0, 80)}…)`, /^mailto:info@carbonstealth\.eu\?subject=Warning%20page%3A%20bad\.example&body=/.test(href || "") && !/x%3Fy|\/x/.test(href || ""));
  await b.close();
} finally {
  await ctx.close();
  srv.close();
  rmSync(profile, { recursive: true, force: true });
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
