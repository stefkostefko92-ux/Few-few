import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { after, before, test } from 'node:test';
import { prepareTestDatabase, truncateAll } from './harness.js';

prepareTestDatabase();
// Без резерва от .env: всичко идва от панела.
delete process.env['REVOLUT_WEBHOOK_SECRET'];
delete process.env['SMTP_HOST'];
const { prisma } = await import('../../src/db.js');
const { register } = await import('../../src/accounts/register.js');
const { seedPlans } = await import('../../src/billing/seed-plans.js');
const { saveIntegration, smtpSettings, revolutSettings } =
  await import('../../src/admin/integrations.js');
const { createTransferInvite, acceptTransferInvite, revokeTransferInvite, TransferError } =
  await import('../../src/accounts/transfer.js');
const { processOutbox } = await import('../../src/mail/outbox.js');
const { createServer } = await import('../../src/server.js');
const { sha256Hex } = await import('../../src/crypto.js');
const { DAY } = await import('../../src/time.js');
type Message = import('../../src/mail/mailer.js').MailMessage;

const BREVO_KEY = 'xsmtpsib-0123456789abcdef0123456789abcdef-AbCd';
const WSK = 'wsk_0123456789abcdefghijklmnop';
const PASSWORD = 'дълга-и-трудна-парола-2026';

const base = {
  password: PASSWORD,
  acceptTerms: 'on' as const,
  addressStreet: 'ул. „Шипка“ 1',
  addressCity: 'София',
  postalCode: '1000',
};

let server: Server;
let origin = '';
let masterId = '';
let firm = { userId: '', organizationId: '' };
let other = { userId: '', organizationId: '' };

/** Фирма, добавена от кантората (без собственик), с действащо пълномощно — както от /klienti/nov. */
async function managedCompany(eik: string, legalName: string): Promise<string> {
  const org = await prisma.organization.create({
    data: {
      kind: 'COMPANY',
      legalName,
      eik,
      addressStreet: 'ул. „Раковски“ 2',
      addressCity: 'София',
      postalCode: '1000',
    },
  });
  await prisma.documentSeries.create({
    data: {
      organizationId: org.id,
      name: 'Основна',
      rangeStart: 1n,
      rangeEnd: 9_999_999_999n,
      nextNumber: 1n,
      isDefault: true,
    },
  });
  await prisma.clientMandate.create({
    data: {
      firmId: firm.organizationId,
      clientId: org.id,
      status: 'ACTIVE',
      documentRef: 'Пълномощно № 1/01.11.2026',
      validFrom: new Date('2026-11-01T00:00:00Z'),
    },
  });
  return org.id;
}

before(async () => {
  await truncateAll(prisma);
  await prisma.$transaction((tx) => seedPlans(tx));
  masterId = (
    await prisma.user.create({
      data: {
        email: 'master@example.test',
        name: 'Мастър',
        passwordHash: 'x',
        platformRole: 'MASTER',
      },
    })
  ).id;
  firm = await register({
    ...base,
    kind: 'accountant',
    name: 'Цвета Колева',
    email: 'firm@example.test',
    legalName: 'Кантора ООД',
    eik: '121604974',
  });
  other = await register({
    ...base,
    kind: 'company',
    name: 'Емил Стоянов',
    email: 'exists@example.test',
    legalName: 'Съществуваща ЕООД',
    eik: '200000002',
  });
  server = createServer().listen(0, '127.0.0.1');
  await new Promise<void>((resolve) => server.once('listening', resolve));
  origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

after(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
  await prisma.$disconnect();
});

test('интеграциите от панела: тайната е шифрована, пощата чете оттам, одитът е без стойности', async () => {
  await saveIntegration({
    code: 'smtp',
    config: {
      host: 'smtp-relay.brevo.com',
      port: 2525,
      secure: false,
      user: 'login@smtp-brevo.test',
      from: 'Фактурист <no-reply@fakturist.eu>',
    },
    secrets: { pass: BREVO_KEY },
    changed: ['pass'],
    cleared: [],
    actorId: masterId,
  });
  const row = await prisma.integration.findUniqueOrThrow({ where: { code: 'smtp' } });
  assert.ok(row.secretsEnc && !row.secretsEnc.includes(BREVO_KEY));
  assert.ok(!JSON.stringify(row.config).includes(BREVO_KEY));
  assert.deepEqual(row.secretHints, { pass: '…AbCd' });
  const smtp = await smtpSettings();
  assert.equal(smtp?.source, 'panel');
  assert.equal(smtp?.pass, BREVO_KEY);
  const log = await prisma.auditLog.findFirstOrThrow({
    where: { action: 'admin.integration.saved' },
  });
  assert.ok(!JSON.stringify(log.details).includes(BREVO_KEY));
  assert.deepEqual(log.details, { code: 'smtp', changed: ['pass'], cleared: [] });
});

test('webhook на Revolut проверява подписа с тайната от панела', async () => {
  await saveIntegration({
    code: 'revolut',
    config: { environment: 'sandbox' },
    secrets: { webhookSecret: WSK },
    changed: ['webhookSecret'],
    cleared: [],
    actorId: masterId,
  });
  assert.equal((await revolutSettings()).webhookSecret, WSK);
  const body = JSON.stringify({ event: 'ORDER_AUTHORISED', order_id: 'ord-panel-1' });
  const send = (secret: string) => {
    const timestamp = String(Date.now());
    const signature = createHmac('sha256', secret).update(`v1.${timestamp}.${body}`).digest('hex');
    return fetch(`${origin}/webhooks/revolut`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'revolut-request-timestamp': timestamp,
        'revolut-signature': `v1=${signature}`,
      },
      body,
    });
  };
  assert.equal((await send('wsk_wrong_secret_value_123')).status, 401);
  assert.equal((await send(WSK)).status, 200);
});

test('покана: само за фирма без собственик; в базата е хешът; нова отменя старата', async () => {
  const clientId = await managedCompany('131063188', 'Клиент Едно ЕООД');
  await assert.rejects(
    createTransferInvite({
      organizationId: firm.organizationId,
      email: 'x@example.test',
      actorId: masterId,
    }),
    (error: unknown) => error instanceof TransferError && error.code === 'hasOwner',
  );
  const first = await createTransferInvite({
    organizationId: clientId,
    email: '  Owner@Example.TEST ',
    actorId: masterId,
  });
  const row = await prisma.transferInvite.findUniqueOrThrow({ where: { id: first.inviteId } });
  assert.equal(row.email, 'owner@example.test');
  assert.equal(row.tokenHash, sha256Hex(first.token));
  assert.ok(!JSON.stringify(row).includes(first.token));
  const ttl = row.expiresAt.getTime() - row.createdAt.getTime();
  assert.ok(Math.abs(ttl - 7 * DAY) < 60_000);
  const queued = await prisma.notification.findFirstOrThrow({
    where: { kind: 'transfer.invite', organizationId: clientId },
  });
  assert.ok(!JSON.stringify(queued.payload).includes(first.token));

  const second = await createTransferInvite({
    organizationId: clientId,
    email: 'owner@example.test',
    actorId: masterId,
  });
  const old = await prisma.transferInvite.findUniqueOrThrow({ where: { id: first.inviteId } });
  assert.ok(old.revokedAt);
  // Писмото на отменената покана не тръгва; новото носи връзката.
  const sent: Message[] = [];
  await processOutbox(async (message) => {
    sent.push(message);
  });
  const invites = sent.filter((m) => m.text.includes('/pokana/'));
  assert.equal(invites.length, 1);
  assert.equal(invites[0]!.to, 'owner@example.test');
  assert.ok(invites[0]!.text.includes(`/pokana/${second.token}`));
  assert.ok(!invites[0]!.text.includes(first.token));
  const log = await prisma.auditLog.findFirstOrThrow({
    where: { action: 'organization.transfer.invited', targetId: second.inviteId },
  });
  assert.ok(!JSON.stringify(log.details ?? {}).includes('owner@example.test'));
});

test('приемане през връзката: нов профил → собственик, безплатен план, пълномощното остава', async () => {
  const clientId = await managedCompany('200000015', 'Клиент Две ООД');
  const { token, inviteId } = await createTransferInvite({
    organizationId: clientId,
    email: 'new-owner@example.test',
    actorId: masterId,
  });
  const page = await fetch(`${origin}/pokana/${token}`);
  assert.equal(page.status, 200);
  const html = await page.text();
  assert.ok(html.includes('Клиент Две ООД'));
  assert.ok(html.includes('new-owner@example.test'));

  const accepted = await fetch(`${origin}/pokana/${token}`, {
    method: 'POST',
    redirect: 'manual',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ name: 'Нов Собственик', password: PASSWORD, acceptTerms: 'on' }),
  });
  assert.equal(accepted.status, 303);
  assert.equal(accepted.headers.get('location'), `/app/o/${clientId}`);
  assert.ok(accepted.headers.get('set-cookie')?.includes('fakturist_sid='));

  const user = await prisma.user.findUniqueOrThrow({
    where: { email: 'new-owner@example.test' },
    include: { memberships: true },
  });
  assert.ok(user.emailVerifiedAt);
  assert.deepEqual(
    user.memberships.map((m) => [m.organizationId, m.role]),
    [[clientId, 'OWNER']],
  );
  const subscription = await prisma.subscription.findFirstOrThrow({
    where: { organizationId: clientId },
  });
  assert.equal(subscription.planCode, 'free');
  const mandate = await prisma.clientMandate.findFirstOrThrow({ where: { clientId } });
  assert.equal(mandate.status, 'ACTIVE');
  const invite = await prisma.transferInvite.findUniqueOrThrow({ where: { id: inviteId } });
  assert.equal(invite.acceptedById, user.id);

  // Използвана връзка не отваря нищо; фирмата вече има собственик.
  assert.equal((await fetch(`${origin}/pokana/${token}`)).status, 404);
  await assert.rejects(
    createTransferInvite({ organizationId: clientId, email: 'y@example.test', actorId: masterId }),
    (error: unknown) => error instanceof TransferError && error.code === 'hasOwner',
  );
});

test('отказ: отменена, изтекла, чужд имейл, съществуващ профил без вход; двойно приемане', async () => {
  const clientId = await managedCompany('200000027', 'Клиент Три АД');
  const newUser = { name: 'Някой Друг', password: PASSWORD };
  const isCode = (code: string) => (error: unknown) =>
    error instanceof TransferError && error.code === code;

  const revoked = await createTransferInvite({
    organizationId: clientId,
    email: 'exists@example.test',
    actorId: masterId,
  });
  await revokeTransferInvite({ inviteId: revoked.inviteId, actorId: masterId });
  await assert.rejects(
    acceptTransferInvite({ token: revoked.token, user: { userId: other.userId } }),
    isCode('invalid'),
  );

  const expiring = await createTransferInvite({
    organizationId: clientId,
    email: 'exists@example.test',
    actorId: masterId,
  });
  await assert.rejects(
    acceptTransferInvite({
      token: expiring.token,
      user: { userId: other.userId },
      now: new Date(Date.now() + 8 * DAY),
    }),
    isCode('invalid'),
  );
  await assert.rejects(
    acceptTransferInvite({ token: expiring.token, user: newUser }),
    isCode('loginRequired'),
  );
  await assert.rejects(
    acceptTransferInvite({ token: expiring.token, user: { userId: firm.userId } }),
    isCode('wrongEmail'),
  );
  await assert.rejects(
    acceptTransferInvite({ token: 'не-е-токен', user: { userId: other.userId } }),
    isCode('invalid'),
  );

  const results = await Promise.allSettled([
    acceptTransferInvite({ token: expiring.token, user: { userId: other.userId } }),
    acceptTransferInvite({ token: expiring.token, user: { userId: other.userId } }),
  ]);
  assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1);
  const owners = await prisma.membership.count({
    where: { organizationId: clientId, role: 'OWNER' },
  });
  assert.equal(owners, 1);
});
