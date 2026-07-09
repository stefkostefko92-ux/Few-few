#!/usr/bin/env node
// consent-scan.mjs — runtime проверка „тракинг преди съгласие" (Правен агент v2.0).
// Зарежда страницата с ЧИСТО състояние и записва кои бисквитки/заявки към трети
// домейни тръгват ПРЕДИ всякакво взаимодействие. WebFetch вижда само статичен HTML;
// това вижда реалното поведение чрез headless браузър.
//
// Употреба:  node tools/legal/consent-scan.mjs https://zabobovdol.carbonstealth.eu
// Изисква Playwright (chromium). Ако липсва — казва как да го пуснеш и излиза чисто.
const url = process.argv[2];
if (!url) { console.error("Употреба: node consent-scan.mjs <url>"); process.exit(2); }

let chromium;
try { ({ chromium } = await import("playwright")); }
catch {
  console.error("✘ Липсва Playwright. Тук chromium е наличен в /opt/pw-browsers.");
  console.error("  Опитай: npm i -D playwright  (или playwright-core и executablePath към /opt/pw-browsers/chromium-*/chrome-linux/chrome)");
  process.exit(1);
}

// Чести трекери/реклама/аналитика хостове (не изчерпателно — груб филтър).
const TRACKER_HINT = /google-analytics|googletagmanager|doubleclick|facebook|fbcdn|hotjar|clarity|segment|mixpanel|amplitude|tiktok|yandex|matomo|plausible|fonts\.googleapis|fonts\.gstatic/i;

const launchOpts = { headless: true };
if (process.env.PLAYWRIGHT_BROWSERS_PATH) launchOpts.args = ["--no-sandbox"];

const browser = await chromium.launch(launchOpts).catch((e) => {
  console.error("✘ Не мога да пусна chromium:", e.message); process.exit(1);
});
const ctx = await browser.newContext();
const thirdParty = new Map();
const target = new URL(url).hostname.replace(/^www\./, "");

ctx.on("request", (req) => {
  try {
    const h = new URL(req.url()).hostname.replace(/^www\./, "");
    if (!h.endsWith(target)) {
      const flag = TRACKER_HINT.test(h);
      const k = h + (flag ? "  ⚠ вероятен трекер/3rd-party" : "");
      thirdParty.set(k, (thirdParty.get(k) || 0) + 1);
    }
  } catch {}
});

const page = await ctx.newPage();
await page.goto(url, { waitUntil: "networkidle", timeout: 30000 }).catch(() => {});
const cookies = await ctx.cookies();

console.log(`\n# Consent scan (преди взаимодействие) — ${url}\n`);
console.log(`── Бисквитки, зададени без съгласие: ${cookies.length} ──`);
for (const c of cookies) console.log(`  ${c.name}  (${c.domain})  ${c.httpOnly ? "HttpOnly" : ""} ${c.secure ? "Secure" : ""} SameSite=${c.sameSite}`);

console.log(`\n── Заявки към трети домейни преди съгласие: ${thirdParty.size} ──`);
[...thirdParty.entries()].sort((a, b) => b[1] - a[1]).forEach(([h, n]) => console.log(`  ${String(n).padStart(3)}× ${h}`));

const trackers = [...thirdParty.keys()].filter((k) => k.includes("⚠")).length;
console.log("\n── Присъда ──");
if (trackers || cookies.some((c) => !/session|csrf|consent|lang|zbd_/i.test(c.name))) {
  console.log("🔴 Възможен тракинг/неесенциални бисквитки ПРЕДИ съгласие → чл. 5(3) ePrivacy + GDPR.");
  console.log("   Провери дали зареждането им е след affirmative consent (CookieConsent.tsx).");
} else {
  console.log("🟢 Не открих явни неесенциални трекери преди съгласие (провери и ръчно).");
}
console.log("\nРазширение: повтори за състояния reject-all и accept-all и сравни (3-state diff).");
console.log("Това е обща информация, не правен съвет.");
await browser.close();
