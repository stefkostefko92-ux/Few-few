import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
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

/** SPEC 47: анулиране по чл. 116 ЗДДС — само с нов документ, номерът остава зает, веригата е цяла. */
const PASSWORD = 'дълга-и-трудна-парола-2026';
let http: HttpClient;
let owner: Session;
let issuer: Session;
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
  // Получателят е регистриран и потвърден — документите стигат до шкафчето му.
  const buyer = await register({
    kind: 'company',
    name: 'Мария Георгиева',
    email: 'buyer@example.test',
    password: PASSWORD,
    acceptTerms: 'on',
    legalName: 'Сладкарница Роза ЕООД',
    eik: '121604974',
    addressStreet: 'ул. „Шипка“ 1',
    addressCity: 'София',
    postalCode: '1000',
  });
  await prisma.organization.update({
    where: { id: buyer.organizationId },
    data: { verifiedAt: new Date() },
  });
  const issuerUser = await prisma.user.create({
    data: {
      email: 'issuer@example.test',
      name: 'Само Издава',
      passwordHash: (await prisma.user.findUniqueOrThrow({ where: { id: seller.userId } }))
        .passwordHash,
    },
  });
  await prisma.membership.create({
    data: { userId: issuerUser.id, organizationId: orgId, role: 'ISSUER' },
  });
  seriesId = (await prisma.documentSeries.findFirstOrThrow({ where: { organizationId: orgId } }))
    .id;
  await prisma.notification.deleteMany();
  http = await startHttp(createServer);
  owner = await http.login('owner@example.test', PASSWORD);
  issuer = await http.login('issuer@example.test', PASSWORD);
});

after(async () => {
  await http.close();
  await prisma.$disconnect();
});

function form(extra: Record<string, string> = {}): Record<string, string> {
  return {
    typeCode: '380',
    seriesId,
    issueDate: '2026-11-13',
    taxPointDate: '2026-11-13',
    dueDate: '2026-11-27',
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

async function issue(session: Session, extra: Record<string, string> = {}) {
  const res = await http.post(session, `/app/o/${orgId}/nov`, form(extra));
  return res;
}

test('анулиране с нов документ: старият е анулиран, номерът остава зает, веригата е цяла', async () => {
  assert.equal((await issue(owner)).status, 303);
  const old = await prisma.document.findFirstOrThrow({ where: { organizationId: orgId } });
  assert.equal(old.number, '0000000001');

  // Формата за замяна идва попълнена с данните на стария документ.
  const page = await http.get(owner, `/app/o/${orgId}/nov?zamenya=${old.id}`);
  assert.equal(page.status, 200);
  const html = await page.text();
  assert.ok(html.includes('value="Сладкарница Роза ЕООД"'));
  assert.ok(html.includes(`name="replaces" value="${old.id}"`));

  // Без основание — отказ, номерът не изгаря.
  const noReason = await issue(owner, { replaces: old.id });
  assert.equal(noReason.status, 400);
  assert.equal(await prisma.document.count({ where: { organizationId: orgId } }), 1);

  const replaced = await issue(owner, {
    replaces: old.id,
    annulReason: 'requisite',
    'buyer[street]': 'ул. „Шипка“ 11',
  });
  assert.equal(replaced.status, 303);
  const after = await prisma.document.findUniqueOrThrow({
    where: { id: old.id },
    include: { replacedBy: true },
  });
  assert.equal(after.status, 'CANCELLED');
  assert.equal(after.cancelReason, 'requisite');
  assert.ok(after.cancelledAt && after.cancelledById);
  assert.equal(after.replacedBy?.number, '0000000002');

  // Веригата на документите е цяла (анулирането е в одита, не пипа звеното).
  const { problem } = await verifyOrganizationChain(orgId);
  assert.equal(problem, null);
  const log = await prisma.auditLog.findFirstOrThrow({ where: { action: 'document.annulled' } });
  assert.equal(log.targetId, old.id);

  // Получателят в шкафчето научава за анулирането.
  assert.ok(
    (await prisma.notification.count({
      where: { kind: 'inbox.annulled', toEmail: 'buyer@example.test' },
    })) >= 1,
  );

  // Протоколът по чл. 116, ал. 4: основанието, двата номера, страните.
  const protocol = await http.get(owner, `/app/o/${orgId}/d/${old.id}/protokol.pdf`);
  assert.equal(protocol.status, 200);
  const text = execFileSync('pdftotext', ['-', '-'], {
    input: Buffer.from(await protocol.arrayBuffer()),
  }).toString();
  for (const needle of ['ПРОТОКОЛ', '0000000001', '0000000002', 'чл. 116', 'Сладкарница Роза ЕООД'])
    assert.ok(text.includes(needle), needle);
  // PDF-ът на анулирания носи печата.
  const pdf = await http.get(owner, `/app/o/${orgId}/d/${old.id}/pdf`);
  const pdfText = execFileSync('pdftotext', ['-', '-'], {
    input: Buffer.from(await pdf.arrayBuffer()),
  }).toString();
  assert.ok(pdfText.includes('АНУЛИРАН'));
});

test('втори път, без право, с известие към документа или друг вид — отказ', async () => {
  const cancelled = await prisma.document.findFirstOrThrow({
    where: { organizationId: orgId, status: 'CANCELLED' },
  });
  assert.equal((await http.get(owner, `/app/o/${orgId}/nov?zamenya=${cancelled.id}`)).status, 404);
  const again = await issue(owner, { replaces: cancelled.id, annulReason: 'vatRate' });
  assert.equal(again.status, 400);

  const live = await prisma.document.findFirstOrThrow({
    where: { organizationId: orgId, status: 'ISSUED' },
  });
  // ISSUER няма documents.cancel.
  assert.equal((await http.get(issuer, `/app/o/${orgId}/nov?zamenya=${live.id}`)).status, 404);
  // Друг вид документ не заменя фактура.
  const before = await prisma.document.count({ where: { organizationId: orgId } });
  const wrongType = await issue(owner, {
    replaces: live.id,
    annulReason: 'vatRate',
    typeCode: '386',
  });
  assert.equal(wrongType.status, 400);
  assert.equal(await prisma.document.count({ where: { organizationId: orgId } }), before);
  // Кредитно известие към документа → анулирането не е допустимо (поправката е чрез известие).
  const note = await issue(owner, {
    typeCode: '381',
    'preceding[number]': live.number!,
    'preceding[issueDate]': '2026-11-13',
    'preceding[reason]': 'отстъпка след фактурата',
  });
  assert.equal(note.status, 303, await note.text());
  const blocked = await issue(owner, { replaces: live.id, annulReason: 'vatRate' });
  assert.equal(blocked.status, 400);
  assert.ok((await blocked.text()).includes('известия'));
});
