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
const { verifyOrganizationChain } = await import('../../src/ledger/verify-org.js');
const { sofiaToday } = await import('../../src/time.js');

/**
 * Веригата v2 покрива и входа, от който се рисува PDF-ът (одитът на парите, 13.11.2026): подменени суми
 * или получател в `Document.input` чупят звеното и PDF-ът не се рисува.
 */
const PASSWORD = 'дълга-и-трудна-парола-2026';
const today = sofiaToday();
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
      vatNumber: 'BG131063188',
      addressStreet: 'ул. „Раковски“ 2',
      addressCity: 'Перник',
      postalCode: '2300',
    })
  ).organizationId;
  http = await startHttp(createServer);
  owner = await http.login('owner@example.test', PASSWORD);
});

after(async () => {
  await http.close();
  await prisma.$disconnect();
});

test('изрядна верига → подменен вход: проверката го хваща, PDF-ът не се рисува; XML-ът е непокътнат', async () => {
  const seriesId = (
    await prisma.documentSeries.findFirstOrThrow({ where: { organizationId: orgId } })
  ).id;
  for (const name of ['Хляб', 'Козунак']) {
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
      'lines[0][name]': name,
      'lines[0][quantity]': '1',
      'lines[0][unitCode]': 'C62',
      'lines[0][netPrice]': '10.00',
      'lines[0][category]': 'S',
      'lines[0][rate]': '20',
    });
    assert.equal(res.status, 303);
  }
  assert.deepEqual(await verifyOrganizationChain(orgId), { count: 2, problem: null });
  const first = await prisma.document.findFirstOrThrow({
    where: { organizationId: orgId },
    orderBy: { chainIndex: 'asc' },
  });
  assert.match(first.inputSha256 ?? '', /^[0-9a-f]{64}$/);
  const pdfPath = `/app/o/${orgId}/d/${first.id}/pdf`;
  const pdfOk = await http.get(owner, pdfPath);
  assert.equal(pdfOk.status, 200);

  // Някой с достъп до базата (без ключа на печата) сменя получателя във входа.
  const input = first.input as { buyer: { name: string } };
  await prisma.document.update({
    where: { id: first.id },
    data: { input: { ...input, buyer: { ...input.buyer, name: 'Подменен Получател ООД' } } },
  });
  const after = await verifyOrganizationChain(orgId);
  assert.deepEqual(after.problem, { kind: 'hash', at: 1n });
  const pdfTampered = await http.get(owner, pdfPath);
  assert.equal(pdfTampered.status, 500, 'PDF с подменени данни не излиза');
});
