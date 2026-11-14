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
//
// Подава САМО променените адреси (lastmod ≠ последно подадения) + излезлите от
// sitemap (за да видят noindex/404). Състоянието е в server/.state/indexnow.json
// (рънтайм, извън git, оцелява при деплой). Преди: всички ~5300 при ВСЕКИ деплой
// на която и да е част от монорепото — масово преподаване на непроменени адреси.
// sitemap.xml вече е индекс → четат се секциите (sitemap-*.xml) от site/.

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { ROOT, SITE_DIR } from './lib/paths.js';

const STATO_FILE = join(ROOT, 'server', '.state', 'indexnow.json');
const MAX_URL = 10_000;

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
 * <loc>+<lastmod> от urlset ИЛИ sitemapindex.
 * @param {string} xml
 * @returns {Array<{ loc: string, lastmod: string }>}
 */
export function estraiVoci(xml) {
  const out = [];
  const re = /<(?:url|sitemap)>\s*<loc>([^<]+)<\/loc>(?:\s*<lastmod>([^<]*)<\/lastmod>)?/g;
  let m;
  while ((m = re.exec(xml)) !== null) out.push({ loc: m[1].trim(), lastmod: (m[2] || '').trim() });
  return out;
}

/** @param {string} xml @returns {boolean} */
export function eIndice(xml) {
  return /<sitemapindex[\s>]/.test(xml);
}

/**
 * Кои адреси да се подадат: нови/с променен lastmod + излезлите от sitemap.
 * @param {Array<{ loc: string, lastmod: string }>} voci
 * @param {Record<string, string>} stato url → последно подаден lastmod
 * @returns {{ urlList: string[], nuovoStato: Record<string, string> }}
 */
export function daInviare(voci, stato) {
  /** @type {Record<string, string>} */
  const nuovoStato = {};
  const urlList = [];
  for (const v of voci) {
    nuovoStato[v.loc] = v.lastmod;
    if (stato[v.loc] !== v.lastmod) urlList.push(v.loc);
  }
  for (const u of Object.keys(stato)) if (!(u in nuovoStato)) urlList.push(u);
  return { urlList, nuovoStato };
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
  let voci = estraiVoci(xml);
  if (eIndice(xml)) {
    /** @type {Array<{ loc: string, lastmod: string }>} */
    const tutte = [];
    for (const s of voci) {
      const nome = s.loc.split('/').pop() || '';
      if (!/^sitemap-[\w-]+\.xml$/.test(nome)) continue;
      tutte.push(...estraiVoci(await readFile(join(SITE_DIR, nome), 'utf8').catch(() => '')));
    }
    voci = tutte;
  }
  if (!voci.length) { console.error('IndexNow: няма URL-и в sitemap — пропускам.'); return; }

  /** @type {Record<string, string>} */
  const stato = JSON.parse(await readFile(STATO_FILE, 'utf8').catch(() => '{}'));
  const { urlList, nuovoStato } = daInviare(voci, stato);
  if (!urlList.length) { console.log(`IndexNow: ${voci.length} URL, нищо променено — нищо за подаване.`); return; }

  for (let i = 0; i < urlList.length; i += MAX_URL) {
    const payload = costruisciPayload(siteUrl, key, urlList.slice(i, i + MAX_URL));
    const res = await fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'content-type': 'application/json; charset=utf-8' },
      body: JSON.stringify(payload),
    });
    // 200/202 = прието; 422 = ключът още не е верифицируем (сайтът не е жив) — не е фатално.
    console.log(`IndexNow: ${payload.urlList.length} URL (променени от ${voci.length}) → ${res.status} ${res.statusText} (${payload.host})`);
    if (!res.ok && res.status !== 202) {
      const body = await res.text().catch(() => '');
      console.error(`IndexNow подробности: ${body.slice(0, 300)}`);
      process.exitCode = 1;
      return; // без запис на състоянието → следващият деплой опитва пак
    }
  }
  try {
    await mkdir(dirname(STATO_FILE), { recursive: true });
    await writeFile(STATO_FILE, JSON.stringify(nuovoStato));
  } catch (err) {
    console.error('IndexNow: състоянието не се записа (следващият път ще подаде пак):', err instanceof Error ? err.message : err);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => { console.error('IndexNow грешка:', err.message); process.exitCode = 1; });
}
