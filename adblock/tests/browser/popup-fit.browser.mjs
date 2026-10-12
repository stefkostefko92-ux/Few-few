// Popup-ът на Chrome е най-много 600 px висок — всичко отгоре е скролбар. На всеки от 73-те езика (с
// всичко видимо: сайт, бисквитки, „Сайтът е счупен?“, ★) съдържанието трябва да се събира, долната лента
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
      document.getElementById("rate").hidden = false;
      fitPopup();
      const foot = document.querySelector(".foot");
      const clipped = [...foot.querySelectorAll(".links a:not([hidden]) span")].some((s) => !foot.classList.contains("compact") && s.scrollWidth > s.clientWidth + 1);
      const r = { bottom: Math.ceil(document.body.getBoundingClientRect().bottom), footOver: foot.scrollWidth > foot.clientWidth + 1 || clipped };
      document.getElementById("reviewTitle").textContent = msg("reviewBlocked", "54,321");
      document.getElementById("review").hidden = false;
      r.card = Math.round(document.getElementById("review").getBoundingClientRect().height);
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
ok(`review card stays under half the popup (tallest ${Math.max(...rows.map((r) => r.card))} px${big.length ? "; " + big.map((r) => r.l).join(", ") : ""})`, !big.length);
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
