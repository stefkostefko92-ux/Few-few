/**
 * Проверка на авторизацията ОТ КРАЙ ДО КРАЙ, срещу жив инстанс.
 *
 *   PROBE_ADMIN_PASSWORD="…" node scripts/authz-probe.mjs
 *
 * Иска пуснат сайт на `PROBE_BASE_URL`, база и `ADMIN_PASSWORD_HASH`, затова НЕ
 * е в `npm test` (той е чисти функции, без база) и НЕ е в CI гейта. Пуска се на
 * ръка преди пускане — виж `SECURITY.md`.
 *
 * ЗАЩО е написан така. Ръчно сглобена заявка към Next server action не става:
 * Next я отхвърля ПРЕДИ действието (404 / „Connection closed“). Тогава „нула
 * странични ефекти“ доказва счупен харнес, не работеща защита — точно видът
 * зелено, което лъже. Затова заявката се ЗАПИСВА от истински браузър, който
 * наистина е влязъл и наистина е натиснал бутона (положителна контрола: базата
 * ТРЯБВА да се промени), и чак после СЪЩАТА заявка се повтаря без бисквитката.
 *
 * Изходен код: 0 = доказано, 1 = пробито или недоказано, 2 = НЕИЗМЕРЕНО.
 */
import { PrismaClient } from '@prisma/client';

import { launchChromium } from '../../tools/lib/browser.mjs';

// `127.0.0.1`, не `localhost`: compose публикува само IPv4, а Node пробва
// `::1` пръв — виж бележката в `smoke.mjs`.
const BASE = process.env.PROBE_BASE_URL ?? 'http://127.0.0.1:3010';
const PASSWORD = process.env.PROBE_ADMIN_PASSWORD;

if (!PASSWORD) {
  console.error('НЕИЗМЕРЕНО: липсва PROBE_ADMIN_PASSWORD (паролата към ADMIN_PASSWORD_HASH).');
  process.exit(2);
}

const prisma = new PrismaClient();

async function snapshot() {
  const [streamers, servers, audits] = await Promise.all([
    prisma.streamer.findMany({ orderBy: { id: 'asc' } }),
    prisma.server.findMany({ orderBy: { id: 'asc' } }),
    prisma.auditLog.count(),
  ]);
  return JSON.stringify({ streamers, servers, audits });
}

const { browser, error } = await launchChromium();
if (error) {
  // Провалът е НЕИЗМЕРЕНО, не „чисто“ — зелено без измерване е лъжа.
  console.error('НЕИЗМЕРЕНО:', error);
  process.exit(2);
}

const page = await browser.newPage();
let captured = null;
let pending = Promise.resolve();
/**
 * `allHeaders()`, НЕ `headers()`. Синхронният `headers()` на Playwright не
 * връща `cookie` — тоест заснетата заявка нямаше сесийна бисквитка изобщо.
 * Последицата беше двойна и коварна: стъпка 4 нямаше какво да подправи, а
 * стъпка 3 „доказваше“ отказ на заявка, която и без това е без бисквитка.
 * Инструментът за проверка сам беше сляп.
 */
page.on('request', (req) => {
  if (req.method() === 'POST' && req.url().includes('/admin/streamers')) {
    pending = req
      .allHeaders()
      .then((headers) => {
        captured = { url: req.url(), headers, body: req.postData() };
      })
      .catch(() => {});
  }
});

// ── 1. Вход през истинската форма ───────────────────────────────────────────
await page.goto(`${BASE}/bg/admin/login`, { waitUntil: 'domcontentloaded' });
await page.fill('input[name="password"]', PASSWORD);
await Promise.all([
  page.waitForURL('**/bg/admin', { timeout: 15_000 }),
  page.getByRole('button', { name: 'Влез' }).click(),
]);
const loggedIn = page.url().endsWith('/bg/admin');
console.log(`1) Вход през формата: ${loggedIn ? 'успешен ✓' : `неуспешен ✗ (${page.url()})`}`);

// ── 2. Положителна контрола: истински бутон, истинска мутация ───────────────
await page.goto(`${BASE}/bg/admin/streamers`, { waitUntil: 'domcontentloaded' });
const before = await snapshot();
await page.getByRole('button', { name: 'свален по възражение' }).first().click();
await page.waitForTimeout(3000);
await pending;
const afterClick = await snapshot();
const harnessWorks = afterClick !== before && captured !== null;
console.log(
  `2) Истински бутон в панела: ${afterClick !== before ? 'мутацията мина ✓' : 'нищо не се промени ✗'} · ` +
    `заснета заявка: ${captured ? `${Object.keys(captured.headers).length} хедъра, тяло ${captured.body?.length ?? 0} б.` : 'НЯМА ✗'}`,
);

// ── 3. СЪЩАТА заявка без бисквитка ──────────────────────────────────────────
const baseline = await snapshot();
const codes = [];
if (captured) {
  const headers = { ...captured.headers };
  delete headers.cookie;
  for (let i = 0; i < 3; i += 1) {
    const res = await fetch(captured.url, {
      method: 'POST',
      headers,
      body: captured.body,
      redirect: 'manual',
    });
    codes.push(res.status);
    await res.text();
  }
}
const afterAnon = await snapshot();
console.log(
  `3) СЪЩАТА заявка БЕЗ бисквитка (×3) → ${codes.join(',') || '—'} · базата ` +
    `${afterAnon === baseline ? 'НЕ се промени ✓' : 'СЕ ПРОМЕНИ ✗'}`,
);

// ── 4. И с подправена бисквитка ─────────────────────────────────────────────
let forgedOk = false;
if (captured) {
  // Името на бисквитката се ВЗИМА от заснетата заявка, не се пише на ръка.
  // Беше зашито `fivem-admin`, а по HTTPS продукцията ползва
  // `__Host-fivem-admin` — тоест стъпката пращаше бисквитка, която сървърът
  // изобщо не търси, отказът беше „няма сесия“, а тестът я броеше за
  // „подправената сесия не мина“. Куха проверка, влизаща в крайния резултат.
  const name = /(^|;\s*)(__Host-)?fivem-admin=/.exec(captured.headers.cookie ?? '');
  if (!name) {
    console.log('4) ПРОПУСНАТА: в заснетата заявка няма сесийна бисквитка — няма какво да се подправи.');
    forgedOk = false;
  } else {
    const cookieName = `${name[2] ?? ''}fivem-admin`;
    const res = await fetch(captured.url, {
      method: 'POST',
      headers: { ...captured.headers, cookie: `${cookieName}=${'0'.repeat(64)}` },
      body: captured.body,
      redirect: 'manual',
    });
    await res.text();
    forgedOk = (await snapshot()) === baseline;
    console.log(
      `4) С подправена бисквитка (${cookieName}) → ${res.status} · базата ` +
        `${forgedOk ? 'НЕ се промени ✓' : 'СЕ ПРОМЕНИ ✗'}`,
    );
  }
}

const proven = loggedIn && harnessWorks && afterAnon === baseline && forgedOk;
console.log(
  proven
    ? '\nРЕЗУЛТАТ: авторизацията държи — доказано С положителна контрола.'
    : '\nРЕЗУЛТАТ: пробито ИЛИ недоказано — виж горните редове, не приемай за чисто.',
);

await browser.close();
await prisma.$disconnect();
process.exit(proven ? 0 : 1);
