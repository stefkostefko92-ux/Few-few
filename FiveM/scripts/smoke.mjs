/**
 * Регресионен обход срещу ЖИВ инстанс. Пуска се на ръка преди пускане и след
 * всеки едър рефактор:
 *
 *   node scripts/smoke.mjs                       # 127.0.0.1:3010
 *   PROBE_BASE_URL=https://…  node scripts/smoke.mjs   # срещу друг адрес
 *
 * НЕ е в `npm test` (той е чисти функции, без база и без мрежа) и НЕ е в CI.
 *
 * ЗАЩО съществува. `npm test` покрива чистите функции, а `next build` доказва,
 * че кодът се компилира — нито едното не хваща страница, която връща 500 при
 * реален рендер. Точно това е рискът след механичен рефактор: `resolveLocale`
 * смени 43 места в 25 файла, а `JsonLd` — 16 блока в 10 файла. Компилиращ се
 * код, който гърми при рендер, минава и двата гейта.
 *
 * Изходен код: 0 = чисто, 1 = има провал, 2 = НЕИЗМЕРЕНО (сайтът не отговаря).
 */
/**
 * `127.0.0.1`, НЕ `localhost` — и това е измерено на живия сървър, не избор на
 * стил. `docker-compose.yml` публикува `127.0.0.1:3010:3000`, тоест САМО IPv4;
 * `localhost` на Ubuntu сочи първо към `::1`, а Node 18+ пробва IPv6 пръв.
 * Резултатът беше ECONNREFUSED на първата заявка и скрипт, който умира БЕЗ да
 * отпечата нито ред — изглеждаше сякаш не се е пуснал.
 */
const BASE = process.env.PROBE_BASE_URL ?? 'http://127.0.0.1:3010';

/**
 * Предварителна проверка, преди същинския обход. Без нея всяка мрежова грешка
 * излиза като необработено отхвърляне със стек — а причината почти винаги е
 * тривиална (сайтът не върви, или грешен адрес) и заслужава изречение, не стек.
 */
try {
  await fetch(`${BASE}/api/health`);
} catch (error) {
  console.error(`✗ ${BASE} не отговаря: ${error instanceof Error ? error.message : error}`);
  console.error('  Сайтът пуснат ли е? Портът се публикува на 127.0.0.1:3010 (само IPv4).');
  console.error('  Друг адрес: PROBE_BASE_URL=https://… node scripts/smoke.mjs');
  process.exit(2);
}

let bad = 0;
const check = (ok, msg) => {
  console.log(`${ok ? '✓' : '✗'} ${msg}`);
  if (!ok) bad += 1;
};
const get = async (path) => (await fetch(BASE + path)).text();

// ── 1. Всяка страница рендира ли се, на двата езика ─────────────────────────
const PATHS = [
  '',
  '/servers',
  '/rules',
  '/tutorials',
  '/streamers',
  '/news',
  '/submit',
  '/report',
  '/faq',
  '/team',
  '/contact',
  '/support',
  '/impresum',
  '/privacy',
  '/terms',
  '/servers/whitelist',
  '/servers/framework/esx',
  '/servers/framework/qbcore',
];
let pages = 0;
for (const locale of ['bg', 'en']) {
  for (const path of PATHS) {
    const res = await fetch(`${BASE}/${locale}${path}`);
    if (res.status !== 200) check(false, `/${locale}${path} → ${res.status}`);
    pages += 1;
  }
}
for (const path of ['/sitemap.xml', '/robots.txt', '/api/health']) {
  const res = await fetch(BASE + path);
  if (res.status !== 200) check(false, `${path} → ${res.status}`);
  pages += 1;
}
check(bad === 0, `${pages} адреса рендират се без грешка`);

// ── 2. Структурираните данни са валидни И екранирани ────────────────────────
// Име на сървър със `</script>` затваря блока — затова всичко минава през
// `jsonLdString`, а от одита насам и през един компонент.
let blocks = 0;
for (const path of ['/bg', '/bg/servers', '/bg/rules', '/bg/tutorials', '/bg/faq', '/bg/streamers', '/en']) {
  const html = await get(path);
  const found = [...html.matchAll(/<script type="application\/ld\+json">(.*?)<\/script>/gs)];
  if (found.length === 0) check(false, `${path}: изчезнаха структурираните данни`);
  for (const [, body] of found) {
    blocks += 1;
    try {
      JSON.parse(body);
    } catch {
      check(false, `${path}: невалиден JSON`);
    }
    if (body.toLowerCase().includes('</script')) check(false, `${path}: НЕекраниран </script>`);
  }
}
check(blocks > 0, `${blocks} блока структурирани данни: валидни и екранирани`);

// ── 3. Стойност от URL не вали страница ─────────────────────────────────────
// `?error=__proto__` връщаше `Object.prototype` и Server Component-ът гърмеше.
for (const evil of ['__proto__', 'constructor', 'toString', 'няма-такъв']) {
  const res = await fetch(`${BASE}/bg/submit?error=${encodeURIComponent(evil)}`);
  check(res.status === 200, `?error=${evil} → ${res.status}`);
}

// ── 4. Панелът пази вратата ─────────────────────────────────────────────────
for (const path of [
  '/bg/admin',
  '/bg/admin/queue',
  '/bg/admin/servers',
  '/bg/admin/streamers',
  '/bg/admin/integrations',
  '/bg/admin/news',
  '/en/admin',
]) {
  const res = await fetch(BASE + path, { redirect: 'manual' });
  check(res.status === 307, `${path} без сесия → ${res.status} (иска се 307)`);
}
const robots = await get('/robots.txt');
check(robots.includes('/admin'), 'robots.txt забранява панела');

// ── 5. Правните обещания са ВИДИМИ, не само записани ────────────────────────
const privacy = await get('/bg/privacy');
check(/\d{4}-\d{2}-\d{2}/.test(privacy), 'политиката показва дата на редакцията (чл. 12(1) ОРЗД)');
// ЦЕЛТА на котвата се проверява на ВСЕКИ език, не само на български. Досега
// се гледаше само `/bg/terms`, а на `/en/terms` id-то се вадеше от преведеното
// заглавие (`how-we-order-servers`) — връзката от английската начална водеше
// до върха на документа и гейтът беше зелен от слепота.
for (const locale of ['bg', 'en']) {
  const terms = await get(`/${locale}/terms`);
  check(
    terms.includes('id="kak-podrezhdame-sarvarite"'),
    `/${locale}/terms: разделът за класирането има котва (чл. 7(4а) Дир. 2005/29)`,
  );
}
// Класирани резултати има на ДВЕ места от landing-а насам: тийзърът на
// началната и пълният каталог. Чл. 7, ал. 4а иска разкритието да е пряко
// достъпно от СТРАНИЦАТА С РЕЗУЛТАТИТЕ — тоест и на двете, не на едната.
for (const path of ['/bg', '/bg/servers', '/en', '/en/servers']) {
  const html = await get(path);
  check(
    html.includes('#kak-podrezhdame-sarvarite'),
    `${path}: резултатите сочат ПРЯКО към класирането`,
  );
}
const report = await get('/bg/report');
check(
  report.includes('anonymousAllowed'),
  'сигналът позволява анонимност по чл. 3–7 Дир. 2011/93 (чл. 16(2)(в) DSA)',
);

// ── 6. Хедърът носи навигацията, която работи и без JavaScript ──────────────
// Хамбургерът е клиентски компонент, но се РЕНДИРА на сървъра — значи ако
// някога стане чисто клиентски (или гръмне при рендер), тези редове падат.
// Проверява се сървърният HTML, защото точно той стига до търсачките и до
// посетител с блокиран скрипт.
const header = (html) => html.slice(html.indexOf('<header'), html.indexOf('</header>'));
for (const path of ['/bg/rules', '/en/rules']) {
  const h = header(await get(path));
  check(h.includes('/brand/logo.png'), `${path}: логото е в хедъра`);
  check(h.includes('aria-expanded="false"'), `${path}: хамбургерът обявява състояние (aria-expanded)`);
  check(h.includes('aria-controls'), `${path}: хамбургерът сочи панела, който отваря`);
  // Без `aria-current` екранният четец обявява седем еднакви връзки без нито
  // един признак къде се намираш, а цветът сам по себе си не е информация.
  check(h.includes('aria-current="page"'), `${path}: текущата страница е обявена`);
}

// ── 7. Ключовите думи по правилото на репото ────────────────────────────────
// „Всяка страница ≥5 ключови думи, една винаги «Carbon Stealth»“ дотук се
// пазеше само от `BASE_KEYWORDS` (има тест) — тоест доказано беше, че БАЗАТА е
// наред, не че всяка страница я получава. Разликата не е теоретична: страница,
// която не мине през `pageMetadata`, няма НИТО ЕДНА дума и никой не пада.
//
// Базовият набор НЕ се преписва тук. Преписан списък се разминава с
// `src/lib/seo.ts` при първата промяна и после проверката пази вчерашното
// правило. Вместо това се ЧЕТЕ от страница без свои думи (`/privacy`), а
// `/terms` служи за контрола: разминат ли се двете, калибрирането е счупено
// (някой е добавил свои думи на правна страница) и това се казва на глас,
// вместо да мине за „чисто“.
const KEYWORD_PATHS = [
  '',
  '/servers',
  '/servers/whitelist',
  '/servers/framework/esx',
  '/rules',
  '/tutorials',
  '/streamers',
  '/news',
  '/submit',
  '/faq',
  '/team',
  '/contact',
  '/support',
  '/impresum',
  '/privacy',
  '/terms',
  '/report',
];
const keywordsOf = (html) => {
  const found = html.match(/name="keywords" content="([^"]*)"/);
  return found ? found[1].split(',').map((s) => s.trim()).filter(Boolean) : null;
};
// Страниците, които ТРЯБВА да имат и СВОИ думи, не само базовите. Без този
// списък секцията беше тавтология и не можеше да падне (одитът на Кодаджията):
// Next 15 наследява `keywords` от лейаута, значи и страница, която изобщо не
// мине през `pageMetadata`, излиза с шестте базови и „Carbon Stealth“ — тоест
// „≥5 + Carbon Stealth + без дубли“ е структурно вярно за ВСЯКА страница.
// Единственото, което може да липсва, е собственият списък — него мерим.
// Правните/контактните страници нарочно нямат свои думи и не са тук.
const OWN_KEYWORD_PATHS = new Set([
  '',
  '/servers',
  '/servers/whitelist',
  '/servers/framework/esx',
  '/rules',
  '/tutorials',
  '/streamers',
  '/news',
  '/submit',
]);

for (const locale of ['bg', 'en']) {
  const base = keywordsOf(await get(`/${locale}/privacy`));
  const control = keywordsOf(await get(`/${locale}/terms`));
  if (!base || !control || base.join('|') !== control.join('|')) {
    check(false, `/${locale}: калибрирането на базовите ключови думи е счупено — НЕИЗМЕРЕНО`);
    continue;
  }
  check(base.length >= 5, `/${locale}: базовият набор е ${base.length} думи (иска се ≥5)`);
  check(base.includes('Carbon Stealth'), `/${locale}: базовият набор носи „Carbon Stealth“`);

  let pages = 0;
  for (const path of KEYWORD_PATHS) {
    const all = keywordsOf(await get(`/${locale}${path}`));
    if (all === null) {
      check(false, `/${locale}${path}: НЯМА ключови думи изобщо`);
      continue;
    }
    if (all.length < 5) check(false, `/${locale}${path}: ${all.length} ключови думи (иска се ≥5)`);
    if (!all.includes('Carbon Stealth')) check(false, `/${locale}${path}: без „Carbon Stealth“`);
    if (all.length !== new Set(all).size) check(false, `/${locale}${path}: повтарящи се ключови думи`);
    // Базова дума, изядена от собствения списък на страницата, значи че
    // страницата харчи едно от своите места за нещо, което вече има.
    const missing = base.filter((word) => !all.includes(word));
    if (missing.length) check(false, `/${locale}${path}: базови думи липсват — ${missing.join(' / ')}`);
    // Единствената проверка, която реално може да падне: страница, от която
    // се очакват собствени думи, а тя носи само наследените базови.
    if (OWN_KEYWORD_PATHS.has(path) && all.length <= base.length) {
      check(false, `/${locale}${path}: няма СВОИ ключови думи — наследява само базата`);
    }
    pages += 1;
  }
  check(true, `/${locale}: ${pages} страници носят пълния набор ключови думи`);
}

console.log(bad === 0 ? '\nРЕЗУЛТАТ: обходът е чист.' : `\nРЕЗУЛТАТ: ${bad} провала.`);
process.exit(bad === 0 ? 0 : 1);
