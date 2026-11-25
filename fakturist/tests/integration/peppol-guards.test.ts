import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { prepareTestDatabase, truncateAll } from './harness.js';
import { startHttp, type HttpClient, type Session } from './http.js';
import { hookSecretOf, installFakeEConnect, postHook } from './peppol-fake.js';

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
const { enrollOrganization, PeppolError } = await import('../../src/peppol/participants.js');
const { decryptPeppolHookSecret } = await import('../../src/auth/keys.js');
const { sofiaToday, MINUTE } = await import('../../src/time.js');

/**
 * Регресии по ревюто на Peppol (Кодаджията, 13.11.2026): регистрация само на потвърдена фирма; едно
 * „Включи“ наведнъж и никога върху действаща регистрация; тайната на известията не стига до екрана;
 * работникът не презаписва известие, дошло докато заявката тече; известие за чужд документ не пипа нищо;
 * едновременно „Изпрати“ не дава 500.
 */
const PASSWORD = 'дълга-и-трудна-парола-2026';
const PARTY_A = '9926:BG200000015';
const PARTY_B = '9926:BG200000027';
let http: HttpClient;
let owner: Session;
let orgA = '';
let orgB = '';
let ownerB = '';
let seriesId = '';
const today = sofiaToday();
const fake = installFakeEConnect();

async function company(eik: string, email: string, legalName: string) {
  return register({
    kind: 'company',
    name: 'Мария Иванова',
    email,
    password: PASSWORD,
    acceptTerms: 'on',
    legalName,
    eik,
    vatNumber: `BG${eik}`,
    addressStreet: 'ул. „Витоша“ 5',
    addressCity: 'София',
    postalCode: '1000',
  });
}

function form(): Record<string, string> {
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
    buyerReference: 'PO-1',
    'lines[0][name]': 'Консултация',
    'lines[0][quantity]': '1',
    'lines[0][unitCode]': 'C62',
    'lines[0][netPrice]': '50.00',
    'lines[0][category]': 'S',
    'lines[0][rate]': '20',
    sendPeppol: 'on',
  };
}

async function storedSecret(organizationId: string): Promise<string> {
  const participant = await prisma.peppolParticipant.findUniqueOrThrow({
    where: { organizationId },
  });
  return decryptPeppolHookSecret(participant.hookSecretEnc!, organizationId);
}

/** Издава документ с „Изпрати през Peppol“ и връща предаването му. */
async function issuePeppolDocument() {
  const before = await prisma.document.count({ where: { organizationId: orgA } });
  const res = await http.post(owner, `/app/o/${orgA}/nov`, form());
  assert.equal(res.status, 303);
  const document = await prisma.document.findFirstOrThrow({
    where: { organizationId: orgA },
    orderBy: { createdAt: 'desc' },
  });
  assert.equal(await prisma.document.count({ where: { organizationId: orgA } }), before + 1);
  return prisma.peppolTransmission.findUniqueOrThrow({ where: { documentId: document.id } });
}

before(async () => {
  await truncateAll(prisma);
  await prisma.$transaction((tx) => seedPlans(tx));
  orgA = (await company('200000015', 'a@example.test', 'Ателие Арка ЕООД')).organizationId;
  const b = await company('200000027', 'b@example.test', 'Бистро Бриз ООД');
  orgB = b.organizationId;
  ownerB = b.userId;
  seriesId = (await prisma.documentSeries.findFirstOrThrow({ where: { organizationId: orgA } })).id;
  const master = await prisma.user.create({
    data: { email: 'm@example.test', name: 'М', passwordHash: 'x', platformRole: 'MASTER' },
  });
  await saveIntegration({
    code: 'peppol',
    config: { environment: 'acceptance', clientId: 'fakturist' },
    secrets: { clientSecret: 'client-secret-123456' },
    changed: ['clientSecret'],
    cleared: [],
    actorId: master.id,
  });
  invalidateIntegrations();
  http = await startHttp(createServer);
  owner = await http.login('a@example.test', PASSWORD);
});

after(async () => {
  fake.restore();
  await http.close();
  await prisma.$disconnect();
});

async function setPilots(value: string) {
  await prisma.setting.upsert({
    where: { key: 'peppol.pilotOrgIds' },
    create: { key: 'peppol.pilotOrgIds', value },
    update: { value },
  });
  invalidateSettings();
}

test('преди пускането: само пилотна фирма и само в acceptance — иначе нищо не тръгва към доставчика', async () => {
  await prisma.organization.update({ where: { id: orgA }, data: { verifiedAt: new Date() } });
  const refused = await http.post(owner, `/app/o/${orgA}/peppol/vklyuchi`, {});
  assert.match(refused.headers.get('location') ?? '', /err=notAvailable/);
  const page = await (await http.get(owner, `/app/o/${orgA}/peppol`)).text();
  assert.match(page, /предстои/);
  assert.doesNotMatch(page, /peppol\/vklyuchi/);
  // Пилот, но в продукционната среда — пак не (реалните данни чакат новия договор за обработване).
  await setPilots(`${orgA},${orgB}`);
  await saveIntegration({
    code: 'peppol',
    config: { environment: 'production', clientId: 'fakturist' },
    secrets: { clientSecret: 'client-secret-123456' },
    changed: [],
    cleared: [],
    actorId: (await prisma.user.findFirstOrThrow({ where: { platformRole: 'MASTER' } })).id,
  });
  invalidateIntegrations();
  const production = await http.post(owner, `/app/o/${orgA}/peppol/vklyuchi`, {});
  assert.match(production.headers.get('location') ?? '', /err=notAvailable/);
  await saveIntegration({
    code: 'peppol',
    config: { environment: 'acceptance', clientId: 'fakturist' },
    secrets: { clientSecret: 'client-secret-123456' },
    changed: [],
    cleared: [],
    actorId: (await prisma.user.findFirstOrThrow({ where: { platformRole: 'MASTER' } })).id,
  });
  invalidateIntegrations();
  assert.equal(fake.enrolled.length + fake.rejectedEnrolls.length, 0);
  await prisma.organization.update({ where: { id: orgA }, data: { verifiedAt: null } });
});

test('непотвърдена фирма не се регистрира в Peppol (адресът е от самодекларирания ДДС номер)', async () => {
  const res = await http.post(owner, `/app/o/${orgA}/peppol/vklyuchi`, {});
  assert.match(res.headers.get('location') ?? '', /err=notVerified/);
  assert.equal(fake.enrolled.length + fake.rejectedEnrolls.length, 0);
  assert.equal(await prisma.peppolParticipant.count(), 0);
  const page = await (await http.get(owner, `/app/o/${orgA}/peppol`)).text();
  assert.match(page, /след потвърждение на фирмата/);
  assert.doesNotMatch(page, /peppol\/vklyuchi/);
});

test('грешка от доставчика, която повтаря адреса на известието: тайната не стига до базата и екрана', async () => {
  await prisma.organization.update({ where: { id: orgA }, data: { verifiedAt: new Date() } });
  fake.state.enrollMode = 'echo';
  const res = await http
    .post(owner, `/app/o/${orgA}/peppol/vklyuchi`, {})
    .finally(() => (fake.state.enrollMode = 'ok'));
  assert.match(res.headers.get('location') ?? '', /err=provider/);
  const secret = hookSecretOf(fake.rejectedEnrolls[0]!);
  const participant = await prisma.peppolParticipant.findUniqueOrThrow({
    where: { organizationId: orgA },
  });
  assert.equal(participant.status, 'FAILED');
  assert.ok(participant.lastError?.includes('[тайна]'));
  assert.ok(!participant.lastError?.includes(secret));
  const page = await (await http.get(owner, `/app/o/${orgA}/peppol`)).text();
  assert.ok(!page.includes(secret));
});

test('двоен клик на „Включи“: една регистрация, тайната в базата е тази при доставчика; при действаща — отказ', async () => {
  fake.state.enrollDelayMs = 150;
  const [first, second] = await Promise.all([
    http.post(owner, `/app/o/${orgA}/peppol/vklyuchi`, {}),
    http.post(owner, `/app/o/${orgA}/peppol/vklyuchi`, {}),
  ]);
  fake.state.enrollDelayMs = 0;
  const outcomes = [first, second].map((r) => r.headers.get('location') ?? '').sort();
  assert.match(outcomes[0]!, /err=busy/);
  assert.match(outcomes[1]!, /ok=enrolled/);
  assert.equal(fake.enrolled.length, 1);
  assert.equal(await storedSecret(orgA), hookSecretOf(fake.enrolled[0]!));
  const participant = await prisma.peppolParticipant.findUniqueOrThrow({
    where: { organizationId: orgA },
  });
  assert.equal(participant.status, 'ACTIVE');

  const again = await http.post(owner, `/app/o/${orgA}/peppol/vklyuchi`, {});
  assert.match(again.headers.get('location') ?? '', /err=alreadyActive/);
  assert.equal(fake.enrolled.length, 1);
  const unchanged = await prisma.peppolParticipant.findUniqueOrThrow({
    where: { organizationId: orgA },
  });
  assert.equal(unchanged.hookSecretEnc, participant.hookSecretEnc);
});

test('прекъсната регистрация (PENDING) се поема след 5 минути, не по-рано', async () => {
  await prisma.organization.update({ where: { id: orgB }, data: { verifiedAt: new Date() } });
  await prisma.peppolParticipant.create({
    data: { organizationId: orgB, partyId: PARTY_B, status: 'PENDING' },
  });
  const access = { organizationId: orgB, role: 'OWNER' as const, viaFirmId: null, mandateId: null };
  const ap = await accessPoint();
  await assert.rejects(
    enrollOrganization(access, ownerB, ap),
    (error: unknown) => error instanceof PeppolError && error.code === 'busy',
  );
  const later = new Date(Date.now() + 6 * MINUTE);
  assert.equal(await enrollOrganization(access, ownerB, ap, later), 'ACTIVE');
  assert.equal(fake.enrolled.at(-1)!.party, PARTY_B);
});

test('работникът не презаписва известие, дошло докато заявката тече (успех и временна грешка)', async () => {
  const secretA = await storedSecret(orgA);
  const ap = await accessPoint();
  const markSent = async (documentId: string) => {
    const res = await postHook(
      fake,
      http.origin,
      { topic: 'InvoiceSent', partyId: PARTY_A, documentId },
      { secret: secretA, delivery: `sent-${documentId}` },
    );
    assert.equal(res.status, 200);
  };

  const ok = await issuePeppolDocument();
  fake.state.onSend = markSent;
  await sendDueTransmissions(ap);
  assert.equal(
    (await prisma.peppolTransmission.findUniqueOrThrow({ where: { id: ok.id } })).status,
    'SENT',
  );

  const timedOut = await issuePeppolDocument();
  fake.state.sendStatus = 503;
  await sendDueTransmissions(ap);
  fake.state.onSend = null;
  fake.state.sendStatus = null;
  const row = await prisma.peppolTransmission.findUniqueOrThrow({ where: { id: timedOut.id } });
  assert.equal(row.status, 'SENT');
  assert.ok(row.sentAt);
});

test('известие с валиден подпис на друга фирма не пипа чуждо изпращане', async () => {
  const victim = await issuePeppolDocument();
  const res = await postHook(
    fake,
    http.origin,
    {
      topic: 'InvoiceSentError',
      partyId: PARTY_B,
      documentId: victim.providerDocumentId,
      message: 'подправено',
    },
    { secret: await storedSecret(orgB), delivery: 'forged-0001' },
  );
  assert.equal(res.status, 200);
  const row = await prisma.peppolTransmission.findUniqueOrThrow({ where: { id: victim.id } });
  assert.equal(row.status, 'QUEUED');
  assert.equal(row.lastError, null);
  assert.equal(
    await prisma.auditLog.count({
      where: { organizationId: orgA, action: 'peppol.InvoiceSentError' },
    }),
    0,
  );
});

test('едновременно „Изпрати през Peppol“ за един документ: едно предаване, без 500', async () => {
  const queued = await issuePeppolDocument();
  await prisma.peppolTransmission.delete({ where: { id: queued.id } });
  const url = `/app/o/${orgA}/d/${queued.documentId}/peppol`;
  const results = await Promise.all([http.post(owner, url, {}), http.post(owner, url, {})]);
  for (const res of results) assert.equal(res.status, 303);
  const outcomes = results.map((r) => r.headers.get('location') ?? '').sort();
  assert.match(outcomes[0]!, /peppol=already/);
  assert.match(outcomes[1]!, /peppol=queued/);
  assert.equal(
    await prisma.peppolTransmission.count({ where: { documentId: queued.documentId } }),
    1,
  );
});
