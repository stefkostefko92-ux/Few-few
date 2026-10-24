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
 * ПИПА САМО СВОЙ ЗАПИС. Дотук пробата натискаше „свален по възражение“ на
 * ПЪРВИЯ стриймър в панела — в продукцията това е реален човек: ставаше
 * REJECTED, панелът не позволява връщане, и записът се оправяше само ръчно в
 * базата. А снимката на базата вземаше всички сървъри и стриймъри, които
 * cron-ът пипа на 3–10 мин — тоест и „промени се“, и „не се промени“ можеха
 * да излъжат. Сега: временен ръчен канал `authzprobe…` в статус „чака
 * преглед“ (никога публичен, и подреден най-отгоре в панела), бутонът
 * „свален по възражение“ върху НЕГО, снимка само на него и изтриване накрая —
 * и при провал.
 *
 * Изходен код: 0 = доказано, 1 = пробито или недоказано, 2 = НЕИЗМЕРЕНО.
 */
import { randomBytes } from 'node:crypto';

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
const started = new Date();
const channel = `authzprobe${randomBytes(4).toString('hex')}`;

const { browser, error } = await launchChromium();
if (error) {
  // Провалът е НЕИЗМЕРЕНО, не „чисто“ — зелено без измерване е лъжа.
  console.error('НЕИЗМЕРЕНО:', error);
  await prisma.$disconnect();
  process.exit(2);
}

/** Временният запис — единственото, което пробата пипа. */
const fresh = {
  displayName: channel,
  profileUrl: `https://www.tiktok.com/@${channel}`,
  status: 'PENDING',
};
const probe = await prisma.streamer.create({
  data: { platform: 'TIKTOK', channel, channelKey: channel, manual: true, ...fresh },
});

async function cleanup() {
  await prisma.streamer.deleteMany({ where: { id: probe.id } }).catch(() => {});
}

/** Връща записа в изходно положение — иначе успешен повтор (REJECTED → REJECTED) не се вижда. */
async function reset() {
  await prisma.streamer.update({ where: { id: probe.id }, data: fresh });
}

async function snapshot() {
  const [streamer, audits] = await Promise.all([
    prisma.streamer.findUnique({ where: { id: probe.id }, select: { status: true, updatedAt: true } }),
    prisma.auditLog.count({ where: { at: { gte: started } } }),
  ]);
  return JSON.stringify({ streamer, audits });
}

let proven = false;
try {
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
  await page
    .locator('li', { hasText: channel })
    .getByRole('button', { name: 'свален по възражение' })
    .click();
  await page.waitForTimeout(3000);
  await pending;
  const afterClick = await snapshot();
  const harnessWorks = afterClick !== before && captured !== null;
  console.log(
    `2) Истински бутон в панела: ${afterClick !== before ? 'мутацията мина ✓' : 'нищо не се промени ✗'} · ` +
      `заснета заявка: ${captured ? `${Object.keys(captured.headers).length} хедъра, тяло ${captured.body?.length ?? 0} б.` : 'НЯМА ✗'}`,
  );

  // ── 3. СЪЩАТА заявка без бисквитка ──────────────────────────────────────────
  await reset();
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
      await reset();
      const forgedBaseline = await snapshot();
      const res = await fetch(captured.url, {
        method: 'POST',
        headers: { ...captured.headers, cookie: `${cookieName}=${'0'.repeat(64)}` },
        body: captured.body,
        redirect: 'manual',
      });
      await res.text();
      forgedOk = (await snapshot()) === forgedBaseline;
      console.log(
        `4) С подправена бисквитка (${cookieName}) → ${res.status} · базата ` +
          `${forgedOk ? 'НЕ се промени ✓' : 'СЕ ПРОМЕНИ ✗'}`,
      );
    }
  }

  proven = loggedIn && harnessWorks && afterAnon === baseline && forgedOk;
  console.log(
    proven
      ? '\nРЕЗУЛТАТ: авторизацията държи — доказано С положителна контрола.'
      : '\nРЕЗУЛТАТ: пробито ИЛИ недоказано — виж горните редове, не приемай за чисто.',
  );
} finally {
  // И при провал по средата (таймаут на входа, липсващ бутон): временният
  // запис не бива да остане в продукцията.
  await browser.close().catch(() => {});
  await cleanup();
  await prisma.$disconnect();
}
process.exit(proven ? 0 : 1);
