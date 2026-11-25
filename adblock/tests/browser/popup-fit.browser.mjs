// Popup-ът на Chrome е най-много 600 px висок — всичко отгоре е скролбар. На всеки от 73-те локала (70 езика) (с
// всичко видимо: сайт, бисквитки, „Върни последния“, „Сайтът е счупен?“, ★) съдържанието трябва да се събира, долната лента
// да не прелива (иначе — само икони), а картата за отзив да не покрива повече от половината popup.
// Езикът се сменя с низовете от _locales (Chromium не сменя UI езика без рестарт) — после fitPopup(),
// точно както popup.js след getStats. Не е в `npm test` — `PW_ROOT=$(npm root -g) npm run test:browser`.
import { createRequire } from "node:module";
import { mkdtempSync, rmSync, readFileSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const require = createRequire(join(process.env.PW_ROOT || join(ROOT, "node_modules"), "/"));
let chromium;
try { ({ chromium } = require("playwright")); } catch {
  console.log("SKIP: playwright not available (PW_ROOT)"); process.exit(process.env.PW_REQUIRED ? 1 : 0);
}

let pass = 0, fail = 0;
const ok = (name, cond) => { console.log(`  ${cond ? "PASS" : "FAIL"} ${name}`); cond ? pass++ : fail++; };

const profile = mkdtempSync(join(tmpdir(), "sa-fit-"));
const ctx = await chromium.launchPersistentContext(profile, {
  channel: "chromium", headless: true, args: ["--no-sandbox", `--disable-extensions-except=${ROOT}`, `--load-extension=${ROOT}`],
});
const rows = [];
try {
  const sw = ctx.serviceWorkers()[0] || await ctx.waitForEvent("serviceworker", { timeout: 20000 });
  await new Promise((r) => setTimeout(r, 2000));
  const id = sw.url().split("/")[2];
  await sw.evaluate(() => chrome.storage.local.set({ blockedTotal: 123456, cookieRejections: 42, review: { never: true } }));
  const p = await ctx.newPage(); await p.setViewportSize({ width: 320, height: 600 });
  for (const l of readdirSync(join(ROOT, "_locales")).sort()) {
    const M = JSON.parse(readFileSync(join(ROOT, "_locales", l, "messages.json"), "utf8"));
    await p.goto(`chrome-extension://${id}/popup/popup.html`); await p.waitForTimeout(300);
    rows.push({ l, ...await p.evaluate(({ M, l }) => {
      const msg = (k, v) => { const e = M[k]; return e ? (v == null ? e.message : e.message.replace(/\$[A-Za-z_]+\$|\$1/g, v)) : ""; };
      document.documentElement.dir = /^(ar|he|fa|ur)$/.test(l) ? "rtl" : "ltr";
      document.querySelectorAll("[data-i18n]").forEach((el) => { const m = msg(el.getAttribute("data-i18n")); if (m) el.textContent = m; });
      document.getElementById("heroTitle").textContent = msg("protected");
      document.getElementById("statusText").textContent = msg("blockingHere");
      document.getElementById("pauseLabel").textContent = msg("pausedResume", "29"); // the longer of the two labels
      document.getElementById("rejText").textContent = msg("cookieRejections", "1,234"); document.getElementById("rejLine").hidden = false;
      document.getElementById("listDot").textContent = msg("filtersCount", "60,936");
      document.getElementById("siteHost").textContent = "news.example.com";
      document.getElementById("reportBtn").hidden = false;
      // 5.5.0: what the picker hid here (Undo) and a site allowed for a while (the longer label)
      document.getElementById("undoCount").textContent = "12"; document.getElementById("undoBtn").hidden = false;
      document.getElementById("allowLabel").textContent = msg("allowedFor", "59");
      document.getElementById("rate").hidden = false;
      document.getElementById("share").hidden = false; // 5.6
      fitPopup();
      const foot = document.querySelector(".foot");
      const clippedNow = () => [...foot.querySelectorAll(".links > :not([hidden]) span")].some((s) => !foot.classList.contains("compact") && s.scrollWidth > s.clientWidth + 1);
      const clipped = clippedNow();
      const site = document.querySelector(".site");
      const undo = document.querySelector(".actions");
      const r = { bottom: Math.ceil(document.body.getBoundingClientRect().bottom), footOver: foot.scrollWidth > foot.clientWidth + 1 || clipped,
        siteOver: !!site && site.scrollWidth > site.clientWidth + 1, undoOver: undo.scrollWidth > undo.clientWidth + 1 };
      // 5.6: Share right after a click says „Link copied“ (popup.js re-runs fitPopup for it)
      document.querySelector("#share span").textContent = msg("shareCopied"); fitPopup();
      r.footOver = r.footOver || foot.scrollWidth > foot.clientWidth + 1 || clippedNow();
      r.bottom = Math.max(r.bottom, Math.ceil(document.body.getBoundingClientRect().bottom));
      document.getElementById("reviewTitle").textContent = msg("reviewBlocked", "54,321");
      document.getElementById("review").hidden = false;
      r.card = Math.round(document.getElementById("review").getBoundingClientRect().height);
      document.getElementById("review").hidden = true;
      // 5.6: the help card and the monthly receipt — the same bottom sheet, the longest numbers
      document.getElementById("help").hidden = false;
      r.help = Math.round(document.getElementById("help").getBoundingClientRect().height);
      document.getElementById("help").hidden = true;
      document.getElementById("receiptText").textContent = msg("receiptText", "1,234,567").replace(/\$2/g, "12,345").replace(/\$3/g, "1.2 GB");
      document.getElementById("receipt").hidden = false;
      r.receipt = Math.round(document.getElementById("receipt").getBoundingClientRect().height);
      return r;
    }, { M, l }) });
  }
} finally {
  await ctx.close();
  rmSync(profile, { recursive: true, force: true });
}
const over = rows.filter((r) => r.bottom > 600), foot = rows.filter((r) => r.footOver), big = rows.filter((r) => r.card > 300);
ok(`every language fits the 600 px popup (${rows.length} locales, tallest ${Math.max(...rows.map((r) => r.bottom))} px${over.length ? "; over: " + over.map((r) => `${r.l} ${r.bottom}`).join(", ") : ""})`, rows.length >= 54 && !over.length);
ok(`footer never overflows or clips a label (${foot.map((r) => r.l).join(", ") || "none"})`, !foot.length);
const siteOver = rows.filter((r) => r.siteOver || r.undoOver);
ok(`“Allowed · N min left” and ↶ N next to the picker fit their rows (${siteOver.map((r) => r.l).join(", ") || "none"})`, !siteOver.length);
ok(`review card stays under half the popup (tallest ${Math.max(...rows.map((r) => r.card))} px${big.length ? "; " + big.map((r) => r.l).join(", ") : ""})`, !big.length);
const bigHelp = rows.filter((r) => r.help > 300), bigRec = rows.filter((r) => r.receipt > 300);
ok(`help card stays under half the popup (tallest ${Math.max(...rows.map((r) => r.help))} px${bigHelp.length ? "; " + bigHelp.map((r) => r.l).join(", ") : ""})`, !bigHelp.length);
ok(`monthly receipt stays under half the popup (tallest ${Math.max(...rows.map((r) => r.receipt))} px${bigRec.length ? "; " + bigRec.map((r) => r.l).join(", ") : ""})`, !bigRec.length);
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
