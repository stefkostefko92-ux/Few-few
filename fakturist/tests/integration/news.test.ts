import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { prepareTestDatabase, truncateAll } from './harness.js';
import { startHttp, type HttpClient, type Session } from './http.js';

prepareTestDatabase();
delete process.env['SMTP_HOST'];
const { prisma } = await import('../../src/db.js');
const { register } = await import('../../src/accounts/register.js');
const { seedPlans } = await import('../../src/billing/seed-plans.js');
const { createServer } = await import('../../src/server.js');
const { forgetPublishedNews } = await import('../../src/news/registry.js');
const { NEWS } = await import('../../src/news/entries.js');

/**
 * „Какво ново“ (собственикът, 14.11.2026): прозорецът при първото влизане след обновяване, „Разбрах“,
 * публичната страница и емисията.
 */
const PASSWORD = 'дълга-и-трудна-парола-2026';
let http: HttpClient;
let owner: Session;
let orgId = '';

before(async () => {
  await truncateAll(prisma);
  await prisma.$transaction((tx) => seedPlans(tx));
  orgId = (
    await register({
      kind: 'company',
      name: 'Иван Петров',
      email: 'owner@example.test',
      password: PASSWORD,
      acceptTerms: 'on',
      legalName: 'Пекарна Зора ЕООД',
      eik: '131063188',
      addressStreet: 'ул. „Раковски“ 2',
      addressCity: 'Перник',
      postalCode: '2300',
    })
  ).organizationId;
  forgetPublishedNews();
  http = await startHttp(createServer);
  owner = await http.login('owner@example.test', PASSWORD);
});

after(async () => {
  await http.close();
  await prisma.$disconnect();
});

const page = (path = `/app/o/${orgId}`) =>
  http.get(owner, path).then(async (res) => ({ status: res.status, html: await res.text() }));
// http.get не праща Accept: прозорецът е само за браузър (text/html) — тук с него.
const browserPage = async (path = `/app/o/${orgId}`) => {
  const res = await fetch(`${http.origin}${path}`, {
    redirect: 'manual',
    headers: { cookie: owner.cookie, accept: 'text/html' },
  });
  return { status: res.status, html: await res.text() };
};

test('нова инсталация: новият профил не вижда старите новини', async () => {
  const { html } = await browserPage();
  assert.doesNotMatch(html, /data-news\b/);
  assert.equal(await prisma.newsEntry.count(), NEWS.length, 'записани в деня си');
});

test('обновяване: новина, излязла след регистрацията — прозорец; „Разбрах“ — изчезва', async () => {
  // Обновяването: най-новата новина още няма ред — сървърът я записва „сега“.
  await prisma.newsEntry.delete({ where: { id: NEWS[0]!.id } });
  forgetPublishedNews();
  const shown = await browserPage();
  assert.equal(shown.status, 200);
  assert.match(shown.html, /<dialog class="news" data-news open/);
  assert.match(shown.html, /Какво ново от последното ви влизане/);
  assert.match(shown.html, /Версия 1\.0/);
  // Само за браузър: PDF, XML и fetch не получават прозореца.
  assert.doesNotMatch((await page()).html, /data-news\b/);

  const read = await fetch(`${http.origin}/app/kakvo-novo/procheteni`, {
    method: 'POST',
    redirect: 'manual',
    headers: {
      cookie: owner.cookie,
      'content-type': 'application/x-www-form-urlencoded',
      'x-partial': '1',
    },
    body: new URLSearchParams({ _csrf: owner.csrf, back: `/app/o/${orgId}` }),
  });
  assert.equal(read.status, 204);
  assert.doesNotMatch((await browserPage()).html, /data-news\b/);

  // Без JavaScript — обратно на страницата; чужд адрес — към /app.
  const back = await http.post(owner, '/app/kakvo-novo/procheteni', { back: `/app/o/${orgId}` });
  assert.equal(back.headers.get('location'), `/app/o/${orgId}`);
  const evil = await http.post(owner, '/app/kakvo-novo/procheteni', { back: 'https://evil.test/' });
  assert.equal(evil.headers.get('location'), '/app');
  // Без CSRF — отказ.
  const forged = await fetch(`${http.origin}/app/kakvo-novo/procheteni`, {
    method: 'POST',
    redirect: 'manual',
    headers: { cookie: owner.cookie, 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ back: '/app' }),
  });
  assert.equal(forged.status, 403);
});

test('страницата „Какво ново“ и емисията — публични, на двата езика', async () => {
  const bg = await fetch(`${http.origin}/kakvo-novo`);
  assert.equal(bg.status, 200);
  const html = await bg.text();
  assert.equal((html.match(/<h1\b/g) ?? []).length, 1);
  for (const entry of NEWS) assert.match(html, new RegExp(`id="${entry.id}"`));
  assert.match(html, /application\/rss\+xml/);
  assert.match(html, /Carbon Stealth/);
  const en = await fetch(`${http.origin}/en/whats-new`);
  assert.equal(en.status, 200);
  assert.match(await en.text(), /What’s new in Fakturist/);
  const rss = await fetch(`${http.origin}/kakvo-novo.xml`);
  assert.match(rss.headers.get('content-type') ?? '', /rss\+xml/);
  const xml = await rss.text();
  assert.equal((xml.match(/<item>/g) ?? []).length, NEWS.length);
  const sitemap = await (await fetch(`${http.origin}/sitemap.xml`)).text();
  assert.match(sitemap, /\/kakvo-novo<\/loc>/);
});
