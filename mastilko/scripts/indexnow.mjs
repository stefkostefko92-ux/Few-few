#!/usr/bin/env node
// Автоматично подаване на URL-ите на Мастилко към IndexNow.
// IndexNow е един endpoint, който известява едновременно Bing, Yandex и др.
// (Google не участва — той се вижда през Search Console + sitemap-а).
//
// Ключът стои като public/<key>.txt (сервира се на https://mastilko-bg.com/<key>.txt),
// за да докаже собствеността. Пуска се от deploy/autodeploy.sh СЛЕД успешен деплой,
// или ръчно:  node scripts/indexnow.mjs
//
// Изход 0 при успех (или при HTTP 200/202); печата отговора. Не чупи деплоя при
// мрежов проблем — само предупреждава.

const HOST = "mastilko-bg.com";
const KEY = "a7165a3a38349feabee2f8ce359f4002";
const KEY_LOCATION = `https://${HOST}/${KEY}.txt`;

// Публичните индексируеми пътища (в синхрон със src/app/sitemap.ts).
const PATHS = [
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

const urlList = PATHS.map((p) => `https://${HOST}${p}`);

const body = { host: HOST, key: KEY, keyLocation: KEY_LOCATION, urlList };

try {
  const res = await fetch("https://api.indexnow.org/indexnow", {
    method: "POST",
    headers: { "Content-Type": "application/json; charset=utf-8" },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  if (res.ok) {
    console.log(`IndexNow: подадени ${urlList.length} URL-а — HTTP ${res.status}`);
  } else {
    console.warn(`IndexNow: HTTP ${res.status} — ${text || "(празен отговор)"}`);
  }
} catch (err) {
  console.warn(`IndexNow: пропуснато (мрежов проблем): ${err?.message ?? err}`);
}
