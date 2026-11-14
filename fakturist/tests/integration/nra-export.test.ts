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
const { RECORD_LENGTH } = await import('../../src/export/sales-journal.js');

/** SPEC 61: дневникът за продажбите за месец — преглед и PRODAGBI.TXT от издадените документи. */
const PASSWORD = 'дълга-и-трудна-парола-2026';
const today = sofiaToday();
const period = today.slice(0, 7);
let http: HttpClient;
let owner: Session;
let noVat: Session;
let orgId = '';
let noVatOrgId = '';

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
  noVatOrgId = (
    await register({
      ...base,
      kind: 'company',
      name: 'Мария Колева',
      email: 'novat@example.test',
      legalName: 'Малка Работилница ЕООД',
      eik: '121604974',
    })
  ).organizationId;
  http = await startHttp(createServer);
  owner = await http.login('owner@example.test', PASSWORD);
  noVat = await http.login('novat@example.test', PASSWORD);
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

test('месецът: фактури и кредитно известие → PRODAGBI.TXT в windows-1251, по запис на ред', async () => {
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

  const page = await http.get(owner, `/app/o/${orgId}/dnevnik?period=${period}`);
  assert.equal(page.status, 200);
  const html = await page.text();
  assert.match(html, /Записи в дневника: 3/);
  assert.match(html, /PRODAGBI\.TXT/);

  const file = await http.get(owner, `/app/o/${orgId}/dnevnik/PRODAGBI.TXT?period=${period}`);
  assert.equal(file.status, 200);
  assert.match(file.headers.get('content-type') ?? '', /windows-1251/);
  const bytes = Buffer.from(await file.arrayBuffer());
  assert.equal(bytes.length, 3 * (RECORD_LENGTH + 2));
  const lines = new TextDecoder('windows-1251').decode(bytes).split('\r\n').filter(Boolean);
  assert.equal(lines.length, 3);
  assert.ok(lines.every((line) => line.startsWith('BG131063188    ')));
  assert.ok(
    lines.some((line) => line.slice(40, 42) === '03'),
    'кредитното известие',
  );
  // 02-11 общо: 12.50 + 5.00 − 2.50 = 15.00.
  const base20 = lines.reduce((sum, line) => sum + Number(line.slice(197, 212).trim()), 0);
  assert.equal(base20.toFixed(2), '15.00');
  assert.equal(await prisma.auditLog.count({ where: { action: 'journal.exported' } }), 1);
});

test('без ДДС номер — няма дневник; празен месец — нула записи', async () => {
  const page = await (await http.get(noVat, `/app/o/${noVatOrgId}/dnevnik`)).text();
  assert.match(page, /няма ДДС номер/);
  const file = await http.get(noVat, `/app/o/${noVatOrgId}/dnevnik/PRODAGBI.TXT`);
  assert.equal(file.status, 303);
  const empty = await (await http.get(owner, `/app/o/${orgId}/dnevnik?period=2026-01`)).text();
  assert.match(empty, /Записи в дневника: 0/);
  // Чужда фирма — 404.
  assert.equal((await http.get(noVat, `/app/o/${orgId}/dnevnik`)).status, 404);
});
