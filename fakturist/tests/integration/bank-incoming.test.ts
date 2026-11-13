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
const { calculate, toCii, toUbl } = await import('../../src/einvoice/index.js');
const { sofiaToday } = await import('../../src/time.js');
const { addDays } = await import('../../src/recurring/schedule.js');
const { SAMPLES } = await import('../fixtures/einvoice-samples.js');
const { CAMT053 } = await import('../fixtures/camt053.js');

/** SPEC 54–55: сверка с банковото извлечение и регистър на входящите е-фактури. */
const PASSWORD = 'дълга-и-трудна-парола-2026';
let http: HttpClient;
let owner: Session;
let viewer: Session;
let orgId = '';
let seriesId = '';
const today = sofiaToday();

function upload(
  session: Session,
  path: string,
  name: string,
  content: string | Buffer,
  type: string,
) {
  const form = new FormData();
  form.append('_csrf', session.csrf);
  form.append('file', new Blob([content], { type }), name);
  return fetch(`${http.origin}${path}`, {
    method: 'POST',
    redirect: 'manual',
    headers: { cookie: session.cookie },
    body: form,
  });
}

async function issue(amount: string): Promise<{ id: string; number: string }> {
  const res = await http.post(owner, `/app/o/${orgId}/nov`, {
    typeCode: '380',
    seriesId,
    issueDate: today,
    taxPointDate: today,
    dueDate: addDays(today, 14),
    currency: 'EUR',
    'buyer[name]': 'Сладкарница Роза ЕООД',
    'buyer[legalId]': '121604974',
    'buyer[street]': 'ул. „Шипка“ 1',
    'buyer[city]': 'София',
    'buyer[postalCode]': '1000',
    'buyer[countryCode]': 'BG',
    'lines[0][name]': 'Услуга',
    'lines[0][quantity]': '1',
    'lines[0][unitCode]': 'C62',
    'lines[0][netPrice]': amount,
    'lines[0][category]': 'S',
    'lines[0][rate]': '20',
  });
  assert.equal(res.status, 303);
  return prisma.document.findFirstOrThrow({
    where: { organizationId: orgId },
    orderBy: { createdAt: 'desc' },
    select: { id: true, number: true },
  }) as Promise<{ id: string; number: string }>;
}

before(async () => {
  await truncateAll(prisma);
  await prisma.$transaction((tx) => seedPlans(tx));
  // Получателят на пробите в ядрото е НАП (ЕИК 131063188) — фирмата е с този ЕИК, за да е „наша“.
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
  const viewerUser = await prisma.user.create({
    data: {
      email: 'viewer@example.test',
      name: 'Само Гледа',
      passwordHash: (await prisma.user.findUniqueOrThrow({ where: { id: seller.userId } }))
        .passwordHash,
    },
  });
  await prisma.membership.create({
    data: { userId: viewerUser.id, organizationId: orgId, role: 'VIEWER' },
  });
  seriesId = (await prisma.documentSeries.findFirstOrThrow({ where: { organizationId: orgId } }))
    .id;
  http = await startHttp(createServer);
  owner = await http.login('owner@example.test', PASSWORD);
  viewer = await http.login('viewer@example.test', PASSWORD);
});

after(async () => {
  await http.close();
  await prisma.$disconnect();
});

test('входяща UBL и CII: проверени, в регистъра; същият файл втори път — отказ', async () => {
  const input = SAMPLES.domestic;
  const ubl = toUbl(input, calculate(input));
  const res = await upload(owner, `/app/o/${orgId}/vhodyashti`, 'f.xml', ubl, 'application/xml');
  assert.equal(res.status, 303);
  assert.match(res.headers.get('location') ?? '', /ok=uploaded$/);
  const row = await prisma.incomingInvoice.findFirstOrThrow({ where: { organizationId: orgId } });
  assert.equal(row.format, 'UBL');
  assert.equal(row.number, input.number);
  assert.equal(row.supplierEik, input.seller.legalId);
  assert.equal(row.payableCents, 11469n);
  assert.equal(row.valid, true);
  const again = await upload(owner, `/app/o/${orgId}/vhodyashti`, 'f.xml', ubl, 'application/xml');
  assert.match(again.headers.get('location') ?? '', /err=duplicate/);

  const cii = toCii(SAMPLES.reverseCharge, calculate(SAMPLES.reverseCharge));
  const ciiRes = await upload(owner, `/app/o/${orgId}/vhodyashti`, 'r.xml', cii, 'application/xml');
  assert.match(ciiRes.headers.get('location') ?? '', /ok=/);
  const list = await (await http.get(owner, `/app/o/${orgId}/vhodyashti`)).text();
  assert.ok(list.includes(input.number));
  assert.ok(list.includes(SAMPLES.reverseCharge.number));
  const page = await (await http.get(owner, `/app/o/${orgId}/vhodyashti/${row.id}`)).text();
  assert.match(page, /минава проверките/);
  const xml = await http.get(owner, `/app/o/${orgId}/vhodyashti/${row.id}/fail.xml`);
  assert.equal(await xml.text(), ubl);
});

test('подправена сума — записва се с грешка TOTALS; DTD/XXE — отказ; зрителят не качва', async () => {
  const input = SAMPLES.zeroRated;
  const forged = toUbl(input, calculate(input)).replace(
    /<cbc:PayableAmount currencyID="EUR">[^<]+</,
    '<cbc:PayableAmount currencyID="EUR">1.00<',
  );
  const res = await upload(owner, `/app/o/${orgId}/vhodyashti`, 'z.xml', forged, 'application/xml');
  assert.match(res.headers.get('location') ?? '', /ok=uploadedIssues/);
  const row = await prisma.incomingInvoice.findFirstOrThrow({ where: { number: input.number } });
  assert.equal(row.valid, false);
  assert.ok((row.issues as Array<{ rule: string }>).some((i) => i.rule === 'TOTALS'));

  const xxe =
    '<?xml version="1.0"?><!DOCTYPE a [<!ENTITY x SYSTEM "file:///etc/passwd">]><Invoice>&x;</Invoice>';
  const refused = await upload(
    owner,
    `/app/o/${orgId}/vhodyashti`,
    'x.xml',
    xxe,
    'application/xml',
  );
  assert.match(refused.headers.get('location') ?? '', /err=dtd/);
  const notInvoice = await upload(
    owner,
    `/app/o/${orgId}/vhodyashti`,
    'o.xml',
    '<Order/>',
    'application/xml',
  );
  assert.match(notInvoice.headers.get('location') ?? '', /err=notInvoice/);
  const denied = await upload(
    viewer,
    `/app/o/${orgId}/vhodyashti`,
    'f.xml',
    '<Invoice/>',
    'application/xml',
  );
  assert.equal(denied.status, 404);
  const big = await upload(
    owner,
    `/app/o/${orgId}/vhodyashti`,
    'big.xml',
    Buffer.alloc(2 * 1024 * 1024 + 10, 'a'),
    'application/xml',
  );
  assert.match(big.headers.get('location') ?? '', /err=tooLarge/);
});

test('статус на входяща: платена с дата; в бъдещето — отказ', async () => {
  const row = await prisma.incomingInvoice.findFirstOrThrow({
    where: { number: SAMPLES.domestic.number },
  });
  const base = `/app/o/${orgId}/vhodyashti/${row.id}`;
  const future = await http.post(owner, `${base}/status`, {
    status: 'PAID',
    paidOn: addDays(today, 2),
  });
  assert.match(future.headers.get('location') ?? '', /err=date/);
  await http.post(owner, `${base}/status`, { status: 'PAID', paidOn: today });
  const paid = await prisma.incomingInvoice.findUniqueOrThrow({ where: { id: row.id } });
  assert.equal(paid.status, 'PAID');
  assert.equal(paid.paidAt?.toISOString().slice(0, 10), today);
});

test('сверка: без план — отказ; camt.053 → предложение по номер → потвърждение → платена', async () => {
  const blocked = await upload(owner, `/app/o/${orgId}/banka`, 's.xml', CAMT053, 'application/xml');
  assert.match(blocked.headers.get('location') ?? '', /err=feature/);
  await prisma.subscription.updateMany({
    where: { organizationId: orgId, status: 'ACTIVE' },
    data: { planCode: 'business' },
  });
  const first = await issue('100.00'); // 120.00 с ДДС — номер 0000000001
  assert.equal(first.number, '0000000001');
  const res = await upload(owner, `/app/o/${orgId}/banka`, 's.xml', CAMT053, 'application/xml');
  assert.match(res.headers.get('location') ?? '', /ok=imported&total=3&created=3/);
  const again = await upload(owner, `/app/o/${orgId}/banka`, 's.xml', CAMT053, 'application/xml');
  assert.match(again.headers.get('location') ?? '', /err=duplicate/);
  // Застъпващо се извлечение (друг файл, същите постъпления) не дублира редовете.
  const overlap = await upload(
    owner,
    `/app/o/${orgId}/banka`,
    's2.xml',
    CAMT053.replace('STMT-1', 'STMT-1b'),
    'application/xml',
  );
  assert.match(overlap.headers.get('location') ?? '', /created=0/);
  assert.equal(await prisma.bankLine.count({ where: { organizationId: orgId } }), 3);

  const page = await (await http.get(owner, `/app/o/${orgId}/banka`)).text();
  assert.match(page, /value="0000000001"/);
  assert.match(page, /по номера в основанието/);
  const line = await prisma.bankLine.findFirstOrThrow({ where: { amountCents: 12000n } });
  const linked = await http.post(owner, `/app/o/${orgId}/banka/${line.id}/svarzhi`, {
    number: '0000000001',
  });
  assert.match(linked.headers.get('location') ?? '', /ok=svarzhi/);
  const doc = await prisma.document.findUniqueOrThrow({ where: { id: first.id } });
  assert.equal(doc.paymentState, 'PAID');
  assert.equal(doc.paidAt?.toISOString().slice(0, 10), '2026-11-12', 'датата на постъплението');
  const payment = await prisma.documentPayment.findFirstOrThrow({
    where: { documentId: first.id },
  });
  assert.equal(payment.source, 'BANK');
  // Втори път — редът вече е обработен.
  const twice = await http.post(owner, `/app/o/${orgId}/banka/${line.id}/svarzhi`, {
    number: '0000000001',
  });
  assert.match(twice.headers.get('location') ?? '', /err=state/);
  // Ръчно не се маха плащане от сверката; отмяната го маха и редът е пак нов.
  const manual = await http.post(
    owner,
    `/app/o/${orgId}/d/${first.id}/plashtane/${payment.id}/mahni`,
    {},
  );
  assert.match(manual.headers.get('location') ?? '', /plashtane=source/);
  await http.post(owner, `/app/o/${orgId}/banka/${line.id}/otmeni`, {});
  assert.equal(
    (await prisma.document.findUniqueOrThrow({ where: { id: first.id } })).paymentState,
    'UNPAID',
  );
  assert.equal((await prisma.bankLine.findUniqueOrThrow({ where: { id: line.id } })).status, 'NEW');
});

test('сверка: частично, над остатъка — отказ, пропускане; по сума при единствена фактура', async () => {
  const second = await issue('250.00'); // 300.00 — 0000000002
  const partial = await prisma.bankLine.findFirstOrThrow({ where: { amountCents: 10000n } });
  await http.post(owner, `/app/o/${orgId}/banka/${partial.id}/svarzhi`, { number: '2' });
  assert.equal(
    (await prisma.document.findUniqueOrThrow({ where: { id: second.id } })).paymentState,
    'PARTIAL',
  );
  const big = await prisma.bankLine.findFirstOrThrow({ where: { amountCents: 20000n } });
  // 200 > 120 остатък по фактура 1 → отказ (без надплащане).
  const over = await http.post(owner, `/app/o/${orgId}/banka/${big.id}/svarzhi`, { number: '1' });
  assert.match(over.headers.get('location') ?? '', /err=paymentAmount/);
  await http.post(owner, `/app/o/${orgId}/banka/${big.id}/propusni`, {});
  assert.equal(
    (await prisma.bankLine.findUniqueOrThrow({ where: { id: big.id } })).status,
    'IGNORED',
  );
  // Без номер в основанието — по сумата, ако фактурата с такъв остатък е една.
  const { suggest } = await import('../../src/bank/reconcile.js');
  const s = await suggest(orgId, { remittance: 'наем', amountCents: 20000n, currency: 'EUR' });
  assert.equal(s?.number, '0000000002');
  assert.equal(s?.reason, 'amount');
  // Зрителят вижда, но не свързва.
  assert.equal((await http.get(viewer, `/app/o/${orgId}/banka`)).status, 200);
  const line = await prisma.bankLine.findFirstOrThrow({ where: { amountCents: 12000n } });
  assert.equal(
    (await http.post(viewer, `/app/o/${orgId}/banka/${line.id}/svarzhi`, { number: '1' })).status,
    404,
  );
});

test('сверка: CSV извлечение (windows-1251 е в unit теста на разчитането)', async () => {
  const csv =
    'Дата;Наредител;Основание;Кредит;Валута\r\n13.11.2026;Роза;ф-ра 0000000001;120,00;EUR\r\n';
  const encoded = Buffer.from(csv, 'utf8');
  const res = await upload(owner, `/app/o/${orgId}/banka`, 'izvlechenie.csv', encoded, 'text/csv');
  assert.match(res.headers.get('location') ?? '', /ok=imported&total=1&created=1/);
});
