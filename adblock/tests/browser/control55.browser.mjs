// 5.5.0 — контролът с истинското разширение в реален Chromium (Playwright): „Върни последния“ в
// popup-а връща скрития елемент веднага (без презареждане), Настройките (графиката за 30 дни, GPC,
// клавишите, вносът от uBlock Origin), „Разреши за 1 час“ в страницата за поправки и брояча в
// popup-а, клавишните команди в service worker-а, бързите избори на приветствената страница и
// високият контраст (forced-colors) / видимият фокус на превключвателите.
// Не е в `npm test` (CI няма Playwright) — `PW_ROOT=$(npm root -g) npm run test:browser`.
import { createRequire } from "node:module";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
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

const srv = http.createServer((q, r) => {
  r.setHeader("content-type", "text/html");
  r.end(`<!doctype html><title>site</title><div class="wrap"><div class="box-one">A</div><div class="box-two">B</div></div><p id="keep">keep</p>`);
});
await new Promise((res) => srv.listen(0, "127.0.0.1", res));
const port = srv.address().port;

const profile = mkdtempSync(join(tmpdir(), "sa-ctl-"));
const tmp = mkdtempSync(join(tmpdir(), "sa-ctl-files-"));
const ctx = await chromium.launchPersistentContext(profile, {
  channel: "chromium", headless: true,
  args: ["--no-sandbox", `--disable-extensions-except=${ROOT}`, `--load-extension=${ROOT}`,
    `--host-resolver-rules=MAP www.news-site.org 127.0.0.1:${port}, MAP www.shop-site.org 127.0.0.1:${port}`],
});
const shown = (p, sel) => p.evaluate((s) => { const e = document.querySelector(s); return !!e && getComputedStyle(e).display !== "none"; }, sel);
try {
  const sw = ctx.serviceWorkers()[0] || await ctx.waitForEvent("serviceworker", { timeout: 20000 });
  await new Promise((r) => setTimeout(r, 2000));
  const id = sw.url().split("/")[2];
  const set = (o) => sw.evaluate((x) => chrome.storage.local.set(x), o);
  const get = (k) => sw.evaluate((x) => chrome.storage.local.get(x), k);
  await set({ review: { never: true } });
  const popup = async (over) => {
    const p = await ctx.newPage(); await p.setViewportSize({ width: 320, height: 600 });
    await p.goto(`chrome-extension://${id}/popup/popup.html`); await p.waitForTimeout(200);
    await over.bringToFront(); await p.reload(); await p.waitForTimeout(700);
    return p;
  };

  // ---- the manifest commands are registered with their keys ----
  const cmds = (await sw.evaluate(() => chrome.commands.getAll())).filter((c) => !c.name.startsWith("_"));
  const key = (n) => (cmds.find((c) => c.name === n) || {}).shortcut || "";
  ok(`commands: toggle-site ${key("toggle-site")}, pause ${key("pause")}, picker unassigned`, key("toggle-site") === "Alt+Shift+U" && key("pause") === "Alt+Shift+Q" && key("picker") === "" && cmds.length === 3);
  ok("command descriptions are the localised strings", cmds.every((c) => c.description && !c.description.startsWith("__MSG")));

  // ---- undo what the picker hid: back at once, no reload ----
  await set({ customHidden: { "news-site.org": [".box-one", ".box-two"] } });
  const site = await ctx.newPage();
  await site.goto(`http://www.news-site.org:${port}/`);
  await site.waitForTimeout(900);
  ok("both picker selectors hide their elements", !(await shown(site, ".box-one")) && !(await shown(site, ".box-two")) && (await shown(site, "#keep")));
  let p = await popup(site);
  const undo = await p.evaluate(() => { const b = document.getElementById("undoBtn"); return { hidden: b.hidden, name: b.getAttribute("aria-label"), tip: b.title, count: document.getElementById("undoCount").textContent }; });
  ok(`popup: ↶ ${undo.count} next to the picker, named “${undo.name}”`, !undo.hidden && undo.count === "2" && /Elements you hid here: 2/.test(undo.name) && undo.tip === undo.name);
  await p.click("#undoBtn");
  await p.waitForTimeout(700);
  ok("undo takes back the last one only", JSON.stringify((await get("customHidden")).customHidden["news-site.org"]) === '[".box-one"]');
  ok("…and the page shows it again without a reload", (await shown(site, ".box-two")) && !(await shown(site, ".box-one")));
  ok("…the popup's count follows", (await p.textContent("#undoCount")) === "1");
  await p.click("#undoBtn");
  await p.waitForTimeout(700);
  ok("last one undone → the button goes away", await p.evaluate(() => document.getElementById("undoBtn").hidden));
  ok("…and that element is back too", (await shown(site, ".box-one")) && !("news-site.org" in ((await get("customHidden")).customHidden || {})));
  await p.close();

  // ---- the repair page: allow for 1 hour ----
  const tabId = await sw.evaluate(async () => (await chrome.tabs.query({ url: "http://www.news-site.org/*" }))[0].id);
  const rep = await ctx.newPage();
  await rep.goto(`chrome-extension://${id}/report/report.html?tab=${tabId}`);
  await rep.waitForTimeout(600);
  await rep.click("#fixHour");
  await rep.waitForTimeout(900);
  const st = await get(["allowlist", "allowUntil"]);
  ok("“Allow ads here for 1 hour”: the site is allowed, the timer an hour away",
    st.allowlist.includes("news-site.org") && Math.abs(st.allowUntil["news-site.org"] - (Date.now() + 3600000)) < 15000);
  ok(`…and the page says so (“${await rep.textContent("#fixHint")}”)`, /1 hour/.test(await rep.textContent("#fixHint")));
  const alarm = await sw.evaluate(() => chrome.alarms.get("allow-expire"));
  ok("…the expiry alarm is set", !!alarm && Math.abs(alarm.scheduledTime - st.allowUntil["news-site.org"]) < 2000);
  await rep.close();
  p = await popup(site);
  ok(`popup: the switch label says how long (“${await p.textContent("#allowLabel")}”)`, /Allowed · (59|60) min left/.test(await p.textContent("#allowLabel")));
  await p.close();
  await sw.evaluate(async () => { await expireAllows(Date.now() + 3600000 + 1000); });
  ok("when the hour is up the site blocks again", !(await get("allowlist")).allowlist.includes("news-site.org"));

  // ---- keyboard command: this site on/off (the SW's handler, the browser's tabs API) ----
  const shop = await ctx.newPage();
  await shop.goto(`http://www.shop-site.org:${port}/`);
  const shopTab = await sw.evaluate(async () => (await chrome.tabs.query({ url: "http://www.shop-site.org/*" }))[0]);
  await sw.evaluate(async (t) => { await runCommand("toggle-site", t); }, { id: shopTab.id, url: shopTab.url });
  await shop.waitForTimeout(600);
  ok("toggle-site command: the site is allowed (and the tab reloads)", (await get("allowlist")).allowlist.includes("shop-site.org"));
  await sw.evaluate(async (t) => { await runCommand("toggle-site", t); }, { id: shopTab.id, url: shopTab.url });
  ok("…again: blocked again", !(await get("allowlist")).allowlist.includes("shop-site.org"));
  await shop.close();

  // ---- Settings: chart, GPC, shortcuts, import ----
  const today = new Date(); const dk = today.getFullYear() + "-" + String(today.getMonth() + 1).padStart(2, "0") + "-" + String(today.getDate()).padStart(2, "0");
  await set({ daily: { [dk]: { b: 1234, c: 5 } } });
  const opt = await ctx.newPage(); await opt.setViewportSize({ width: 1280, height: 900 });
  await opt.goto(`chrome-extension://${id}/options/options.html`);
  await opt.waitForTimeout(900);
  const chart = await opt.evaluate(() => ({ bars: document.querySelectorAll("#daysChart .bar").length, full: document.querySelectorAll("#daysChart .bar:not(.none)").length, sum: document.getElementById("daysSum").textContent, label: document.getElementById("daysChart").getAttribute("aria-labelledby") }));
  ok(`chart: 30 days, today's bar drawn (“${chart.sum}”)`, chart.bars === 30 && chart.full === 1 && /1,234/.test(chart.sum) && /5/.test(chart.sum) && chart.label === "daysSum");
  ok("GPC switch: on by default", await opt.isChecked("#featGpc"));
  await opt.click("#featGpc + .slider");
  await opt.waitForTimeout(500);
  let f = (await get("features")).features;
  ok("GPC switch off → saved, the other features kept", f.gpc === false && f.youtube !== false && f.cookies !== false);
  ok("…and the GPC ruleset follows", !(await sw.evaluate(() => chrome.declarativeNetRequest.getEnabledRulesets())).includes("gpc"));
  await opt.click("#featGpc + .slider");
  await opt.waitForTimeout(500);
  ok("…back on", (await get("features")).features.gpc === true && (await sw.evaluate(() => chrome.declarativeNetRequest.getEnabledRulesets())).includes("gpc"));
  const keys = await opt.evaluate(() => [...document.querySelectorAll("#keysList li")].map((li) => li.textContent));
  ok(`shortcuts card: ${keys.join(" | ")}`, keys.length === 3 && keys.some((k) => k.includes("Alt+Shift+U")) && keys.some((k) => k.includes("Alt+Shift+Q")) && keys.some((k) => /Not set/.test(k)));

  const backup = join(tmp, "my-ublock-backup_2026-10-16.txt");
  writeFileSync(backup, JSON.stringify({
    timeStamp: 1, version: "1.60.0", userSettings: {}, selectedFilterLists: [],
    whitelist: ["chrome-extension-scheme", "www.bank.example", "https://shop.example/*"],
    userFilters: "||ads.tracker.example^\nnews.example##.promo\n||cdn.example/ads/*.js$script",
  }));
  await opt.setInputFiles("#foreignFile", backup);
  // the answer comes after the SW re-synced the allowlist rules and the page scripts
  await opt.waitForFunction(() => document.getElementById("foreignHint").textContent.length > 0, null, { timeout: 15000 }).catch(() => {});
  await opt.waitForTimeout(600);
  const hint = await opt.textContent("#foreignHint");
  const after = await get(["allowlist", "userFilters"]);
  ok(`import a uBlock Origin backup: “${hint}”`, /Sites allowed: 2 · Filters added: 2 · Left out \(can't be applied here\): 1/.test(hint));
  ok("…the sites are in the allowlist, the usable filters in My filters, the path rule is not", after.allowlist.includes("bank.example") && after.allowlist.includes("shop.example") &&
    after.userFilters.includes("ads.tracker.example") && after.userFilters.includes("news.example##.promo") && !after.userFilters.includes("cdn.example"));
  ok("…and the allowlist on the page shows them", (await opt.textContent("#allowList")).includes("bank.example"));

  // the switches show keyboard focus (the input itself is invisible)
  await opt.focus("#featTopics");
  await opt.keyboard.press("Tab");
  ok(`keyboard focus on a switch is visible (focused: ${await opt.evaluate(() => document.activeElement.id)})`, await opt.evaluate(() => getComputedStyle(document.querySelector("#featGpc + .slider")).outlineStyle !== "none"));
  await opt.close();

  // ---- welcome page: quick choices ----
  const w = await ctx.newPage(); await w.setViewportSize({ width: 1280, height: 900 });
  await w.goto(`chrome-extension://${id}/welcome/welcome.html`);
  await w.waitForTimeout(900);
  ok("welcome: cookie banners shown as on, newsletters as off", (await w.isChecked('[data-feature="cookies"]')) && !(await w.isChecked('[data-list="focus-newsletters"]')));
  await w.click('[data-list="focus-newsletters"]');
  await w.waitForTimeout(900);
  ok("turning on newsletter pop-ups there turns the Focus list on", (await get("lists")).lists["focus-newsletters"] === true);
  await w.click('[data-feature="cookies"]');
  await w.waitForTimeout(700);
  f = (await get("features")).features;
  ok("turning cookie banners off changes only that feature", f.cookies === false && f.gpc === true && f.youtube !== false);
  ok("welcome: the shortcuts with a key are listed", (await w.evaluate(() => !document.getElementById("keysCard").hidden && document.querySelectorAll("#keysList li").length === 2)));
  await w.click('[data-feature="cookies"]');
  await w.waitForTimeout(500);
  await w.close();

  // ---- high contrast: the popup's switch is redrawn with system colours ----
  p = await ctx.newPage(); await p.setViewportSize({ width: 320, height: 600 });
  await p.emulateMedia({ forcedColors: "active" });
  await p.goto(`chrome-extension://${id}/popup/popup.html`);
  await p.waitForTimeout(600);
  const fc = await p.evaluate(() => {
    const t = getComputedStyle(document.querySelector("#toggle + .track")), th = getComputedStyle(document.querySelector("#toggle + .track .thumb"));
    return { border: t.borderTopStyle + " " + t.borderTopWidth, thumb: th.backgroundColor, track: t.backgroundColor, aura: getComputedStyle(document.body, "::before").display };
  });
  ok(`forced colours: the track has a real border and the thumb a solid colour (${JSON.stringify(fc)})`,
    fc.border === "solid 1px" && fc.thumb !== "rgba(0, 0, 0, 0)" && fc.thumb !== fc.track && fc.aura === "none");
  await p.close();
} finally {
  await ctx.close();
  srv.close();
  rmSync(profile, { recursive: true, force: true });
  rmSync(tmp, { recursive: true, force: true });
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
