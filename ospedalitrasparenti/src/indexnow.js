// @ts-check
// IndexNow — активно уведомяване на търсачките (Bing, Yandex, Seznam…) при нови/
// обновени URL-и. Единственият НАИСТИНА автоматичен канал: Google премахна sitemap
// „ping", но IndexNow приема push с публичен ключ. Google не поддържа IndexNow —
// за него откриваемостта остава пасивна (sitemap.xml + robots.txt).
//
// Протокол: POST на JSON { host, key, keyLocation, urlList } към endpoint-а. Ключът
// се верифицира, като търсачката изтегли https://<host>/<key>.txt (build-site го
// генерира). До 10 000 URL на заявка (имаме ~5288 → една заявка).
//
// Пуска се СЛЕД като сайтът е жив (иначе верификацията на ключа пада). autodeploy.sh
// го вика best-effort след health check. Ръчно: npm run indexnow.

import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { ROOT, SITE_DIR } from './lib/paths.js';

const ENDPOINT = 'https://api.indexnow.org/IndexNow';

/**
 * Извлича всички <loc> адреси от sitemap XML.
 * @param {string} xml
 * @returns {string[]}
 */
export function estraiUrl(xml) {
  const out = [];
  const re = /<loc>([^<]+)<\/loc>/g;
  let m;
  while ((m = re.exec(xml)) !== null) out.push(m[1].trim());
  return out;
}

/**
 * Сглобява IndexNow payload-а (host от siteUrl; keyLocation = публичния ключ файл).
 * @param {string} siteUrl
 * @param {string} key
 * @param {string[]} urlList
 * @returns {{ host: string, key: string, keyLocation: string, urlList: string[] }}
 */
export function costruisciPayload(siteUrl, key, urlList) {
  const host = new URL(siteUrl).host;
  return { host, key, keyLocation: `${siteUrl.replace(/\/$/, '')}/${key}.txt`, urlList };
}

async function main() {
  const config = JSON.parse(await readFile(join(ROOT, 'config.json'), 'utf8'));
  const siteUrl = config.siteUrl;
  const key = config.indexNowKey;
  if (!siteUrl || !key) { console.error('IndexNow: липсва siteUrl или indexNowKey в config.json — пропускам.'); return; }

  const xml = await readFile(join(SITE_DIR, 'sitemap.xml'), 'utf8').catch(() => '');
  const urlList = estraiUrl(xml);
  if (!urlList.length) { console.error('IndexNow: няма URL-и в sitemap.xml — пропускам.'); return; }

  const payload = costruisciPayload(siteUrl, key, urlList);
  const res = await fetch(ENDPOINT, {
    method: 'POST',
    headers: { 'content-type': 'application/json; charset=utf-8' },
    body: JSON.stringify(payload),
  });
  // 200/202 = прието; 422 = ключът още не е верифицируем (сайтът не е жив) — не е фатално.
  console.log(`IndexNow: ${urlList.length} URL → ${res.status} ${res.statusText} (${payload.host})`);
  if (!res.ok && res.status !== 202) {
    const body = await res.text().catch(() => '');
    console.error(`IndexNow подробности: ${body.slice(0, 300)}`);
    process.exitCode = 1;
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => { console.error('IndexNow грешка:', err.message); process.exitCode = 1; });
}
