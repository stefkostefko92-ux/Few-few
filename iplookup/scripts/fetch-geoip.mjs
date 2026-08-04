#!/usr/bin/env node
/**
 * Сваля офлайн гео базата DB-IP City Lite.
 *
 * Защо не идва в хранилището: 124 MB чужд файл с МЕСЕЧНИ издания. Хранилище с
 * такъв файл става неудобно завинаги, а базата остарява сама.
 *
 * Лиценз: **CC BY 4.0**. Ползването е позволено търговски, но атрибуцията е
 * УСЛОВИЕ — видим линк към db-ip.com на страниците, които показват данните.
 * Той живее в `src/lib/site.ts` → `DATA_SOURCES`.
 *
 * Съзнателно НЕ сваляме MaxMind GeoLite2: EULA-та ѝ забранява употреба за
 * идентифициране или локализиране на конкретно домакинство, лице или адрес.
 *
 * Употреба:
 *   node scripts/fetch-geoip.mjs [--dir data] [--month YYYY-MM]
 *
 * После:
 *   IPLOOKUP_GEOIP_DB=data/dbip-city-lite-YYYY-MM.mmdb npm start
 */

import { createWriteStream } from "node:fs";
import { mkdir, rename, stat, unlink } from "node:fs/promises";
import { createGunzip } from "node:zlib";
import { pipeline } from "node:stream/promises";
import { Readable } from "node:stream";
import { join } from "node:path";

const args = process.argv.slice(2);
const flag = (name, fallback) => {
  const index = args.indexOf(`--${name}`);
  return index >= 0 && args[index + 1] ? args[index + 1] : fallback;
};

const directory = flag("dir", "data");
// Изданията излизат на 1-во число. По подразбиране търсим текущия месец и при
// нужда се връщаме един назад — в първите часове на месеца новото още го няма.
const month = flag("month", new Date().toISOString().slice(0, 7));

function previousMonth(value) {
  const [year, m] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, m - 2, 1));
  return date.toISOString().slice(0, 7);
}

async function download(forMonth) {
  const url = `https://download.db-ip.com/free/dbip-city-lite-${forMonth}.mmdb.gz`;
  process.stdout.write(`Сваляне: ${url}\n`);

  const response = await fetch(url);
  if (response.status === 404) return null;
  if (!response.ok || !response.body) throw new Error(`HTTP ${response.status}`);

  await mkdir(directory, { recursive: true });
  const target = join(directory, `dbip-city-lite-${forMonth}.mmdb`);
  const partial = `${target}.part`;

  // Разгъваме в движение — иначе двата файла заемат 190 MB наведнъж.
  await pipeline(Readable.fromWeb(response.body), createGunzip(), createWriteStream(partial));
  // Преименуваме чак накрая: прекъснато сваляне не бива да остави файл, който
  // изглежда готов, а е отрязан.
  await rename(partial, target);
  return target;
}

async function main() {
  let target = null;
  try {
    target = await download(month);
    if (!target) {
      const earlier = previousMonth(month);
      process.stdout.write(`Изданието за ${month} още го няма — пробвам ${earlier}.\n`);
      target = await download(earlier);
    }
  } catch (error) {
    process.stderr.write(`Свалянето се провали: ${error.message}\n`);
    process.exitCode = 1;
    return;
  }

  if (!target) {
    process.stderr.write("Няма налично издание. Провери https://db-ip.com/db/lite.php\n");
    process.exitCode = 1;
    return;
  }

  const { size } = await stat(target);
  process.stdout.write(
    `\nГотово: ${target} (${(size / 1024 / 1024).toFixed(1)} MB)\n\n` +
      `Пусни с:\n  IPLOOKUP_GEOIP_DB=${target} npm start\n\n` +
      `Лиценз CC BY 4.0 — атрибуцията към db-ip.com е задължителна и вече е\n` +
      `във футъра на сайта. Не я махай.\n`,
  );
}

// Ако сме прекъснати, не оставяме отрязан файл да се мисли за валидна база.
process.on("SIGINT", async () => {
  await unlink(join(directory, `dbip-city-lite-${month}.mmdb.part`)).catch(() => {});
  process.exit(130);
});

await main();
