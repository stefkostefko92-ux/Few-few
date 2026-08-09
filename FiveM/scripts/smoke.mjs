/**
 * Регресионен обход срещу ЖИВ инстанс. Пуска се на ръка преди пускане и след
 * всеки едър рефактор:
 *
 *   PROBE_BASE_URL=http://localhost:3010 node scripts/smoke.mjs
 *
 * НЕ е в `npm test` (той е чисти функции, без база и без мрежа) и НЕ е в CI.
 *
 * ЗАЩО съществува. `npm test` покрива чистите функции, а `next build` доказва,
 * че кодът се компилира — нито едното не хваща страница, която връща 500 при
 * реален рендер. Точно това е рискът след механичен рефактор: `resolveLocale`
 * смени 43 места в 25 файла, а `JsonLd` — 16 блока в 10 файла. Компилиращ се
 * код, който гърми при рендер, минава и двата гейта.
 *
 * Изходен код: 0 = чисто, 1 = има провал.
 */
const BASE = process.env.PROBE_BASE_URL ?? 'http://localhost:3010';

let bad = 0;
const check = (ok, msg) => {
  console.log(`${ok ? '✓' : '✗'} ${msg}`);
  if (!ok) bad += 1;
};
const get = async (path) => (await fetch(BASE + path)).text();

// ── 1. Всяка страница рендира ли се, на двата езика ─────────────────────────
const PATHS = [
  '',
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
for (const path of ['/bg', '/bg/rules', '/bg/tutorials', '/bg/faq', '/bg/streamers', '/en']) {
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
const terms = await get('/bg/terms');
check(
  terms.includes('id="kak-podrezhdame-sarvarite"'),
  'разделът за класирането има котва (чл. 7(4а) Дир. 2005/29)',
);
const home = await get('/bg');
check(home.includes('#kak-podrezhdame-sarvarite'), 'резултатите сочат ПРЯКО към класирането');
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

console.log(bad === 0 ? '\nРЕЗУЛТАТ: обходът е чист.' : `\nРЕЗУЛТАТ: ${bad} провала.`);
process.exit(bad === 0 ? 0 : 1);
