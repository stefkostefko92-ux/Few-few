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
const { sofiaToday } = await import('../../src/time.js');
const { addMonths } = await import('../../src/incoming/vat-credit.js');

/** Входящата фактура в дневника за покупките: правото на кредит и месецът — `accounting.manage`, одит. */
const PASSWORD = 'дълга-и-трудна-парола-2026';
const month = sofiaToday().slice(0, 7);
let http: HttpClient;
let owner: Session;
let issuer: Session;
let orgId = '';
let entryId = '';

before(async () => {
  await truncateAll(prisma);
  await prisma.$transaction((tx) => seedPlans(tx));
  const base = {
    password: PASSWORD,
    acceptTerms: 'on' as const,
    addressStreet: 'ул. „Раковски“ 2',
    addressCity: 'Перник',
    postalCode: '2300',
  };
  orgId = (
    await register({
      ...base,
      kind: 'company',
      name: 'Иван Петров',
      email: 'owner@example.test',
      legalName: 'Пекарна Зора ЕООД',
      eik: '131063188',
      vatNumber: 'BG131063188',
    })
  ).organizationId;
  await register({
    ...base,
    kind: 'company',
    name: 'Мария Колева',
    email: 'issuer@example.test',
    legalName: 'Малка Работилница ЕООД',
    eik: '121604974',
  });
  const user = await prisma.user.findUniqueOrThrow({ where: { email: 'issuer@example.test' } });
  await prisma.membership.create({
    data: { userId: user.id, organizationId: orgId, role: 'ISSUER' },
  });
  // Издадена преди два месеца — може и в по-късен месец, но не в бъдещ.
  const issued = `${addMonths(month, -2)}-15`;
  entryId = (
    await prisma.incomingInvoice.create({
      data: {
        organizationId: orgId,
        format: 'UBL',
        xml: '<Invoice/>',
        sha256: 'e'.repeat(64),
        supplierName: 'Мелница Злато ООД',
        supplierEik: '175074752',
        supplierVat: 'BG175074752',
        number: '0000000777',
        typeCode: '380',
        issueDate: new Date(`${issued}T00:00:00Z`),
        currency: 'EUR',
        payableCents: 12000n,
        vatCents: 2000n,
        issues: [],
        valid: true,
      },
    })
  ).id;
  http = await startHttp(createServer);
  owner = await http.login('owner@example.test', PASSWORD);
  issuer = await http.login('issuer@example.test', PASSWORD);
});

after(async () => {
  await http.close();
  await prisma.$disconnect();
});

test('по подразбиране — пълен кредит в месеца на издаване; формата се вижда само с право', async () => {
  const page = await (await http.get(owner, `/app/o/${orgId}/vhodyashti/${entryId}`)).text();
  assert.match(page, /Пълен данъчен кредит/);
  assert.match(page, new RegExp(addMonths(month, -2)));
  assert.match(page, /action="[^"]*\/dnevnik"/);
  const other = await (await http.get(issuer, `/app/o/${orgId}/vhodyashti/${entryId}`)).text();
  assert.doesNotMatch(other, /action="[^"]*\/dnevnik"/);
});

test('частичен кредит в текущия месец — записан и в одита; бъдещ месец и чужд член — отказ', async () => {
  const path = `/app/o/${orgId}/vhodyashti/${entryId}/dnevnik`;
  const ok = await http.post(owner, path, { credit: 'PARTIAL', period: month });
  assert.match(ok.headers.get('location') ?? '', /ok=journal/);
  const saved = await prisma.incomingInvoice.findUniqueOrThrow({ where: { id: entryId } });
  assert.equal(saved.vatCredit, 'PARTIAL');
  assert.equal(saved.journalPeriod, month);
  assert.equal(await prisma.auditLog.count({ where: { action: 'incoming.vatCredit' } }), 1);

  const future = await http.post(owner, path, { credit: 'FULL', period: addMonths(month, 1) });
  assert.match(future.headers.get('location') ?? '', /err=period/);
  const before = await http.post(owner, path, { credit: 'FULL', period: addMonths(month, -3) });
  assert.match(before.headers.get('location') ?? '', /err=period/);
  const bad = await http.post(owner, path, { credit: 'ALL', period: month });
  assert.match(bad.headers.get('location') ?? '', /err=invalid/);

  // Месецът на издаване се пише като null — следва датата.
  await http.post(owner, path, { credit: 'NONE', period: addMonths(month, -2) });
  const back = await prisma.incomingInvoice.findUniqueOrThrow({ where: { id: entryId } });
  assert.equal(back.vatCredit, 'NONE');
  assert.equal(back.journalPeriod, null);

  // Издателят няма `accounting.manage` — 404, както навсякъде.
  assert.equal((await http.post(issuer, path, { credit: 'FULL', period: month })).status, 404);
});
