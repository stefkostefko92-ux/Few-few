// youtube_check.mjs — проверката „YouTube без реклами“ за /status, пусната от ДОМАШНА връзка.
//
// Защо: облачна машина не може — Google праща центровете за данни към /sorry (docs/RISKS.md § 7), а
// ръчната проверка не се правеше (tools/status.json беше null). Тук: истинският YouTube, разширението
// разархивирано от тази папка, ТРИ клипа от търсенето в YouTube (не фиксирани адреси — те остаряват),
// всеки ~25 s. Клипът минава, ако: видеото върви (currentTime расте, има картина), плейърът нито
// веднъж не е в реклама (`#movie_player.ad-showing`) и няма прозорец „ad blockers are not allowed“
// (ytd-enforcement-message-*). Всичките три минават → tools/status.json.youtubeCheckedAt = сега и
// /status се прегенерира; иначе — какво падна, нищо не се записва.
//
//   PW_ROOT=$(npm root -g) node tools/youtube_check.mjs            # с прозорец (по-близо до реалния)
//   PW_ROOT=$(npm root -g) node tools/youtube_check.mjs --headless
//
// Нужно: Node 20+, `npm i -g playwright` и `npx playwright install chromium` (Chromium на Playwright —
// маркираният Chrome от версия 137 не зарежда разархивирани разширения от командния ред). Безплатно.
// Не е в `npm test`; чистата логика (verdict) — в tests/youtube_check.test.mjs.
import { createRequire } from "node:module";
import { mkdtempSync, rmSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const ENFORCE = ["ytd-enforcement-message-view-model", "ytd-enforcement-message-desktop-renderer"];

/**
 * Пробите на един клип (по една на секунда) → решение. Проба: { t: currentTime, w: videoWidth,
 * ad: плейърът е в реклама, enforce: прозорецът на YouTube за блокерите се вижда }.
 */
export function verdict(samples) {
  const s = Array.isArray(samples) ? samples.filter((x) => x && typeof x.t === "number") : [];
  if (s.length < 5) return { ok: false, why: "твърде малко проби (плейърът не се появи)" };
  if (s.some((x) => x.enforce)) return { ok: false, why: "YouTube показа прозореца срещу блокерите" };
  if (s.some((x) => x.ad)) return { ok: false, why: "плейърът показа реклама (ad-showing)" };
  const advanced = s[s.length - 1].t - s[0].t;
  if (advanced < 5) return { ok: false, why: `видеото не върви (+${advanced.toFixed(1)} s за ${s.length} s)` };
  if (!s.some((x) => x.w > 0)) return { ok: false, why: "няма картина (0x0)" };
  return { ok: true, why: `върви (+${advanced.toFixed(1)} s), без реклама` };
}

async function main() {
  const require = createRequire(join(process.env.PW_ROOT || join(ROOT, "node_modules"), "/"));
  let chromium;
  try { ({ chromium } = require("playwright")); } catch { console.error("Няма playwright: npm i -g playwright && npx playwright install chromium, после PW_ROOT=$(npm root -g)."); process.exit(2); }
  const headless = process.argv.includes("--headless");
  const version = JSON.parse(readFileSync(join(ROOT, "manifest.json"), "utf8")).version;
  const profile = mkdtempSync(join(tmpdir(), "sa-ytcheck-"));
  const ctx = await chromium.launchPersistentContext(profile, {
    channel: "chromium", headless, viewport: { width: 1280, height: 800 },
    args: [`--disable-extensions-except=${ROOT}`, `--load-extension=${ROOT}`, "--autoplay-policy=no-user-gesture-required"],
  });
  const results = [];
  try {
    try { if (!ctx.serviceWorkers()[0]) await ctx.waitForEvent("serviceworker", { timeout: 20000 }); } catch {}
    await new Promise((r) => setTimeout(r, 8000)); // правилата и скриптовете се регистрират
    for (const p of ctx.pages()) if (p.url().startsWith("chrome-extension://")) await p.close().catch(() => {});
    const page = await ctx.newPage();
    // Началната страница на нов профил е празна („Try searching to get started“) — клиповете идват от
    // три различни търсения, по първия обикновен клип (не Shorts, не live) от всяко.
    const links = [];
    for (const q of ["music", "news", "travel"]) {
      await page.goto("https://www.youtube.com/results?search_query=" + q, { waitUntil: "domcontentloaded", timeout: 60000 });
      // Съгласието за бисквитки (ЕС): обикновено го отговаря самото разширение; ако не — „Reject all“.
      for (const re of [/^reject all$/i, /^отхвърляне на всички$/i, /^alle ablehnen$/i, /^rifiuta tutto$/i]) {
        try { await page.getByRole("button", { name: re }).first().click({ timeout: 2000 }); break; } catch {}
      }
      await page.waitForSelector('ytd-video-renderer a#thumbnail[href*="/watch?v="]', { timeout: 30000 });
      const url = await page.evaluate((seen) => [...document.querySelectorAll('ytd-video-renderer a#thumbnail[href*="/watch?v="]')]
        .filter((a) => !a.closest("ytd-video-renderer").querySelector('[aria-label="LIVE"], .badge-style-type-live-now-alternate'))
        .map((a) => "https://www.youtube.com/watch?v=" + new URL(a.href, location.href).searchParams.get("v"))
        .find((u) => !seen.includes(u)), links);
      if (url) links.push(url);
    }
    if (links.length < 3) throw new Error(`намерих ${links.length} клипа в търсенето`);
    for (const url of links) {
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 });
      // Центрове за данни (облак, VPN): Google ги праща на /sorry — проверката тогава не значи нищо.
      if (/\/sorry\//.test(page.url())) throw new Error("Google отговори с /sorry (мрежа на център за данни или VPN) — пусни проверката от домашна връзка");
      await page.waitForSelector("#movie_player video", { timeout: 30000 }).catch(() => {});
      const samples = [];
      for (let i = 0; i < 25; i++) {
        samples.push(await page.evaluate((enf) => {
          const v = document.querySelector("#movie_player video");
          const mp = document.getElementById("movie_player");
          const seen = (sel) => [...document.querySelectorAll(sel)].some((e) => e.getClientRects().length > 0);
          return v ? { t: v.currentTime, w: v.videoWidth, ad: !!(mp && mp.classList.contains("ad-showing")), enforce: enf.some(seen) } : null;
        }, ENFORCE).catch(() => null));
        await page.waitForTimeout(1000);
      }
      const v = verdict(samples);
      results.push({ url, ...v });
      console.log(`${v.ok ? "OK  " : "FAIL"} ${url} — ${v.why}`);
    }
  } finally {
    await ctx.close();
    rmSync(profile, { recursive: true, force: true });
  }
  if (results.length === 3 && results.every((r) => r.ok)) {
    const statusPath = join(ROOT, "tools", "status.json");
    const status = JSON.parse(readFileSync(statusPath, "utf8"));
    status.youtubeCheckedAt = new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
    writeFileSync(statusPath, JSON.stringify(status, null, 2) + "\n");
    execFileSync(process.execPath, [join(ROOT, "tools", "status_page.mjs")], { stdio: "inherit" });
    console.log(`\nYouTube с ${version}: три клипа без реклама. tools/status.json и server/status.html са обновени — комитни ги и деплойни сайта.`);
  } else {
    console.log(`\nYouTube с ${version}: проверката НЕ мина — нищо не е записано. Виж docs/RISKS.md § 7.`);
    process.exit(1);
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((e) => { console.error("Грешка:", e.message); process.exit(1); });
}
