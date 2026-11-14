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
const { templateOf } = await import('../../src/recurring/recurring.js');

/**
 * Приспадане на аванс в окончателната фактура (В9; казусът — Данъчника, 14.11.2026): ред с количество −1
 * за основата на аванса, същата ставка, BG-3 към авансовата; веднъж за аванс; само за същия получател.
 */
const PASSWORD = 'дълга-и-трудна-парола-2026';
const today = sofiaToday();
let http: HttpClient;
let owner: Session;
let orgId = '';
let seriesId = '';

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
      legalName: 'Мебели Зора ЕООД',
      eik: '131063188',
      vatNumber: 'BG131063188',
      addressStreet: 'ул. „Раковски“ 2',
      addressCity: 'Перник',
      postalCode: '2300',
    })
  ).organizationId;
  seriesId = (await prisma.documentSeries.findFirstOrThrow({ where: { organizationId: orgId } }))
    .id;
  http = await startHttp(createServer);
  owner = await http.login('owner@example.test', PASSWORD);
});

after(async () => {
  await http.close();
  await prisma.$disconnect();
});

const issue = (extra: Record<string, string>) =>
  http.post(owner, `/app/o/${orgId}/nov`, {
    typeCode: '380',
    seriesId,
    issueDate: today,
    taxPointDate: today,
    dueDate: today,
    currency: 'EUR',
    'buyer[name]': 'Хотел Струма ООД',
    'buyer[legalId]': '121604974',
    'buyer[street]': 'ул. „Шипка“ 1',
    'buyer[city]': 'София',
    'buyer[postalCode]': '1000',
    'buyer[countryCode]': 'BG',
    'lines[0][name]': 'Изработка на кухненски шкафове',
    'lines[0][quantity]': '1',
    'lines[0][unitCode]': 'C62',
    'lines[0][netPrice]': '300.00',
    'lines[0][category]': 'S',
    'lines[0][rate]': '20',
    ...extra,
  });
const latest = () =>
  prisma.document.findFirstOrThrow({
    where: { organizationId: orgId },
    orderBy: { createdAt: 'desc' },
  });

let advance = { id: '', number: '' };

test('окончателната: основата и ДДС-ът — само за остатъка; редът и препратката са в XML-а', async () => {
  const created = await issue({
    typeCode: '386',
    'lines[0][name]': 'Аванс по договор № 7',
    'lines[0][netPrice]': '100.00',
  });
  assert.equal(created.status, 303);
  const adv = await latest();
  advance = { id: adv.id, number: adv.number! };
  assert.equal(adv.typeCode, '386');

  const final = await issue({ 'advance[number]': String(Number(advance.number)) });
  assert.equal(final.status, 303, 'краткият номер се допълва до 10 цифри');
  const doc = await latest();
  assert.equal(doc.typeCode, '380');
  assert.equal(doc.taxExclusiveCents, 200_00n);
  assert.equal(doc.vatCents, 40_00n);
  assert.equal(doc.payableCents, 240_00n);
  assert.equal(doc.precedingId, advance.id, 'авансът не може да се анулира, докато е приспаднат');
  const xml = doc.ublXml ?? '';
  assert.match(xml, /<cbc:InvoicedQuantity unitCode="C62">-1<\/cbc:InvoicedQuantity>/);
  assert.match(xml, new RegExp(`Приспадане на аванс по фактура № ${advance.number}`));
  assert.match(
    xml,
    new RegExp(
      `<cac:BillingReference>\\s*<cac:InvoiceDocumentReference>\\s*<cbc:ID>${advance.number}</cbc:ID>`,
    ),
  );
  // Шаблонът на повтаряща се фактура не носи приспадането — то е еднократно.
  const template = templateOf(doc.input) as { lines: Array<{ name: string }> };
  assert.deepEqual(
    template.lines.map((l) => l.name),
    ['Изработка на кухненски шкафове'],
  );
});

test('втори път същия аванс — отказ; чужд получател — отказ; анулиране на аванса — отказ', async () => {
  const before = await prisma.document.count({ where: { organizationId: orgId } });
  const twice = await issue({ 'advance[number]': advance.number });
  assert.equal(twice.status, 400);
  assert.match(await twice.text(), /вече е приспаднат/);

  const otherBuyer = await issue({
    'advance[number]': advance.number,
    'buyer[name]': 'Друга Фирма ООД',
    'buyer[legalId]': '200000002',
  });
  assert.equal(otherBuyer.status, 400);

  const notAdvance = await issue({ 'advance[number]': (await latest()).number! });
  assert.equal(notAdvance.status, 400);
  assert.match(await notAdvance.text(), /Няма издадена авансова фактура/);
  assert.equal(
    await prisma.document.count({ where: { organizationId: orgId } }),
    before,
    'номерът не изгаря',
  );

  const annul = await issue({
    typeCode: '386',
    replaces: advance.id,
    annulReason: 'requisite',
    'lines[0][netPrice]': '100.00',
  });
  assert.equal(annul.status, 400, 'приспаднатият аванс не се анулира');
});

test('„Анулирай и издай нов“ на окончателната — приспадането минава в новата', async () => {
  const final = await prisma.document.findFirstOrThrow({
    where: { organizationId: orgId, precedingId: advance.id, status: 'ISSUED' },
  });
  const replaced = await issue({
    replaces: final.id,
    annulReason: 'requisite',
    'advance[number]': advance.number,
    'buyer[street]': 'ул. „Шипка“ 11',
  });
  assert.equal(replaced.status, 303);
  const fresh = await latest();
  assert.equal(fresh.precedingId, advance.id);
  assert.equal(fresh.taxExclusiveCents, 200_00n);
  assert.equal(
    (await prisma.document.findUniqueOrThrow({ where: { id: final.id } })).status,
    'CANCELLED',
  );
});
