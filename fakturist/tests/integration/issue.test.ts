import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { prepareTestDatabase, truncateAll } from './harness.js';

prepareTestDatabase();
const { prisma } = await import('../../src/db.js');
const { register } = await import('../../src/accounts/register.js');
const { issueDocument, IssueRejected } = await import('../../src/documents/issue.js');
const { seedPlans } = await import('../../src/billing/seed-plans.js');
const { verifyOrganizationChain } = await import('../../src/ledger/verify-org.js');
const { sha256 } = await import('../../src/ledger/chain.js');
const { domestic } = await import('../fixtures/einvoice-samples.js');

let organizationId = '';
let userId = '';
let seriesId = '';

before(async () => {
  await truncateAll(prisma);
  await prisma.$transaction((tx) => seedPlans(tx));
  const created = await register({
    kind: 'company',
    name: 'Иван Петров',
    email: 'owner@example.test',
    password: 'дълга-и-трудна-парола-2026',
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
});

after(async () => {
  await prisma.$disconnect();
});

function request() {
  const { number: _n, seller: _s, ...rest } = domestic;
  return { ...rest, seriesId };
}

const access = () => ({ organizationId, role: 'OWNER' as const, viaFirmId: null, mandateId: null });

test('издаване: номер 0000000001, сумите и XML-ът са в документа', async () => {
  const result = await issueDocument(access(), userId, request());
  assert.equal(result.number, '0000000001');
  const doc = await prisma.document.findUniqueOrThrow({ where: { id: result.id } });
  assert.equal(doc.payableCents, 11469n);
  assert.equal(doc.vatCents, 1820n);
  assert.ok(doc.ublXml?.includes('<cbc:ID>0000000001</cbc:ID>'));
  assert.ok(doc.ciiXml?.includes('<ram:ID>0000000001</ram:ID>'));
});

test('отказан документ не изгаря номер (rollback връща серията)', async () => {
  const bad = { ...request(), currency: 'USD' };
  await assert.rejects(() => issueDocument(access(), userId, bad), IssueRejected);
  const next = await issueDocument(access(), userId, request());
  assert.equal(next.number, '0000000002');
});

test('едновременно издаване: поредни номера без пропуски и без повторения', async () => {
  const results = await Promise.all(
    Array.from({ length: 8 }, () => issueDocument(access(), userId, request())),
  );
  const numbers = results.map((r) => Number(r.number)).sort((a, b) => a - b);
  assert.deepEqual(numbers, [3, 4, 5, 6, 7, 8, 9, 10]);
});

test('веригата на документите се проверява цялата; подправена сума се хваща', async () => {
  assert.deepEqual(await verifyOrganizationChain(organizationId), { count: 10, problem: null });
  const fifth = await prisma.document.findFirstOrThrow({
    where: { organizationId, chainIndex: 5n },
  });
  await prisma.document.update({ where: { id: fifth.id }, data: { payableCents: 1n } });
  assert.deepEqual((await verifyOrganizationChain(organizationId)).problem, {
    kind: 'hash',
    at: 5n,
  });
  await prisma.document.update({
    where: { id: fifth.id },
    data: { payableCents: fifth.payableCents },
  });
  assert.equal((await verifyOrganizationChain(organizationId)).problem, null);
});

test('одитът записва регистрацията и всяко издаване, свързани във верига', async () => {
  const rows = await prisma.auditLog.findMany({ orderBy: { id: 'asc' } });
  assert.equal(rows.filter((r) => r.action === 'document.issued').length, 10);
  for (let i = 1; i < rows.length; i += 1) assert.equal(rows[i]!.prevHash, rows[i - 1]!.hash);
});

test('опашката за отчитане към НАП (SPEC 63): ред за всеки издаден документ, с отпечатъка на UBL-а', async () => {
  const docs = await prisma.document.findMany({ where: { status: 'ISSUED' } });
  assert.ok(docs.length > 0);
  const reports = await prisma.nraReport.findMany();
  assert.equal(reports.length, docs.length, 'отказаните (rollback) не оставят ред');
  for (const doc of docs) {
    const report = reports.find((r) => r.documentId === doc.id);
    assert.ok(report, doc.number ?? doc.id);
    assert.equal(report.ublSha256, sha256(doc.ublXml!));
    assert.equal(report.status, 'PENDING', 'нищо не се праща до API на НАП');
    assert.equal(report.typeCode, doc.typeCode);
  }
});
