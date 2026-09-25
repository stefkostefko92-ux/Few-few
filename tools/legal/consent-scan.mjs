#!/usr/bin/env node
// consent-scan.mjs — runtime гейт „тракинг преди съгласие" (чл. 5(3) ePrivacy + GDPR).
// Зарежда страницата с ЧИСТО състояние и записва кои бисквитки/заявки към трети домейни тръгват
// ПРЕДИ всякакво взаимодействие. WebFetch вижда само статичен HTML; това вижда реалното поведение.
//
//   node tools/legal/consent-scan.mjs <https-url>
//
// ДОГОВОР ЗА ИЗХОД (това е ГЕЙТ, не декорация):
//   0 = проверено и чисто · 1 = проверено, има находки · 2 = НЕ МОЖА да провери (браузър/зареждане)
//
// Старата версия имаше два тихи провала, точно от класа „зелено, защото сме слепи":
//   • провален goto се гълташе (`catch(() => {})`) → нула бисквитки, нула заявки → 🟢 присъда
//     върху СТРАНИЦА, КОЯТО НЕ СЕ Е ЗАРЕДИЛА. GDPR гейт, който хвали недостъпен сайт.
//   • присъдата не влизаше в изходния код — 🔴 находки пак излизаха с exit 0, значи никой
//     конвейер не можеше да гейтва на нея.
// Плюс: искаше пълния playwright и се извинваше, въпреки че работещият път (playwright-core +
// локалният Chromium) съществуваше на един ред — вече идва от tools/lib/browser.mjs.

import { launchChromium } from "../lib/browser.mjs";
import { finish } from "../lib/emit.mjs";

// Есенциални бисквитки (не искат съгласие): сесия/CSRF/език/самото съгласие. `sessid` покрива
// PHPSESSID/JSESSIONID — класически есенциални, които /session/ НЕ хваща (стар пропуск).
export const ESSENTIAL = /session|sessid|csrf|xsrf|consent|lang|locale|zbd_/i;

// Чести трекери/реклама/аналитика (не изчерпателно — груб филтър; находката иска ръчна сверка).
export const TRACKER_HINT = /google-analytics|googletagmanager|doubleclick|facebook|fbcdn|hotjar|clarity|segment|mixpanel|amplitude|tiktok|yandex|matomo|plausible|fonts\.googleapis|fonts\.gstatic/i;

/**
 * Чистата присъда — отделена от I/O, за да е тествана: точно тук живееше дефектът
 * „празна страница = зелено" и никой тест не можеше да го хване.
 * @returns {{code: 0|1|2, label: string}}
 */
export function verdict({ loaded, cookies = [], thirdPartyKeys = [] }) {
  if (!loaded) return { code: 2, label: "неизмерено — страницата не се зареди; това НЕ е зелено" };
  const trackers = thirdPartyKeys.filter((k) => k.includes("⚠")).length;
  const nonEssential = cookies.filter((c) => !ESSENTIAL.test(c.name));
  if (trackers || nonEssential.length)
    return { code: 1, label: `находки: ${trackers} вероятни трекера · ${nonEssential.length} неесенциални бисквитки преди съгласие` };
  return { code: 0, label: "чисто — няма явни неесенциални трекери/бисквитки преди съгласие (ръчната сверка остава)" };
}

async function main() {
  const url = process.argv[2];
  if (!url || !/^https?:\/\//.test(url)) {
    // и липсващ, и невалиден аргумент (папка, файл) = грешна употреба, НЕ срив със стек
    console.error("Употреба: node tools/legal/consent-scan.mjs <http(s) URL>");
    return finish(2);
  }

  const { browser, error } = await launchChromium();
  if (error) { console.error(`✘ Не мога да проверя: ${error}`); return finish(2); }

  const ctx = await browser.newContext();
  const thirdParty = new Map();
  const target = new URL(url).hostname.replace(/^www\./, "");

  ctx.on("request", (req) => {
    try {
      const h = new URL(req.url()).hostname.replace(/^www\./, "");
      if (h && !h.endsWith(target)) {
        const flag = TRACKER_HINT.test(h);
        const k = h + (flag ? "  ⚠ вероятен трекер/3rd-party" : "");
        thirdParty.set(k, (thirdParty.get(k) || 0) + 1);
      }
    } catch { /* data:/about: URI — няма хост, няма какво да броим */ }
  });

  const page = await ctx.newPage();
  // `load` е задължителен (провалът му = неизмерено); networkidle е желателен (късните заявки),
  // но timeout там НЕ обезсмисля измерването — страницата е реална, просто шумна.
  const resp = await page.goto(url, { waitUntil: "load", timeout: 30000 }).catch(() => null);
  const loaded = Boolean(resp);
  if (loaded) await page.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => {});
  const cookies = loaded ? await ctx.cookies() : [];
  await browser.close();

  const v = verdict({ loaded, cookies, thirdPartyKeys: [...thirdParty.keys()] });

  console.log(`\n# Consent scan (преди взаимодействие) — ${url}\n`);
  if (!loaded) {
    console.log("✘ Страницата НЕ се зареди (DNS/timeout/отказ). Няма измерване — няма присъда.");
  } else {
    if (resp && !resp.ok()) console.log(`⚠ HTTP ${resp.status()} — сканирам каквото се зареди (и грешните страници носят трекери).`);
    console.log(`── Бисквитки, зададени без съгласие: ${cookies.length} ──`);
    for (const c of cookies) console.log(`  ${c.name}  (${c.domain})  ${c.httpOnly ? "HttpOnly" : ""} ${c.secure ? "Secure" : ""} SameSite=${c.sameSite}${ESSENTIAL.test(c.name) ? "  (есенциална)" : "  ⚠ иска съгласие"}`);
    console.log(`\n── Заявки към трети домейни преди съгласие: ${thirdParty.size} ──`);
    [...thirdParty.entries()].sort((a, b) => b[1] - a[1]).forEach(([h, n]) => console.log(`  ${String(n).padStart(3)}× ${h}`));
  }

  console.log("\n── Присъда ──");
  console.log(`${v.code === 0 ? "🟢" : v.code === 1 ? "🔴" : "⚪"} ${v.label}`);
  if (v.code === 1) console.log("   Провери дали зареждането е гейтнато зад affirmative consent (чл. 5(3) ePrivacy).");
  console.log("\nРазширение: повтори за reject-all и accept-all и сравни (3-state diff).");
  console.log("Това е обща информация, не е правен съвет.");
  return finish(v.code);
}

// CLI guard — задължителен: тестът внася verdict(); валидация/exit на върха на модула би убила
// тест-рънъра при import (класът, който удари два пъти в един ден: syntax-check, prelaunch-audit).
if (import.meta.url === `file://${process.argv[1]}`) await main();
