import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
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

/** SPEC 62: „Данни за SAF-T“ — планът, сметките и свързаните лица, ZIP с петте фрагмента по XSD 1.0.3. */
const PASSWORD = 'дълга-и-трудна-парола-2026';
const today = sofiaToday();
const period = today.slice(0, 7);
let http: HttpClient;
let owner: Session;
let viewer: Session;
let orgId = '';

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
  http = await startHttp(createServer);
  owner = await http.login('owner@example.test', PASSWORD);
  // Член само за четене: вижда данните, не сменя сметките.
  await register({
    ...base,
    kind: 'company',
    name: 'Мария Колева',
    email: 'viewer@example.test',
    legalName: 'Малка Работилница ЕООД',
    eik: '121604974',
  });
  const viewerUser = await prisma.user.findUniqueOrThrow({
    where: { email: 'viewer@example.test' },
  });
  await prisma.membership.create({
    data: { userId: viewerUser.id, organizationId: orgId, role: 'VIEWER' },
  });
  viewer = await http.login('viewer@example.test', PASSWORD);
});

after(async () => {
  await http.close();
  await prisma.$disconnect();
});

async function issue(extra: Record<string, string>): Promise<void> {
  const seriesId = (
    await prisma.documentSeries.findFirstOrThrow({ where: { organizationId: orgId } })
  ).id;
  const res = await http.post(owner, `/app/o/${orgId}/nov`, {
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
  });
  assert.equal(res.status, 303);
}

test('без план „Бизнес“: обяснение и връзка към плана; изтеглянето и записът — отказ', async () => {
  const page = await (await http.get(owner, `/app/o/${orgId}/saf-t`)).text();
  assert.match(page, /в план „Бизнес“ и по-горе/);
  assert.equal((await http.get(owner, `/app/o/${orgId}/saf-t.zip`)).status, 303);
  const save = await http.post(owner, `/app/o/${orgId}/saf-t`, {
    receivable: '411',
    revenue: '703',
  });
  assert.match(save.headers.get('location') ?? '', /err=plan/);
});

test('сметките и свързаните лица: проверка на формата, одит; членът само за четене — 404', async () => {
  await prisma.subscription.updateMany({
    where: { organizationId: orgId, status: 'ACTIVE' },
    data: { planCode: 'business' },
  });
  const bad = await http.post(owner, `/app/o/${orgId}/saf-t`, {
    receivable: '0411',
    revenue: '703',
  });
  assert.match(bad.headers.get('location') ?? '', /err=account/);
  const ok = await http.post(owner, `/app/o/${orgId}/saf-t`, {
    receivable: '4111',
    revenue: '702',
    related: 'BG 121604974',
  });
  assert.match(ok.headers.get('location') ?? '', /ok=saved/);
  const org = await prisma.organization.findUniqueOrThrow({ where: { id: orgId } });
  assert.equal(org.saftReceivableAccount, '4111');
  assert.equal(org.saftRevenueAccount, '702');
  assert.deepEqual(org.saftRelatedParties, ['BG121604974']);
  assert.equal(await prisma.auditLog.count({ where: { action: 'saft.settings' } }), 1);
  const denied = await http.post(viewer, `/app/o/${orgId}/saf-t`, {
    receivable: '411',
    revenue: '703',
  });
  assert.equal(denied.status, 404, 'без право — 404, както навсякъде (requireOrg)');
  const page = await (await http.get(viewer, `/app/o/${orgId}/saf-t`)).text();
  assert.doesNotMatch(page, /name="receivable"/);
});

test('месецът: две фактури, кредитно известие и плащане → ZIP с петте файла и README', async () => {
  await issue({});
  await issue({ 'lines[0][quantity]': '4' });
  const first = await prisma.document.findFirstOrThrow({
    where: { organizationId: orgId },
    orderBy: { createdAt: 'asc' },
  });
  await issue({
    typeCode: '381',
    'preceding[number]': first.number!,
    'preceding[issueDate]': today,
    'preceding[reason]': 'върната стока',
    'lines[0][quantity]': '2',
  });
  const paid = await http.post(owner, `/app/o/${orgId}/d/${first.id}/plashtane`, {
    amount: '5.00',
    paidOn: today,
  });
  assert.equal(paid.status, 303);

  const page = await (await http.get(owner, `/app/o/${orgId}/saf-t?period=${period}`)).text();
  assert.match(page, /Документи: 3 · клиенти: 1 · артикули: 1/);

  const res = await http.get(owner, `/app/o/${orgId}/saf-t.zip?period=${period}`);
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('content-type'), 'application/zip');
  assert.match(
    res.headers.get('content-disposition') ?? '',
    new RegExp(`saft-prodazhbi-131063188-${period}\\.zip`),
  );
  const dir = mkdtempSync(join(tmpdir(), 'fakturist-saft-'));
  const file = join(dir, 'saft.zip');
  writeFileSync(file, Buffer.from(await res.arrayBuffer()));
  execFileSync('unzip', ['-tq', file]);
  const names = execFileSync('unzip', ['-Z1', file], { encoding: 'utf8' }).trim().split('\n');
  assert.deepEqual(names, [
    'SalesInvoices.xml',
    'Customers.xml',
    'Products.xml',
    'TaxTable.xml',
    'UOMTable.xml',
    'README.txt',
  ]);
  const read = (name: string) => execFileSync('unzip', ['-p', file, name], { encoding: 'utf8' });
  const sales = read('SalesInvoices.xml');
  assert.match(sales, /<NumberOfEntries>3<\/NumberOfEntries>/);
  // D: 12.50 + 5.00; C: 2.50 (кредитното известие).
  assert.match(sales, /<TotalDebit>17\.50<\/TotalDebit>/);
  assert.match(sales, /<TotalCredit>2\.50<\/TotalCredit>/);
  assert.match(sales, /<AccountID>4111<\/AccountID>/);
  assert.match(sales, /<AccountID>702<\/AccountID>/);
  assert.match(sales, /<CustomerID>10121604974<\/CustomerID>/);
  const customers = read('Customers.xml');
  assert.match(customers, /<RelatedParty>Y<\/RelatedParty>/);
  // Вземане: 15.00 + 6.00 − 3.00 (с ДДС) − 5.00 платени = 13.00; началото на месеца — 0.
  assert.match(customers, /<OpeningDebitBalance>0\.00<\/OpeningDebitBalance>/);
  assert.match(customers, /<ClosingDebitBalance>13\.00<\/ClosingDebitBalance>/);
  // C62 е в Unit_Of_Measure („единица“) — остава C62.
  assert.match(read('UOMTable.xml'), /<UnitOfMeasure>C62<\/UnitOfMeasure>/);
  assert.match(read('README.txt'), /Сметки: вземания от клиенти 4111, приходи 702/);
  assert.equal(await prisma.auditLog.count({ where: { action: 'saft.exported' } }), 1);

  // Празен месец — без архив; чужд човек — 404.
  assert.equal((await http.get(owner, `/app/o/${orgId}/saf-t.zip?period=2026-01`)).status, 303);
  await register({
    password: PASSWORD,
    acceptTerms: 'on',
    addressStreet: 'ул. 1',
    addressCity: 'Варна',
    postalCode: '9000',
    kind: 'company',
    name: 'Чужд Човек',
    email: 'stranger@example.test',
    legalName: 'Чужда Фирма ЕООД',
    eik: '000713391',
  });
  const stranger = await http.login('stranger@example.test', PASSWORD);
  assert.equal((await http.get(stranger, `/app/o/${orgId}/saf-t`)).status, 404);
});

test('аванс → окончателна с приспадане → платена: салдото на клиента е 0 (авансът не е вземане)', async () => {
  const buyer = { 'buyer[name]': 'Мебели Бор ЕООД', 'buyer[legalId]': '000713391' };
  await issue({
    ...buyer,
    typeCode: '386',
    'lines[0][name]': 'Аванс по договор № 7',
    'lines[0][quantity]': '1',
    'lines[0][netPrice]': '100.00',
  });
  const advance = await prisma.document.findFirstOrThrow({
    where: { organizationId: orgId, typeCode: '386' },
  });
  await issue({
    ...buyer,
    'lines[0][name]': 'Изработка на кухненски шкафове',
    'lines[0][quantity]': '1',
    'lines[0][netPrice]': '300.00',
    'advance[number]': advance.number!,
  });
  const final = await prisma.document.findFirstOrThrow({
    where: { organizationId: orgId, typeCode: '380', buyerEik: '000713391' },
  });
  assert.equal(final.payableCents, 240_00n, '360.00 − 120.00 аванс');
  const paid = await http.post(owner, `/app/o/${orgId}/d/${final.id}/plashtane`, {
    amount: '240.00',
    paidOn: today,
  });
  assert.equal(paid.status, 303);

  const res = await http.get(owner, `/app/o/${orgId}/saf-t.zip?period=${period}`);
  assert.equal(res.status, 200);
  const dir = mkdtempSync(join(tmpdir(), 'fakturist-saft-'));
  const file = join(dir, 'saft.zip');
  writeFileSync(file, Buffer.from(await res.arrayBuffer()));
  const customers = execFileSync('unzip', ['-p', file, 'Customers.xml'], { encoding: 'utf8' });
  const bor = customers.slice(customers.indexOf('<CustomerID>10000713391</CustomerID>'));
  assert.match(bor, /^<CustomerID>10000713391<\/CustomerID>/);
  assert.match(bor, /<ClosingDebitBalance>0\.00<\/ClosingDebitBalance>/);
  const sales = execFileSync('unzip', ['-p', file, 'SalesInvoices.xml'], { encoding: 'utf8' });
  // Авансовата е 01 (ППЗДДС няма отделен вид), приспадането — ред C.
  assert.match(sales, /<NumberOfEntries>5<\/NumberOfEntries>/);
});
