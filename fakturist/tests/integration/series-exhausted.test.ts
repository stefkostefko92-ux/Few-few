import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { prepareTestDatabase, truncateAll } from './harness.js';
import { startHttp, type HttpClient, type Session } from './http.js';

prepareTestDatabase();
delete process.env['SMTP_HOST'];
const { prisma } = await import('../../src/db.js');
const { register } = await import('../../src/accounts/register.js');
const { issueDocument, SeriesExhausted } = await import('../../src/documents/issue.js');
const { updateSeries } = await import('../../src/catalog/series.js');
const { seedPlans } = await import('../../src/billing/seed-plans.js');
const { createServer } = await import('../../src/server.js');
const { sofiaToday } = await import('../../src/time.js');
const { addDays } = await import('../../src/recurring/schedule.js');
const { domestic } = await import('../fixtures/einvoice-samples.js');

/**
 * Изчерпана серия: издаването взема номера с `UPDATE … WHERE "nextNumber" <= "rangeEnd"`. Серия с
 * `rangeEnd` = началото + 1 дава точно два номера; третият опит е `SeriesExhausted` и не губи нищо —
 * без документ, без звено във веригата, без одит, без изгорял номер. Тестовете вървят по ред.
 */
const PASSWORD = 'дълга-и-трудна-парола-2026';
let http: HttpClient;
let owner: Session;
let organizationId = '';
let userId = '';
let seriesId = '';
const today = sofiaToday();

const access = () => ({ organizationId, role: 'OWNER' as const, viaFirmId: null, mandateId: null });

function request() {
  const { number: _n, seller: _s, ...rest } = domestic;
  return { ...rest, seriesId };
}

const series = () => prisma.documentSeries.findUniqueOrThrow({ where: { id: seriesId } });

async function snapshot() {
  return {
    documents: await prisma.document.count({ where: { organizationId } }),
    issuedAudit: await prisma.auditLog.count({ where: { action: 'document.issued' } }),
    nraReports: await prisma.nraReport.count(),
    nextNumber: (await series()).nextNumber,
  };
}

before(async () => {
  await truncateAll(prisma);
  await prisma.$transaction((tx) => seedPlans(tx));
  const created = await register({
    kind: 'company',
    name: 'Иван Петров',
    email: 'owner@example.test',
    password: PASSWORD,
    acceptTerms: 'on',
    legalName: 'Карбон Стелт ЕДПК',
    eik: '208725180',
    vatNumber: 'BG208725180',
    addressStreet: 'ул. „Самуил“ № 3',
    addressCity: 'Бобов дол',
    postalCode: '2670',
    iban: 'BG80BNBG96611020345678',
  });
  organizationId = created.organizationId;
  userId = created.userId;
  seriesId = (await prisma.documentSeries.findFirstOrThrow({ where: { organizationId } })).id;
  // Основната серия е без издадени документи — владелецът я стеснява до два номера (1 и 2).
  await updateSeries({
    organizationId,
    seriesId,
    actorId: userId,
    data: { name: 'Основна', rangeStart: 1n, rangeEnd: 2n },
  });
  await prisma.subscription.updateMany({
    where: { organizationId, status: 'ACTIVE' },
    data: { planCode: 'business' },
  });
  http = await startHttp(createServer);
  owner = await http.login('owner@example.test', PASSWORD);
});

after(async () => {
  await http.close();
  await prisma.$disconnect();
});

test('серия с краен номер = начало + 1: първите две издавания минават с номера 1 и 2', async () => {
  const before = await series();
  assert.deepEqual([before.rangeStart, before.rangeEnd, before.nextNumber], [1n, 2n, 1n]);
  const first = await issueDocument(access(), userId, request());
  const second = await issueDocument(access(), userId, request());
  assert.deepEqual([first.number, second.number], ['0000000001', '0000000002']);
  assert.equal((await series()).nextNumber, 3n);
});

test('третото издаване дава SeriesExhausted и не оставя следа', async () => {
  const state = await snapshot();
  assert.deepEqual(state, { documents: 2, issuedAudit: 2, nraReports: 2, nextNumber: 3n });
  await assert.rejects(issueDocument(access(), userId, request()), SeriesExhausted);
  assert.deepEqual(await snapshot(), state);
});

test('повторени опити остават отказани и не изгарят номера: nextNumber стои на край + 1', async () => {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    await assert.rejects(issueDocument(access(), userId, request()), SeriesExhausted);
  }
  assert.equal((await series()).nextNumber, 3n);
});

test('издадените два документа са цели: номера 1 и 2, непрекъсната верига', async () => {
  const docs = await prisma.document.findMany({
    where: { organizationId },
    orderBy: { chainIndex: 'asc' },
    select: { number: true, status: true, chainIndex: true, prevHash: true, sha256: true },
  });
  assert.deepEqual(
    docs.map((doc) => [doc.number, doc.status, doc.chainIndex]),
    [
      ['0000000001', 'ISSUED', 1n],
      ['0000000002', 'ISSUED', 2n],
    ],
  );
  assert.equal(docs[1]!.prevHash, docs[0]!.sha256);
});

test('API: изчерпана серия е 409 seriesExhausted, а не 500 и не номер извън серията', async () => {
  const form = new URLSearchParams({ _csrf: owner.csrf, name: 'Магазин' });
  form.append('scopes', 'read');
  form.append('scopes', 'issue');
  const created = await fetch(`${http.origin}/app/o/${organizationId}/api`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded', cookie: owner.cookie },
    body: form,
  });
  assert.equal(created.status, 200);
  const key = /(fkt_[A-Za-z0-9_-]{43})/.exec(await created.text())?.[1];
  assert.ok(key, 'ключът е показан веднъж');

  const state = await snapshot();
  const res = await fetch(`${http.origin}/api/v1/documents`, {
    method: 'POST',
    headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      seriesId,
      typeCode: '380',
      issueDate: today,
      dueDate: addDays(today, 14),
      currency: 'EUR',
      buyer: {
        name: 'Сладкарница Роза ЕООД',
        legalId: '121604974',
        address: { street: 'ул. „Шипка“ 1', city: 'София', postalCode: '1000', countryCode: 'BG' },
      },
      lines: [
        {
          id: '1',
          name: 'Услуга',
          quantity: '1',
          unitCode: 'C62',
          netPrice: '10.00',
          vat: { category: 'S', rate: '20' },
          allowanceCharges: [],
          attributes: [],
        },
      ],
      notes: [],
      precedingInvoices: [],
      allowanceCharges: [],
      vatExemptions: [],
    }),
  });
  assert.equal(res.status, 409);
  assert.deepEqual(await res.json(), { error: 'seriesExhausted' });
  assert.deepEqual(await snapshot(), state);
});

test('край под издаденото не се допуска; удължаването продължава без дупка (следва номер 3)', async () => {
  await assert.rejects(
    updateSeries({
      organizationId,
      seriesId,
      actorId: userId,
      data: { name: 'Основна', rangeStart: 1n, rangeEnd: 1n },
    }),
    { code: 'issuedBelow' },
  );
  await updateSeries({
    organizationId,
    seriesId,
    actorId: userId,
    data: { name: 'Основна', rangeStart: 1n, rangeEnd: 3n },
  });
  const third = await issueDocument(access(), userId, request());
  assert.equal(third.number, '0000000003');
  assert.equal((await series()).nextNumber, 4n);
});

test('един свободен номер и три едновременни издавания: един успех, два SeriesExhausted, без дубликат', async () => {
  await updateSeries({
    organizationId,
    seriesId,
    actorId: userId,
    data: { name: 'Основна', rangeStart: 1n, rangeEnd: 4n },
  });
  const results = await Promise.allSettled([
    issueDocument(access(), userId, request()),
    issueDocument(access(), userId, request()),
    issueDocument(access(), userId, request()),
  ]);
  const fulfilled = results.filter((r) => r.status === 'fulfilled');
  const rejected = results.filter((r) => r.status === 'rejected');
  assert.equal(fulfilled.length, 1);
  assert.equal(rejected.length, 2);
  for (const r of rejected) assert.ok(r.reason instanceof SeriesExhausted);
  assert.equal(fulfilled[0]!.value.number, '0000000004');
  assert.equal((await series()).nextNumber, 5n);
  const numbers = (await prisma.document.findMany({ where: { organizationId } })).map(
    (doc) => doc.number,
  );
  assert.deepEqual(numbers.sort(), ['0000000001', '0000000002', '0000000003', '0000000004']);
});
