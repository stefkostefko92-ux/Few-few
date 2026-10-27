// Молбата за отзив с истинското разширение в реален Chromium (Playwright): ★ в долната лента, картата
// след успех (кога идва, „Не сега“, „Не питай повече“, „Оставете отзив“ → страницата с отзивите),
// ключът в Настройки маха и двете, покритото от листа е inert, а popup-ът остава под тавана от 600 px.
// Хостът на магазина не се резолвира (--host-resolver-rules) — нищо не излиза навън.
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
const STORE = /^https:\/\/chromewebstore\.google\.com\/detail\/supreme-adblock\/chbjbiabkgocfbbfhednpbhfeipjcclk\/reviews$/;

// the popup opens over a website — the card never comes on a new tab / chrome:// page
const srv = http.createServer((q, r) => { r.setHeader("content-type", "text/html"); r.end("<!doctype html><title>news</title><p>news</p>"); });
await new Promise((r) => srv.listen(0, "127.0.0.1", r));
const profile = mkdtempSync(join(tmpdir(), "sa-review-"));
const ctx = await chromium.launchPersistentContext(profile, {
  channel: "chromium", headless: true,
  // a tab the extension opens is not routable by Playwright — the store host resolves nowhere instead
  args: ["--no-sandbox", `--disable-extensions-except=${ROOT}`, `--load-extension=${ROOT}`, "--host-resolver-rules=MAP chromewebstore.google.com ~NOTFOUND", "--no-proxy-server"],
});
try {
  const sw = ctx.serviceWorkers()[0] || await ctx.waitForEvent("serviceworker", { timeout: 20000 });
  await new Promise((r) => setTimeout(r, 2000));
  const id = sw.url().split("/")[2];
  const set = (o) => sw.evaluate((x) => chrome.storage.local.set(x), o);
  const get = (k) => sw.evaluate((x) => chrome.storage.local.get(x), k);
  const due = () => set({ installedAt: Date.now() - 8 * DAY, blockedTotal: 54321, review: {}, reviewAsk: true, enabled: true, pausedUntil: 0 });
  const site = await ctx.newPage(); await site.goto(`http://127.0.0.1:${srv.address().port}/news`);
  // as if opened from the toolbar over that site: the site is the active tab when popup.js asks
  const popup = async (over = site) => {
    const p = await ctx.newPage(); await p.setViewportSize({ width: 320, height: 600 });
    await p.goto(`chrome-extension://${id}/popup/popup.html`); await p.waitForTimeout(200);
    await over.bringToFront(); await p.reload(); await p.waitForTimeout(700);
    return p;
  };
  const state = (p) => p.evaluate(() => ({
    card: !document.getElementById("review").hidden,
    star: !document.getElementById("rate").hidden ? document.getElementById("rate").href : null,
    title: document.getElementById("reviewTitle").textContent,
    inert: [...document.querySelectorAll("[inert]")].map((e) => e.className || e.id),
  }));

  // 0) not over a website (new tab): no card even when due — protection does not run there
  await due();
  const blank = await ctx.newPage();
  let p = await popup(blank); let s = await state(p);
  ok("due, but over a non-website tab: no card (and nothing counted)", !s.card && !(await get("review")).review.count);
  await p.close(); await blank.close();
  await set({ installedAt: Date.now(), blockedTotal: 0 });

  // 1) току-що инсталирано: само тихата ★, без карта
  ok("fresh install stamped installedAt", (await get("installedAt")).installedAt > Date.now() - 60000);
  p = await popup(); s = await state(p);
  ok(`fresh install: ★ in the footer links to the store reviews, no card (${s.star})`, STORE.test(s.star || "") && !s.card);
  await p.close();

  // 2) ≥ 7 дни и ≥ 1000 блокирани → картата идва веднъж; покритото е inert
  await due();
  p = await popup(); s = await state(p);
  ok(`due: card shown with the count (“${s.title}”)`, s.card && /54,321/.test(s.title));
  ok(`covered blocks are inert while the card is up (${s.inert.join(", ")})`, s.inert.includes("actions") && s.inert.some((x) => /foot/.test(x)) && !s.inert.some((x) => /hero/.test(x)));
  const tabbable = await p.evaluate(() => { const r = []; document.querySelectorAll("a[href], button, input, summary").forEach((el) => { if (!el.closest("[inert]") && !el.closest("[hidden]") && el.offsetParent !== null) r.push(el.id || el.className); }); return r; });
  ok("…and nothing under it can take keyboard focus (WCAG 2.4.11)", !tabbable.includes("pickBtn") && !tabbable.includes("settingsBtn") && !tabbable.includes("donate") && tabbable.includes("reviewGo"));
  let rv = (await get("review")).review;
  ok("showing the card counts the ask", rv && rv.count === 1 && rv.last > Date.now() - 60000);
  await p.click("#reviewLater"); await p.waitForTimeout(400); s = await state(p);
  ok("„Not now“ closes it and gives the popup back", !s.card && s.inert.length === 0);
  await p.close();
  p = await popup(); s = await state(p);
  ok("next popup: no card (the second ask waits ≥ 60 days)", !s.card && !!s.star);
  await p.close();

  // 3) втори път след 60 дни, Escape затваря; трети — никога
  await set({ review: { count: 1, last: Date.now() - 61 * DAY } });
  p = await popup(); s = await state(p);
  ok("second ask after 60 days", s.card && (await get("review")).review.count === 2);
  await p.focus("#reviewLater"); await p.keyboard.press("Escape"); await p.waitForTimeout(400);
  ok("Escape closes the card; focus goes back to the content, not to <body>", !(await state(p)).card && await p.evaluate(() => document.activeElement && document.activeElement.tagName === "MAIN"));
  await p.close();
  await set({ review: { count: 2, last: Date.now() - 400 * DAY } });
  p = await popup(); s = await state(p);
  ok("never a third time", !s.card);
  await p.close();

  // 4) „Не питай повече“
  await due();
  p = await popup();
  await p.click("#reviewNever"); await p.waitForTimeout(400);
  ok("„Don't ask again“ → never, card gone", (await get("review")).review.never === true && !(await state(p)).card);
  await p.close();
  p = await popup(); s = await state(p);
  ok("…and it stays gone; the quiet ★ remains", !s.card && !!s.star);
  await p.close();

  // 5) „Оставете отзив“ → страницата с отзивите в нов раздел, после никога
  await due();
  p = await popup();
  const opened = ctx.waitForEvent("page", { timeout: 5000 });
  await p.click("#reviewGo");
  const tab = await opened; await tab.waitForLoadState("domcontentloaded").catch(() => {});
  ok(`„Leave a review“ opens the store's reviews page in a new tab (${tab.url()})`, STORE.test(tab.url()));
  ok("…and the card never comes back", (await get("review")).review.never === true);
  await tab.close(); if (!p.isClosed()) await p.close();

  // 6) Настройки: ключът маха ★ и картата
  const o = await ctx.newPage(); await o.goto(`chrome-extension://${id}/options/options.html`); await o.waitForTimeout(700);
  const row = await o.evaluate(() => ({ shown: !document.getElementById("reviewRow").hidden, on: document.getElementById("reviewAsk").checked, name: document.getElementById("reviewAsk").getAttribute("aria-labelledby") }));
  ok("Settings: the switch is there, on, and named by its row", row.shown && row.on && !!row.name);
  await o.click("#reviewRow .switch"); await o.waitForTimeout(400);
  ok("Settings: turning it off stores reviewAsk:false", (await get("reviewAsk")).reviewAsk === false);
  await o.close();
  await set({ installedAt: Date.now() - 8 * DAY, blockedTotal: 54321, review: {} });
  p = await popup(); s = await state(p);
  ok("switched off: no ★ and no card, even when due", !s.card && !s.star);
  await p.close();
  await set({ reviewAsk: true });

  // 7) таванът на popup-а: 600 px с всичко видимо (сайт, бисквитки, „Сайтът е счупен?“)
  await set({ cookieRejections: 42, review: { never: true } });
  p = await popup();
  const h = await p.evaluate(() => document.getElementById("reportBtn").hidden ? 9999 : Math.ceil(document.body.getBoundingClientRect().bottom)); // scrollHeight is never below the viewport
  ok(`popup fits Chrome's 600 px cap with everything shown (${h} px)`, h <= 600);
  await p.close();
} finally {
  await ctx.close(); srv.close();
  rmSync(profile, { recursive: true, force: true });
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
