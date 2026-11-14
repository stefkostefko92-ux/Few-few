import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { prepareTestDatabase, truncateAll } from './harness.js';
import { startHttp, type HttpClient, type Session } from './http.js';
import { hookSecretOf, installFakeEConnect, postHook, postSignedRaw } from './peppol-fake.js';

prepareTestDatabase();
delete process.env['SMTP_HOST'];
const { prisma } = await import('../../src/db.js');
const { register } = await import('../../src/accounts/register.js');
const { seedPlans } = await import('../../src/billing/seed-plans.js');
const { createServer } = await import('../../src/server.js');
const { saveIntegration, invalidateIntegrations } = await import('../../src/admin/integrations.js');
const { invalidateSettings } = await import('../../src/admin/settings.js');
const { accessPoint } = await import('../../src/peppol/settings.js');
const { sendDueTransmissions } = await import('../../src/peppol/transmissions.js');
const { calculate, toUbl } = await import('../../src/einvoice/index.js');
const { domestic } = await import('../fixtures/einvoice-samples.js');
const { sofiaToday } = await import('../../src/time.js');

/**
 * SPEC 57–59: регистрация на фирмата при точката за достъп, издаване по Peppol BIS 3 с предаване в
 * същата транзакция, работникът, известията (подпис, възраст, повторение) и получаването в регистъра.
 * eConnect е фалшив сървър по документацията им (peppol-fake.ts). Защитите — в peppol-guards.test.ts.
 */
const PASSWORD = 'дълга-и-трудна-парола-2026';
let http: HttpClient;
let owner: Session;
let orgId = '';
let seriesId = '';
let hookSecret = '';
const today = sofiaToday();
const fake = installFakeEConnect();
const { sent, enrolled } = fake;

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
    'buyer[vatId]': 'BG121604974',
    'buyer[street]': 'ул. „Шипка“ 1',
    'buyer[city]': 'София',
    'buyer[postalCode]': '1000',
    'buyer[countryCode]': 'BG',
    'buyer[eScheme]': '9926',
    'buyer[eValue]': 'BG121604974',
    buyerReference: 'PO-77',
    'lines[0][name]': 'Торта',
    'lines[0][quantity]': '1',
    'lines[0][unitCode]': 'C62',
    'lines[0][netPrice]': '100.00',
    'lines[0][category]': 'S',
    'lines[0][rate]': '20',
    sendPeppol: 'on',
    ...extra,
  };
}

function hook(body: Record<string, unknown>, opts: { secret?: string; delivery?: string } = {}) {
  return postHook(fake, http.origin, body, {
    secret: opts.secret ?? hookSecret,
    ...(opts.delivery ? { delivery: opts.delivery } : {}),
  });
}

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
  // Peppol — само за фирма, потвърдена от мастъра („Потвърди фирмата“).
  await prisma.organization.update({ where: { id: orgId }, data: { verifiedAt: new Date() } });
  seriesId = (await prisma.documentSeries.findFirstOrThrow({ where: { organizationId: orgId } }))
    .id;
  const master = await prisma.user.create({
    data: { email: 'm@example.test', name: 'М', passwordHash: 'x', platformRole: 'MASTER' },
  });
  http = await startHttp(createServer);
  owner = await http.login('owner@example.test', PASSWORD);
  // Без настройки Peppol е изключен: регистрацията — отказ.
  const off = await http.post(owner, `/app/o/${orgId}/peppol/vklyuchi`, {});
  assert.match(off.headers.get('location') ?? '', /err=notConfigured/);
  await saveIntegration({
    code: 'peppol',
    config: { environment: 'acceptance', clientId: 'fakturist' },
    secrets: { clientSecret: 'client-secret-123456' },
    changed: ['clientSecret'],
    cleared: [],
    actorId: master.id,
  });
  invalidateIntegrations();
  // Преди пускането Peppol е само за пилотните фирми и само в acceptance (src/peppol/settings.ts).
  await prisma.setting.create({ data: { key: 'peppol.pilotOrgIds', value: orgId } });
  invalidateSettings();
});

after(async () => {
  fake.restore();
  await http.close();
  await prisma.$disconnect();
});

test('регистрация: 9926:BG… при точката за достъп, известие с нова тайна, ACTIVE', async () => {
  const page = await (await http.get(owner, `/app/o/${orgId}/peppol`)).text();
  assert.match(page, /9926:BG131063188/);
  const res = await http.post(owner, `/app/o/${orgId}/peppol/vklyuchi`, {});
  assert.match(res.headers.get('location') ?? '', /ok=enrolled/);
  assert.equal(enrolled[0]!.party, '9926:BG131063188');
  assert.match(enrolled[0]!.body.hooks[0]!.action, /\/webhooks\/peppol#[A-Za-z0-9_-]{43}$/);
  hookSecret = hookSecretOf(enrolled[0]!);
  const participant = await prisma.peppolParticipant.findUniqueOrThrow({
    where: { organizationId: orgId },
  });
  assert.equal(participant.status, 'ACTIVE');
  assert.ok(participant.hookSecretEnc && !participant.hookSecretEnc.includes(hookSecret));
});

test('издаване с „Изпрати през Peppol“: Peppol BIS 3 + предаване в същата транзакция; без е-адрес — отказ', async () => {
  const missing = await http.post(owner, `/app/o/${orgId}/nov`, form({ 'buyer[eValue]': '' }));
  assert.equal(missing.status, 400);
  assert.equal(await prisma.document.count({ where: { organizationId: orgId } }), 0);
  const res = await http.post(owner, `/app/o/${orgId}/nov`, form());
  assert.equal(res.status, 303);
  const document = await prisma.document.findFirstOrThrow({ where: { organizationId: orgId } });
  assert.match(document.ublXml ?? '', /urn:fdc:peppol\.eu:2017:poacc:billing:3\.0/);
  assert.match(
    document.ublXml ?? '',
    /<cbc:EndpointID schemeID="9926">BG121604974<\/cbc:EndpointID>/,
  );
  const tx = await prisma.peppolTransmission.findUniqueOrThrow({
    where: { documentId: document.id },
  });
  assert.equal(tx.status, 'QUEUED');
  assert.equal(tx.receiverPartyId, '9926:BG121604974');
  assert.equal(tx.senderPartyId, '9926:BG131063188');
});

test('работникът: качва UBL-а с нашия UUID веднъж; повторно — нищо', async () => {
  const ap = await accessPoint();
  assert.equal(await sendDueTransmissions(ap), 1);
  const tx = await prisma.peppolTransmission.findFirstOrThrow();
  assert.equal(tx.status, 'ACCEPTED');
  assert.equal(sent.length, 1);
  assert.equal(sent[0]!.id, tx.providerDocumentId);
  assert.equal(sent[0]!.party, '9926:BG131063188');
  const document = await prisma.document.findUniqueOrThrow({ where: { id: tx.documentId } });
  assert.equal(sent[0]!.ubl, document.ublXml);
  assert.equal(await sendDueTransmissions(ap), 0);
});

test('известия: подпис, възраст, повторение; „изпратено“ → SENT', async () => {
  const tx = await prisma.peppolTransmission.findFirstOrThrow();
  const event = {
    topic: 'InvoiceSent',
    partyId: '9926:BG131063188',
    documentId: tx.providerDocumentId,
    message: 'Invoice successfully sent',
  };
  assert.equal((await hook(event, { secret: 'wrong-secret' })).status, 401);
  assert.equal(
    (await hook({ ...event, sentOn: new Date(Date.now() - 10 * 60 * 1000).toISOString() })).status,
    401,
    'по-старо от 5 минути',
  );
  assert.equal((await hook(event, { delivery: 'delivery-0001' })).status, 200);
  const done = await prisma.peppolTransmission.findUniqueOrThrow({ where: { id: tx.id } });
  assert.equal(done.status, 'SENT');
  assert.ok(done.sentAt);
  // Закъсняло „нов опит“ не връща изпратеното назад; повторената доставка — нищо.
  assert.equal(
    (await hook({ ...event, topic: 'InvoiceSentRetry' }, { delivery: 'delivery-0002' })).status,
    200,
  );
  assert.equal(
    (await prisma.peppolTransmission.findUniqueOrThrow({ where: { id: tx.id } })).status,
    'SENT',
  );
  // Заловеното тяло, поднесено пак с нов (неподписан) X-EConnect-Delivery — пак „вече видяно“.
  const raw = JSON.stringify({ ...event, sentOn: new Date().toISOString() });
  const events = await prisma.peppolEvent.count();
  assert.equal(
    (await postSignedRaw(fake, http.origin, raw, { secret: hookSecret, delivery: 'replay-0001' }))
      .status,
    200,
  );
  assert.equal(
    (await postSignedRaw(fake, http.origin, raw, { secret: hookSecret, delivery: 'replay-0002' }))
      .status,
    200,
  );
  assert.equal(await prisma.peppolEvent.count(), events + 1);
  const docPage = await (await http.get(owner, `/app/o/${orgId}/d/${tx.documentId}`)).text();
  assert.match(docPage, /доставен/);
});

test('получаване: известие → изтегляне → регистърът (източник Peppol); грешка при изтеглянето — нов опит', async () => {
  fake.state.downloadXml = toUbl(domestic, calculate(domestic), 'en16931', 'подпис');
  fake.state.downloadFails = true;
  const event = {
    topic: 'InvoiceReceived',
    partyId: '9926:BG131063188',
    documentId: 'f3a1c2d4-0000-4000-8000-000000000001',
  };
  assert.equal((await hook(event, { delivery: 'delivery-0100' })).status, 500);
  assert.equal(await prisma.incomingInvoice.count(), 0);
  fake.state.downloadFails = false;
  assert.equal((await hook(event, { delivery: 'delivery-0100' })).status, 200);
  const incoming = await prisma.incomingInvoice.findFirstOrThrow({
    where: { organizationId: orgId },
  });
  assert.equal(incoming.source, 'PEPPOL');
  assert.equal(incoming.number, domestic.number);
  assert.equal(incoming.createdById, null);
  // Същият документ с друга доставка — пак един запис.
  assert.equal((await hook(event, { delivery: 'delivery-0101' })).status, 200);
  assert.equal(await prisma.incomingInvoice.count(), 1);
});

test('изключване: отписване при точката за достъп, тайната се трие', async () => {
  const res = await http.post(owner, `/app/o/${orgId}/peppol/izklyuchi`, {});
  assert.match(res.headers.get('location') ?? '', /ok=disabled/);
  const participant = await prisma.peppolParticipant.findUniqueOrThrow({
    where: { organizationId: orgId },
  });
  assert.equal(participant.status, 'REMOVED');
  assert.equal(participant.hookSecretEnc, null);
  // Без активна регистрация „Изпрати през Peppol“ при издаване е отказ.
  const refused = await http.post(owner, `/app/o/${orgId}/nov`, form());
  assert.equal(refused.status, 400);
});
