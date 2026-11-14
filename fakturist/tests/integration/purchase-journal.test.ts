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
const { buildEInvoice } = await import('../../src/einvoice/index.js');
const { PURCHASE_RECORD_LENGTH } = await import('../../src/export/purchase-journal.js');
const { domestic } = await import('../fixtures/einvoice-samples.js');

/**
 * SPEC 69: POKUPKI.TXT за месец — от „Входящи“ (качен UBL) и „Шкафче“ (документ от друга фирма във
 * Фактурист), по правото на кредит на всеки, без отказаните.
 */
const PASSWORD = 'дълга-и-трудна-парола-2026';
const today = sofiaToday();
const period = today.slice(0, 7);
let http: HttpClient;
let buyer: Session;
let seller: Session;
let buyerId = '';
let sellerId = '';

const base = {
  password: PASSWORD,
  acceptTerms: 'on' as const,
  addressStreet: 'ул. „Раковски“ 2',
  addressCity: 'Перник',
  postalCode: '2300',
};

before(async () => {
  await truncateAll(prisma);
  await prisma.$transaction((tx) => seedPlans(tx));
  buyerId = (
    await register({
      ...base,
      kind: 'company',
      name: 'Иван Петров',
      email: 'buyer@example.test',
      legalName: 'Пекарна Зора ЕООД',
      eik: '131063188',
      vatNumber: 'BG131063188',
    })
  ).organizationId;
  sellerId = (
    await register({
      ...base,
      kind: 'company',
      name: 'Мария Колева',
      email: 'seller@example.test',
      legalName: 'Мелница Злато ООД',
      eik: '121604974',
      vatNumber: 'BG121604974',
    })
  ).organizationId;
  // Шкафчето доставя само до потвърдена фирма.
  await prisma.organization.update({ where: { id: buyerId }, data: { verifiedAt: new Date() } });
  http = await startHttp(createServer);
  buyer = await http.login('buyer@example.test', PASSWORD);
  seller = await http.login('seller@example.test', PASSWORD);
});

after(async () => {
  await http.close();
  await prisma.$disconnect();
});

test('качена фактура (пълен кредит) + документ от шкафчето (частичен) → POKUPKI.TXT; отказаната не влиза', async () => {
  // 1. Качена: примерът `domestic` с днешна дата — получателят е фирмата (ЕИК 131063188).
  const input = { ...domestic, issueDate: today, taxPointDate: today, dueDate: today };
  const built = buildEInvoice(input, { profile: 'en16931' });
  assert.ok(built.ok);
  await prisma.incomingInvoice.create({
    data: {
      organizationId: buyerId,
      format: 'UBL',
      xml: built.ubl!,
      sha256: 'a'.repeat(64),
      supplierName: domestic.seller.name,
      supplierVat: domestic.seller.vatId,
      number: domestic.number,
      typeCode: '380',
      issueDate: new Date(`${today}T00:00:00Z`),
      currency: 'EUR',
      payableCents: 11469n,
      vatCents: 1820n,
      issues: [],
      valid: true,
    },
  });
  // Отказана — не влиза.
  await prisma.incomingInvoice.create({
    data: {
      organizationId: buyerId,
      format: 'UBL',
      xml: built.ubl!,
      sha256: 'b'.repeat(64),
      supplierName: domestic.seller.name,
      number: '0000000999',
      typeCode: '380',
      issueDate: new Date(`${today}T00:00:00Z`),
      currency: 'EUR',
      payableCents: 11469n,
      vatCents: 1820n,
      issues: [],
      valid: true,
      status: 'REJECTED',
    },
  });

  // 2. Шкафче: продавачът издава до ЕИК-а на купувача — 4 × 25.00, S 20 %.
  const seriesId = (
    await prisma.documentSeries.findFirstOrThrow({ where: { organizationId: sellerId } })
  ).id;
  const issued = await http.post(seller, `/app/o/${sellerId}/nov`, {
    typeCode: '380',
    seriesId,
    issueDate: today,
    taxPointDate: today,
    dueDate: today,
    currency: 'EUR',
    'buyer[name]': 'Пекарна Зора ЕООД',
    'buyer[legalId]': '131063188',
    'buyer[vatId]': 'BG131063188',
    'buyer[street]': 'ул. „Раковски“ 2',
    'buyer[city]': 'Перник',
    'buyer[postalCode]': '2300',
    'buyer[countryCode]': 'BG',
    'lines[0][name]': 'Брашно тип 500',
    'lines[0][quantity]': '4',
    'lines[0][unitCode]': 'KGM',
    'lines[0][netPrice]': '25.00',
    'lines[0][category]': 'S',
    'lines[0][rate]': '20',
  });
  assert.equal(issued.status, 303);
  const entry = await prisma.inboxEntry.findFirstOrThrow({ where: { recipientOrgId: buyerId } });
  const set = await http.post(buyer, `/app/o/${buyerId}/shkafche/${entry.id}/dnevnik`, {
    credit: 'PARTIAL',
    period,
  });
  assert.match(set.headers.get('location') ?? '', /ok=journal/);
  assert.equal(await prisma.auditLog.count({ where: { action: 'inbox.vatCredit' } }), 1);

  const page = await (await http.get(buyer, `/app/o/${buyerId}/dnevnik?period=${period}`)).text();
  assert.match(page, /Дневник за покупките/);
  assert.match(page, /POKUPKI\.TXT/);

  const file = await http.get(buyer, `/app/o/${buyerId}/dnevnik/POKUPKI.TXT?period=${period}`);
  assert.equal(file.status, 200);
  assert.match(file.headers.get('content-type') ?? '', /windows-1251/);
  const lines = new TextDecoder('windows-1251')
    .decode(Buffer.from(await file.arrayBuffer()))
    .split('\r\n')
    .filter(Boolean);
  assert.equal(lines.length, 2, 'отказаната не влиза');
  assert.ok(lines.every((l) => [...l].length === PURCHASE_RECORD_LENGTH));
  const field = (line: string, index: number) =>
    line.slice(167 + index * 15, 182 + index * 15).trim();
  const uploaded = lines.find((l) => l.slice(42, 62).trim() === domestic.number)!;
  assert.equal(field(uploaded, 1), '96.49', '03-31 — пълен кредит');
  assert.equal(field(uploaded, 2), '18.20', '03-41');
  const fromInbox = lines.find((l) => l !== uploaded)!;
  assert.equal(fromInbox.slice(72, 87).trim(), 'BG121604974', '03-08 — доставчикът');
  assert.equal(field(fromInbox, 3), '100.00', '03-32 — частичен кредит');
  assert.equal(field(fromInbox, 4), '20.00', '03-42');
  assert.equal(await prisma.auditLog.count({ where: { action: 'journal.purchases.exported' } }), 1);
});
