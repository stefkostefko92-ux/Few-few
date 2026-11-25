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

/**
 * Списъците вече не режат тихо над 100 реда (одитът, 14.11.2026): страници по ключ, без дубли и без
 * пропуски — и при еднакво време/име (решава id-то); филтрите се пазят в „По-стари“.
 */
const PASSWORD = 'дълга-и-трудна-парола-2026';
let http: HttpClient;
let owner: Session;
let orgId = '';

before(async () => {
  await truncateAll(prisma);
  await prisma.$transaction((tx) => seedPlans(tx));
  const seller = await register({
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
  });
  orgId = seller.organizationId;
  // 120 документа: по три с едно и също време — редът между тях е по id.
  const base = new Date('2026-11-01T08:00:00.000Z').getTime();
  await prisma.document.createMany({
    data: Array.from({ length: 120 }, (_, i) => ({
      organizationId: orgId,
      status: 'ISSUED' as const,
      typeCode: '380',
      number: String(i + 1).padStart(10, '0'),
      issueDate: new Date('2026-11-01T00:00:00Z'),
      dueDate: new Date(i < 10 ? '2026-11-02T00:00:00Z' : '2099-01-01T00:00:00Z'),
      input: {},
      buyerName: i % 2 === 0 ? 'Сладкарница Роза ЕООД' : 'Хотел Струма ООД',
      payableCents: 1000n,
      createdAt: new Date(base + Math.floor(i / 3) * 1000),
    })),
  });
  await prisma.party.createMany({
    data: Array.from({ length: 120 }, (_, i) => ({
      organizationId: orgId,
      name: i < 60 ? 'Еднакво Име ООД' : `Контрагент ${String(i).padStart(3, '0')}`,
      addressStreet: 'ул. „Шипка“ 1',
      addressCity: 'София',
      postalCode: '1000',
      countryCode: 'BG',
    })),
  });
  http = await startHttp(createServer);
  owner = await http.login('owner@example.test', PASSWORD);
});

after(async () => {
  await http.close();
  await prisma.$disconnect();
});

/** Обхожда „По-стари“/„Следващи“ до края; връща id-тата по реда на страниците. */
async function walk(start: string, linkPattern: RegExp): Promise<{ ids: string[]; pages: number }> {
  const ids: string[] = [];
  let path: string | null = start;
  let pages = 0;
  while (path) {
    const res = await http.get(owner, path);
    assert.equal(res.status, 200, path);
    const html = await res.text();
    ids.push(...[...html.matchAll(linkPattern)].map((m) => m[1]!));
    const next = /<a href="([^"]+)" rel="next">/.exec(html)?.[1];
    path = next ? next.replace(/&amp;/g, '&') : null;
    pages += 1;
    assert.ok(pages < 10, 'безкраен цикъл');
  }
  return { ids, pages };
}

const docLink = () => new RegExp(`href="/app/o/${orgId}/d/([a-z0-9]+)"`, 'g');

test('документите: 120 → три страници (50+50+20), без дубли и пропуски, най-новите първи', async () => {
  const { ids, pages } = await walk(`/app/o/${orgId}`, docLink());
  assert.equal(pages, 3);
  assert.equal(ids.length, 120);
  assert.equal(new Set(ids).size, 120);
  const expected = await prisma.document.findMany({
    where: { organizationId: orgId },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    select: { id: true },
  });
  assert.deepEqual(
    ids,
    expected.map((d) => d.id),
  );
  const first = await (await http.get(owner, `/app/o/${orgId}`)).text();
  assert.match(first, /Общо документи: 120/);
});

test('филтърът се пази в страниците; просрочените — по падежа', async () => {
  const roza = await walk(`/app/o/${orgId}?q=${encodeURIComponent('роза')}`, docLink());
  assert.equal(roza.ids.length, 60, 'търсенето не зависи от главни/малки');
  assert.equal(roza.pages, 2);
  const overdue = await walk(`/app/o/${orgId}?plashtane=prosrocheni`, docLink());
  assert.equal(overdue.ids.length, 10);
  const html = await (await http.get(owner, `/app/o/${orgId}?plashtane=prosrocheni`)).text();
  assert.match(html, /Намерени: 10/);
  assert.match(html, /просрочена/);
  const byNumber = await walk(`/app/o/${orgId}?q=0000000077`, docLink());
  assert.equal(byNumber.ids.length, 1);
  // Боклук в адреса — първата страница, не грешка.
  assert.equal((await http.get(owner, `/app/o/${orgId}?predi=%25%25&vid=999`)).status, 200);
});

test('контрагентите: 60 с еднакво име се делят по id — нито един не се губи', async () => {
  const partyLink = new RegExp(`href="/app/o/${orgId}/kontragenti/([a-z0-9]{20,40})"`, 'g');
  const { ids, pages } = await walk(`/app/o/${orgId}/kontragenti`, partyLink);
  assert.equal(pages, 3);
  assert.equal(new Set(ids).size, 120);
  const html = await (await http.get(owner, `/app/o/${orgId}/kontragenti`)).text();
  assert.match(html, /Следващи →/);
});
