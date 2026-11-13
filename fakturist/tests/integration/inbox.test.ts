import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { prepareTestDatabase, truncateAll } from './harness.js';

prepareTestDatabase();
const { prisma } = await import('../../src/db.js');
const { register, RegistrationError } = await import('../../src/accounts/register.js');
const { issueDocument } = await import('../../src/documents/issue.js');
const { seedPlans } = await import('../../src/billing/seed-plans.js');
const { processOutbox } = await import('../../src/mail/outbox.js');
const { decideMandate } = await import('../../src/accounts/mandates.js');
const { domestic } = await import('../fixtures/einvoice-samples.js');
type Message = import('../../src/mail/mailer.js').MailMessage;

const base = {
  kind: 'company' as const,
  password: 'дълга-и-трудна-парола-2026',
  acceptTerms: 'on' as const,
  addressStreet: 'ул. „Шипка“ 1',
  addressCity: 'София',
  postalCode: '1000',
};
let a = { userId: '', organizationId: '' };
let b = { userId: '', organizationId: '' };
let c = { userId: '', organizationId: '' };

before(async () => {
  await truncateAll(prisma);
  await prisma.$transaction((tx) => seedPlans(tx));
  a = await register({
    ...base,
    name: 'Анна Петрова',
    email: 'a@example.test',
    legalName: 'Изпращач ЕООД',
    eik: '208725180',
    vatNumber: 'BG208725180',
  });
  b = await register({
    ...base,
    name: 'Борис Иванов',
    email: 'b@example.test',
    legalName: 'Получател АД',
    eik: '131063188',
    vatNumber: 'BG131063188',
  });
  c = await register({
    ...base,
    kind: 'accountant',
    name: 'Цвета Колева',
    email: 'c@example.test',
    legalName: 'Кантора ООД',
    eik: '121604974',
  });
});

after(async () => {
  await prisma.$disconnect();
});

async function issueFromA() {
  const series = await prisma.documentSeries.findFirstOrThrow({
    where: { organizationId: a.organizationId },
  });
  const { number: _n, seller: _s, ...rest } = domestic;
  return issueDocument(
    { organizationId: a.organizationId, role: 'OWNER', viaFirmId: null, mandateId: null },
    a.userId,
    {
      ...rest,
      seriesId: series.id,
    },
  );
}

test('фактура към регистрирана фирма отива в шкафчето ѝ и в опашката за писма — в същата транзакция', async () => {
  const issued = await issueFromA();
  assert.ok(issued.delivery, 'няма доставка');
  assert.equal(issued.delivery.recipientOrgId, b.organizationId);
  const entries = await prisma.inboxEntry.findMany();
  assert.equal(entries.length, 1);
  assert.equal(entries[0]!.recipientOrgId, b.organizationId);
  const queued = await prisma.notification.findMany({ where: { status: 'PENDING' } });
  assert.deepEqual(
    queued.map((n) => n.toEmail),
    ['b@example.test'],
  );
});

test('опашката праща писмо с изпращача, PDF и UBL XML; без поща писмото чака', async () => {
  assert.deepEqual(await processOutbox(null), { sent: 0, failed: 0 });
  const sent: Message[] = [];
  const result = await processOutbox(async (message) => {
    sent.push(message);
  });
  assert.deepEqual(result, { sent: 1, failed: 0 });
  const mail = sent[0]!;
  assert.equal(mail.to, 'b@example.test');
  assert.ok(mail.subject.includes('Изпращач ЕООД'));
  assert.ok(mail.text.includes('fakturist.eu'));
  assert.deepEqual(
    mail.attachments.map((x) => x.contentType),
    ['application/pdf', 'application/xml'],
  );
  assert.equal((mail.attachments[0]!.content as Buffer).subarray(0, 5).toString(), '%PDF-');
  assert.ok(String(mail.attachments[1]!.content).includes('<cbc:ID>0000000001</cbc:ID>'));
  assert.equal((await prisma.notification.findFirstOrThrow()).status, 'SENT');
  assert.deepEqual(
    await processOutbox(async () => undefined),
    { sent: 0, failed: 0 },
    'не праща два пъти',
  );
});

test('провалено писмо остава в опашката с пауза; след 6 опита е FAILED', async () => {
  await issueFromA();
  const failing = async () => {
    throw new Error('SMTP 451 за b@example.test');
  };
  let now = new Date();
  for (let i = 0; i < 6; i += 1) {
    await processOutbox(failing, now);
    now = new Date(now.getTime() + 5 * 60 * 60 * 1000);
  }
  const failed = await prisma.notification.findFirstOrThrow({ where: { status: 'FAILED' } });
  assert.equal(failed.attempts, 6);
  assert.equal(failed.lastError?.includes('@'), false, 'адресът не стига до записа на грешката');
});

test('фактура към нерегистрирана фирма или към себе си не отива в шкафче', async () => {
  const series = await prisma.documentSeries.findFirstOrThrow({
    where: { organizationId: a.organizationId },
  });
  const { number: _n, seller: _s, ...rest } = domestic;
  const toSelf = await issueDocument(
    { organizationId: a.organizationId, role: 'OWNER', viaFirmId: null, mandateId: null },
    a.userId,
    {
      ...rest,
      seriesId: series.id,
      buyer: { ...rest.buyer, legalId: '208725180', vatId: 'BG208725180' },
    },
  );
  assert.equal(toSelf.delivery, null);
});

test('кантора: пълномощното за нова фирма чака мастъра; фирмата не може да бъде „взета“ с регистрация', async () => {
  const client = await prisma.organization.create({
    data: {
      kind: 'COMPANY',
      legalName: 'Клиент ЕООД',
      eik: '175074752',
      addressStreet: 'ул. 1',
      addressCity: 'Варна',
      postalCode: '9000',
    },
  });
  const mandate = await prisma.clientMandate.create({
    data: {
      firmId: c.organizationId,
      clientId: client.id,
      status: 'PENDING',
      documentRef: 'Пълномощно № 3',
      validFrom: new Date('2026-11-01'),
    },
  });
  await assert.rejects(
    () =>
      register({
        ...base,
        name: 'Друг Човек',
        email: 'x@example.test',
        legalName: 'Клиент ЕООД',
        eik: '175074752',
      }),
    (error: unknown) => error instanceof RegistrationError && error.code === 'companyManaged',
  );
  const master = await prisma.user.create({
    data: { email: 'm@example.test', name: 'Мастър', passwordHash: 'x', platformRole: 'MASTER' },
  });
  await decideMandate({
    mandateId: mandate.id,
    actorId: master.id,
    decision: 'approve',
    clientOrgId: null,
  });
  assert.equal(
    (await prisma.clientMandate.findUniqueOrThrow({ where: { id: mandate.id } })).status,
    'ACTIVE',
  );
  assert.ok((await prisma.organization.findUniqueOrThrow({ where: { id: client.id } })).verifiedAt);
  await assert.rejects(() =>
    decideMandate({
      mandateId: mandate.id,
      actorId: master.id,
      decision: 'approve',
      clientOrgId: null,
    }),
  );
  // Собственик на друга фирма не може да реши чуждо пълномощно.
  await assert.rejects(() =>
    decideMandate({
      mandateId: mandate.id,
      actorId: b.userId,
      decision: 'revoke',
      clientOrgId: b.organizationId,
    }),
  );
});
