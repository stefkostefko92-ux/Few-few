#!/usr/bin/env node
// indexnow.mjs — автоматично подаване на URL-и към търсачките през IndexNow.
// IndexNow е отворен протокол: едно подаване стига до Bing, Yandex, Seznam.cz,
// Naver, Yep и др. едновременно. GOOGLE НЕ участва в IndexNow (виж бележката долу).
//
// Употреба:
//   node tools/seo/indexnow.mjs <siteUrl> [опции]
//     --key KEY            IndexNow ключ (иначе: env INDEXNOW_KEY, после --key-file,
//                          после опит да се изтегли <siteUrl>/indexnow-key.txt)
//     --key-file PATH      локален файл, съдържащ само ключа
//     --key-location URL   публичният адрес на ключовия файл (по подразбиране
//                          <siteUrl>/<key>.txt — стандартът на IndexNow)
//     --sitemap URL|PATH   източник на URL-ите (по подразбиране <siteUrl>/sitemap.xml)
//     --url U              изрично подаване само на конкретни адреси (може повторено)
//     --dry-run            само покажи какво ще подадеш, без да пращаш
//   node tools/seo/indexnow.mjs --gen-key    # генерира нов 32-hex ключ (за нов сайт)
//
// Изход: 0 при успех (200/202), 1 при неуспех, 2 при грешен аргумент.
//
// GOOGLE: не поддържа IndexNow и спря ping-а за sitemap (юни 2023). За Google
// автоматичното е: (1) свеж sitemap.xml (открива се сам) + (2) Search Console
// (виж tools/seo/gsc.mjs). Затова „търсачките, в които може автоматично" = IndexNow.

import { randomBytes } from "node:crypto";
import { readFile } from "node:fs/promises";

const args = process.argv.slice(2);

if (args[0] === "--gen-key") {
  console.log(randomBytes(16).toString("hex")); // 32 hex знака (валиден IndexNow ключ)
  process.exit(0);
}

function getOpt(name) {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
}
function getAll(name) {
  const out = [];
  for (let i = 0; i < args.length; i++) if (args[i] === name && args[i + 1]) out.push(args[i + 1]);
  return out;
}

const siteUrl = args.find((a) => /^https?:\/\//.test(a));
if (!siteUrl) {
  console.error("Употреба: node tools/seo/indexnow.mjs <siteUrl> [--key … | --key-file …] [--sitemap …] [--url …] [--dry-run]");
  process.exit(2);
}
const base = siteUrl.replace(/\/+$/, "");
const host = new URL(base).host;
const dryRun = args.includes("--dry-run");

// Форматът на ключа по спецификацията на IndexNow: 8–128 знака, само букви,
// цифри и тире. Едно определение, ползвано и при изтеглянето, и при проверката.
const KEY_RE = /^[a-zA-Z0-9-]{8,128}$/;

async function resolveKey() {
  if (getOpt("--key")) return getOpt("--key").trim();
  const kf = getOpt("--key-file");
  if (kf) return (await readFile(kf, "utf8")).trim();
  if (process.env.INDEXNOW_KEY) return process.env.INDEXNOW_KEY.trim();
  // последен опит: изтегли конвенционалния файл от живия сайт.
  //
  // ВНИМАНИЕ (реален деплой, 07.08.2026): при SPA с `try_files … /index.html`
  // ТОЗИ адрес връща **200 с HTML**, а не 404 — тоест `r.ok` е вярно и въпреки
  // това няма ключ. Supreme стои точно така: ключът е на `<key>.txt`, а
  // `/indexnow-key.txt` дава index.html. Затова проверяваме СЪДЪРЖАНИЕТО и
  // казваме какво е дошло — иначе съобщението обвинява „липсващ ключ" за файл,
  // който всъщност е налице, само че на друг адрес.
  try {
    const r = await fetch(`${base}/indexnow-key.txt`, { cache: "no-store", signal: AbortSignal.timeout(10000) });
    if (r.ok) {
      const body = (await r.text()).trim();
      if (KEY_RE.test(body)) return body;
      console.error(`  ↳ ${base}/indexnow-key.txt върна 200, но съдържанието не е ключ`);
      console.error("    (типично за SPA fallback — всеки непознат път връща index.html).");
    }
  } catch {
    /* няма */
  }
  return "";
}

async function collectUrls(key) {
  const explicit = getAll("--url");
  if (explicit.length) return explicit;
  const src = getOpt("--sitemap") || `${base}/sitemap.xml`;
  let xml = "";
  try {
    if (/^https?:\/\//.test(src)) {
      const r = await fetch(src, { cache: "no-store", signal: AbortSignal.timeout(20000) });
      if (r.ok) xml = await r.text();
    } else {
      xml = await readFile(src, "utf8");
    }
  } catch {
    /* fallback долу */
  }
  const urls = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1].trim()).filter(Boolean);
  return urls.length ? urls.slice(0, 9000) : [`${base}/`];
}

const key = await resolveKey();
if (!key || !KEY_RE.test(key)) {
  console.error("✘ Липсва валиден IndexNow ключ. Подай --key, --key-file, env INDEXNOW_KEY,");
  console.error("  или качи ключа на <siteUrl>/indexnow-key.txt. Нов ключ: node tools/seo/indexnow.mjs --gen-key");
  console.error("  Ако ключът е на <siteUrl>/<key>.txt (схемата на Supreme), подай и двете:");
  console.error("  --key-file <път до файла> --key-location https://<домейн>/<key>.txt");
  process.exit(1);
}
// По подразбиране ползваме фиксирания път /indexnow-key.txt (както zabobovdol),
// за да работи автоматичното подаване без да се знае конкретният ключ (напр.
// в deploy hook-а). IndexNow позволява keyLocation да е кой да е адрес на хоста,
// стига да съдържа ключа. Смени с --key-location при нужда от <key>.txt схема.
const keyLocation = getOpt("--key-location") || `${base}/indexnow-key.txt`;
const urlList = await collectUrls(key);

console.log(`IndexNow · host=${host} · ${urlList.length} URL · keyLocation=${keyLocation}`);
if (dryRun) {
  for (const u of urlList.slice(0, 20)) console.log("  " + u);
  if (urlList.length > 20) console.log(`  … (+${urlList.length - 20})`);
  console.log("(--dry-run: нищо не е подадено)");
  process.exit(0);
}

try {
  const res = await fetch("https://api.indexnow.org/indexnow", {
    method: "POST",
    headers: {
      "content-type": "application/json; charset=utf-8",
      // Bing/IndexNow връщат 403 без User-Agent — Node fetch не слага по подразбиране.
      "user-agent": `${host} IndexNow client (+${base})`,
    },
    body: JSON.stringify({ host, key, keyLocation, urlList }),
    signal: AbortSignal.timeout(20000),
  });
  if (res.status === 200 || res.status === 202) {
    console.log(`✓ Подадени ${urlList.length} URL (HTTP ${res.status}). Bing/Yandex/Seznam/Naver ще ги обходят.`);
    process.exit(0);
  }
  const body = (await res.text().catch(() => "")).replace(/\s+/g, " ").trim().slice(0, 200);
  console.error(`✘ IndexNow върна ${res.status}. ${body}`);
  if (res.status === 403) {
    console.error(`  403 обикновено значи, че ключовият файл (${keyLocation}) не е публично`);
    console.error(`  достъпен или не съвпада с ключа. Провери, че сайтът е деплойнат по HTTPS`);
    console.error(`  и че ${keyLocation} връща точно „${key}".`);
  }
  process.exit(1);
} catch (e) {
  console.error("✘ Грешка при свързване:", e instanceof Error ? e.message : String(e));
  process.exit(1);
}
