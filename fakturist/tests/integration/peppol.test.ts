import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { after, before, test } from 'node:test';
import { prepareTestDatabase, truncateAll } from './harness.js';
import { startHttp, type HttpClient, type Session } from './http.js';

prepareTestDatabase();
delete process.env['SMTP_HOST'];
const { prisma } = await import('../../src/db.js');
const { register } = await import('../../src/accounts/register.js');
const { seedPlans } = await import('../../src/billing/seed-plans.js');
const { createServer } = await import('../../src/server.js');
const { saveIntegration, invalidateIntegrations } = await import('../../src/admin/integrations.js');
const { accessPoint } = await import('../../src/peppol/settings.js');
const { sendDueTransmissions } = await import('../../src/peppol/transmissions.js');
const { calculate, toUbl } = await import('../../src/einvoice/index.js');
const { domestic } = await import('../fixtures/einvoice-samples.js');
const { sofiaToday } = await import('../../src/time.js');

/**
 * SPEC 57–59: регистрация на фирмата при точката за достъп, издаване по Peppol BIS 3 с предаване в
 * същата транзакция, работникът, известията (подпис, възраст, повторение) и получаването в регистъра.
 * eConnect е фалшив сървър по документацията им.
 */
const PASSWORD = 'дълга-и-трудна-парола-2026';
const API = 'https://accp-psb.econnect.eu';
const IDENTITY = 'https://accp-identity.econnect.eu';
let http: HttpClient;
let owner: Session;
let orgId = '';
let seriesId = '';
let hookSecret = '';
const today = sofiaToday();

const sent: Array<{ party: string; id: string; ubl: string }> = [];
const enrolled: Array<{ party: string; body: { hooks: Array<{ action: string }> } }> = [];
let downloadXml = '';
let downloadFails = false;
const realFetch = globalThis.fetch;
globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
  if (url === `${IDENTITY}/connect/token`) {
    return Response.json({ access_token: 'tok', expires_in: 3600 });
  }
  if (!url.startsWith(API)) return realFetch(input, init);
  const path = decodeURIComponent(url.slice(API.length));
  const enroll = /^\/api\/v1-beta\/([^/]+)\/enroll$/.exec(path);
  if (enroll && init?.method === 'PUT') {
    enrolled.push({ party: enroll[1]!, body: JSON.parse(String(init.body)) });
    return new Response(null, { status: 200 });
  }
  const send = /^\/api\/v1\/([^/]+)\/salesInvoice\/send$/.exec(path);
  if (send) {
    const id = (init?.headers as Record<string, string>)['X-EConnect-DocumentId']!;
    if (sent.some((s) => s.id === id)) return new Response(null, { status: 409 });
    sent.push({ party: send[1]!, id, ubl: String(init?.body) });
    return Response.json({ id });
  }
  const download = /^\/api\/v1\/([^/]+)\/purchaseInvoice\/([^/]+)\/download$/.exec(path);
  if (download) {
    if (downloadFails) return new Response(null, { status: 503 });
    return new Response(downloadXml, {
      status: 200,
      headers: { 'content-type': 'application/xml' },
    });
  }
  return new Response(null, { status: 404 });
}) as typeof fetch;

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

async function hook(
  body: Record<string, unknown>,
  opts: { secret?: string; delivery?: string } = {},
) {
  const raw = JSON.stringify({ sentOn: new Date().toISOString(), ...body });
  const signature = createHmac('sha256', opts.secret ?? hookSecret)
    .update(raw)
    .digest('hex');
  return realFetch(`${http.origin}/webhooks/peppol`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-econnect-signature': `sha256=${signature}`,
      ...(opts.delivery ? { 'x-econnect-delivery': opts.delivery } : {}),
    },
    body: raw,
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
});

after(async () => {
  globalThis.fetch = realFetch;
  await http.close();
  await prisma.$disconnect();
});

test('регистрация: 9926:BG… при точката за достъп, известие с нова тайна, ACTIVE', async () => {
  const page = await (await http.get(owner, `/app/o/${orgId}/peppol`)).text();
  assert.match(page, /9926:BG131063188/);
  const res = await http.post(owner, `/app/o/${orgId}/peppol/vklyuchi`, {});
  assert.match(res.headers.get('location') ?? '', /ok=enrolled/);
  assert.equal(enrolled[0]!.party, '9926:BG131063188');
  const action = enrolled[0]!.body.hooks[0]!.action;
  assert.match(action, /\/webhooks\/peppol#[A-Za-z0-9_-]{43}$/);
  hookSecret = action.split('#')[1]!;
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
  assert.equal((await hook(event, { delivery: 'delivery-0001' })).status, 200);
  assert.equal(await prisma.peppolEvent.count({ where: { deliveryId: 'delivery-0001' } }), 1);
  const docPage = await (await http.get(owner, `/app/o/${orgId}/d/${tx.documentId}`)).text();
  assert.match(docPage, /доставен/);
});

test('получаване: известие → изтегляне → регистърът (източник Peppol); грешка при изтеглянето — нов опит', async () => {
  downloadXml = toUbl(domestic, calculate(domestic), 'en16931', 'подпис');
  downloadFails = true;
  const event = {
    topic: 'InvoiceReceived',
    partyId: '9926:BG131063188',
    documentId: 'f3a1c2d4-0000-4000-8000-000000000001',
  };
  assert.equal((await hook(event, { delivery: 'delivery-0100' })).status, 500);
  assert.equal(await prisma.incomingInvoice.count(), 0);
  downloadFails = false;
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
