#!/usr/bin/env node
// Автоматично подаване на URL-ите на Мастилко към IndexNow.
// IndexNow е един endpoint, който известява едновременно Bing, Yandex и др.
// (Google не участва — той се вижда през Search Console + sitemap-а).
//
// Ключът стои като public/<key>.txt (сервира се на https://mastilko-bg.com/<key>.txt),
// за да докаже собствеността — НЕ е нужен акаунт в Bing Webmaster Tools.
// Пуска се от deploy/autodeploy.sh СЛЕД успешен деплой, или ръчно:
//   node scripts/indexnow.mjs
//
// URL-ите се четат от ЖИВИЯ sitemap (единствен източник на истината —
// src/app/sitemap.ts), затова добавена/премахната страница се подава към Bing
// автоматично, без ръчна синхронизация тук. Ако sitemap-ът е недостъпен
// (напр. още няма публичен TLS при първо пускане), падаме на фиксиран списък.
//
// Изход 0 при успех (или при HTTP 200/202); печата отговора. Не чупи деплоя при
// мрежов проблем — само предупреждава.

const HOST = "mastilko-bg.com";
const KEY = "a7165a3a38349feabee2f8ce359f4002";
const KEY_LOCATION = `https://${HOST}/${KEY}.txt`;
const ORIGIN = `https://${HOST}`;

// Откъде да прочетем sitemap-а. По подразбиране локалният порт на услугата
// (работи и преди публичен DNS/TLS — sitemap.ts така или иначе изписва
// абсолютни https://mastilko-bg.com URL-и). Презапис през env при нужда.
const SITEMAP_URL =
  process.env.MASTILKO_SITEMAP_URL || "http://127.0.0.1:3200/sitemap.xml";

// Резервен списък, ако sitemap-ът е недостъпен (в синхрон със src/app/sitemap.ts).
const FALLBACK_PATHS = [
  "",
  "/etiketi",
  "/vizitki",
  "/cv",
  "/pismo",
  "/gramoti",
  "/pokani",
  "/tabelki",
  "/wifi",
  "/impresum",
  "/poveritelnost",
  "/usloviya",
];

// Изтегля живия sitemap и връща само нашите (същия HOST) абсолютни URL-и.
async function urlsFromSitemap() {
  const res = await fetch(SITEMAP_URL, { headers: { Accept: "application/xml" } });
  if (!res.ok) throw new Error(`sitemap HTTP ${res.status}`);
  const xml = await res.text();
  const urls = [...xml.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/gi)]
    .map((m) => m[1].trim())
    .filter((u) => u.startsWith(`${ORIGIN}/`) || u === ORIGIN);
  if (urls.length === 0) throw new Error("sitemap без <loc> за нашия хост");
  return [...new Set(urls)];
}

let urlList;
let source;
try {
  urlList = await urlsFromSitemap();
  source = `sitemap (${SITEMAP_URL})`;
} catch (err) {
  urlList = FALLBACK_PATHS.map((p) => `${ORIGIN}${p}`);
  source = `резервен списък (sitemap пропуснат: ${err?.message ?? err})`;
}

const body = { host: HOST, key: KEY, keyLocation: KEY_LOCATION, urlList };

try {
  const res = await fetch("https://api.indexnow.org/indexnow", {
    method: "POST",
    headers: { "Content-Type": "application/json; charset=utf-8" },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  if (res.ok) {
    console.log(`IndexNow: подадени ${urlList.length} URL-а от ${source} — HTTP ${res.status}`);
  } else {
    console.warn(`IndexNow: HTTP ${res.status} — ${text || "(празен отговор)"}`);
  }
} catch (err) {
  console.warn(`IndexNow: пропуснато (мрежов проблем): ${err?.message ?? err}`);
}
