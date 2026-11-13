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

/**
 * Регресии по одита на парите и документите (Кодаджията и Данъчника, 13.11.2026): двоен клик на
 * „Издай“; плащанията при „Анулирай и издай нов“; известие към основния документ; видове, които
 * българският доставчик не издава; фактура от проформа — същият получател.
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
  const seller = await register({
    kind: 'company',
    name: 'Иван Петров',
    email: 'owner@example.test',
    password: PASSWORD,
    acceptTerms: 'on',
    legalName: 'Пекарна Зора ЕООД',
    eik: '131063188',
    vatNumber: 'BG131063188',
    addressStreet: 'ул. „Раковски“ 2',
    addressCity: 'Перник',
    postalCode: '2300',
  });
  orgId = seller.organizationId;
  seriesId = (await prisma.documentSeries.findFirstOrThrow({ where: { organizationId: orgId } }))
    .id;
  http = await startHttp(createServer);
  owner = await http.login('owner@example.test', PASSWORD);
});

after(async () => {
  await http.close();
  await prisma.$disconnect();
});

function form(extra: Record<string, string> = {}): Record<string, string> {
  return {
    typeCode: '380',
    seriesId,
    issueDate: today,
    taxPointDate: today,
    dueDate: today,
    currency: 'EUR',
    'buyer[name]': 'Сладкарница Роза ЕООД',
    'buyer[legalId]': '121604974',
    'buyer[street]': 'ул. „Шипка“ 1',
    'buyer[city]': 'София',
    'buyer[postalCode]': '1000',
    'buyer[countryCode]': 'BG',
    'lines[0][name]': 'Хляб',
    'lines[0][quantity]': '10',
    'lines[0][unitCode]': 'C62',
    'lines[0][netPrice]': '1.25',
    'lines[0][category]': 'S',
    'lines[0][rate]': '20',
    ...extra,
  };
}

const issue = (extra: Record<string, string> = {}) =>
  http.post(owner, `/app/o/${orgId}/nov`, form(extra));
const count = () => prisma.document.count({ where: { organizationId: orgId } });
const latest = () =>
  prisma.document.findFirstOrThrow({
    where: { organizationId: orgId },
    orderBy: { createdAt: 'desc' },
  });

test('двоен клик на „Издай“: един документ, второто изпращане води до него', async () => {
  const before = await count();
  const token = 'ednokraten-klyuch-0001';
  const [first, second] = await Promise.all([
    issue({ issueToken: token }),
    issue({ issueToken: token }),
  ]);
  assert.equal(first.status, 303);
  assert.equal(second.status, 303);
  assert.equal(await count(), before + 1, 'само един номер');
  assert.equal(first.headers.get('location'), second.headers.get('location'));
  // И последователно — пак към същия.
  const third = await issue({ issueToken: token });
  assert.equal(third.headers.get('location'), first.headers.get('location'));
  assert.equal(await count(), before + 1);
  // Формата носи нов ключ при всяко отваряне.
  const page = await (await http.get(owner, `/app/o/${orgId}/nov`)).text();
  assert.match(page, /name="issueToken" value="[A-Za-z0-9_-]{16,64}"/);
});

test('„Анулирай и издай нов“ на платена фактура: плащанията минават към новата; надплатено — отказ', async () => {
  assert.equal((await issue()).status, 303);
  const paid = await latest();
  assert.equal(paid.payableCents, 1500n);
  const pay = await http.post(owner, `/app/o/${orgId}/d/${paid.id}/plashtane`, {
    amount: '15.00',
    paidOn: today,
  });
  assert.equal(pay.status, 303);
  assert.equal(
    (await prisma.document.findUniqueOrThrow({ where: { id: paid.id } })).paymentState,
    'PAID',
  );

  // Новата е за по-малко от платеното — отказ, нищо не се сменя.
  const smaller = await issue({
    replaces: paid.id,
    annulReason: 'requisite',
    'lines[0][quantity]': '5',
  });
  assert.equal(smaller.status, 400);
  assert.match(await smaller.text(), /надхвърля сумата на новия/);
  assert.equal(
    (await prisma.document.findUniqueOrThrow({ where: { id: paid.id } })).status,
    'ISSUED',
  );

  const replaced = await issue({
    replaces: paid.id,
    annulReason: 'requisite',
    'buyer[street]': 'ул. „Шипка“ 11',
  });
  assert.equal(replaced.status, 303);
  const fresh = await latest();
  const old = await prisma.document.findUniqueOrThrow({ where: { id: paid.id } });
  assert.equal(old.status, 'CANCELLED');
  assert.equal(old.paidCents, 0n);
  assert.equal(fresh.paidCents, 1500n);
  assert.equal(fresh.paymentState, 'PAID', 'без напомняния към вече платилия');
  assert.equal(await prisma.documentPayment.count({ where: { documentId: fresh.id } }), 1);
});

test('известие: „5“ е „0000000005“; към анулирана фактура или към известие — отказ; чужд номер — с предупреждение', async () => {
  assert.equal((await issue()).status, 303);
  const invoice = await latest();
  const short = String(Number(invoice.number));
  const note = await issue({
    typeCode: '381',
    'preceding[number]': short,
    'preceding[issueDate]': today,
    'preceding[reason]': 'върната стока',
  });
  assert.equal(note.status, 303);
  const credit = await latest();
  assert.equal(credit.precedingId, invoice.id, 'свързано въпреки краткия номер');
  assert.match(credit.ublXml ?? '', new RegExp(`<cbc:ID>${invoice.number}</cbc:ID>`));
  // Анулиране на фактура с известие към нея — отказ (пазачът вече не се заобикаля с кратък номер).
  const annul = await issue({ replaces: invoice.id, annulReason: 'requisite' });
  assert.equal(annul.status, 400);

  const cancelled = await prisma.document.findFirstOrThrow({
    where: { organizationId: orgId, status: 'CANCELLED' },
  });
  const toCancelled = await issue({
    typeCode: '381',
    'preceding[number]': cancelled.number!,
    'preceding[reason]': 'върната стока',
  });
  assert.equal(toCancelled.status, 400);
  assert.match(await toCancelled.text(), /анулиран или не е фактура/);

  const toNote = await issue({
    typeCode: '383',
    'preceding[number]': credit.number!,
    'preceding[reason]': 'допълнителна услуга',
  });
  assert.equal(toNote.status, 400);

  const before = await count();
  const external = await issue({
    typeCode: '381',
    'preceding[number]': '0000099999',
    'preceding[reason]': 'отстъпка след фактурата',
  });
  assert.equal(external.status, 303, 'фактура от предишната програма — разрешено');
  assert.equal(await count(), before + 1);
  assert.equal((await latest()).precedingId, null);
});

test('видовете 384 и 389 не се издават от български доставчик', async () => {
  const before = await count();
  for (const typeCode of ['384', '389']) {
    const res = await issue({ typeCode, 'preceding[number]': '0000000001' });
    assert.equal(res.status, 400, typeCode);
    assert.match(await res.text(), /не се издава по ЗДДС/);
  }
  assert.equal(await count(), before, 'номерът не изгаря');
});

test('фактура от проформа — само за същия получател', async () => {
  const created = await issue({ typeCode: 'proforma' });
  assert.equal(created.status, 303);
  const proforma = await prisma.proforma.findFirstOrThrow({
    where: { organizationId: orgId },
    orderBy: { createdAt: 'desc' },
  });
  const other = await issue({
    fromProforma: proforma.id,
    'buyer[name]': 'Друга Фирма ООД',
    'buyer[legalId]': '200000002',
  });
  assert.equal(other.status, 400);
  assert.match(await other.text(), /същия получател/);
  assert.equal(
    (await prisma.proforma.findUniqueOrThrow({ where: { id: proforma.id } })).status,
    'OPEN',
  );
  const same = await issue({ fromProforma: proforma.id });
  assert.equal(same.status, 303);
  assert.equal(
    (await prisma.proforma.findUniqueOrThrow({ where: { id: proforma.id } })).status,
    'INVOICED',
  );
});

test('известие без основание — отказ (чл. 115, ал. 4, т. 2 ЗДДС); основанието е в XML-а', async () => {
  assert.equal((await issue()).status, 303);
  const invoice = await latest();
  const before = await count();
  const missing = await issue({ typeCode: '381', 'preceding[number]': invoice.number! });
  assert.equal(missing.status, 400);
  assert.match(await missing.text(), /основанието за известието/);
  assert.equal(await count(), before);
  const ok = await issue({
    typeCode: '381',
    'preceding[number]': invoice.number!,
    'preceding[reason]': 'върната стока',
  });
  assert.equal(ok.status, 303);
  assert.match((await latest()).ublXml ?? '', /Основание за известието: върната стока/);
});
