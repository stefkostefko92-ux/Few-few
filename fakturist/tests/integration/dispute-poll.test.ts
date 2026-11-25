import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { prepareTestDatabase, truncateAll } from './harness.js';

prepareTestDatabase();
delete process.env['SMTP_HOST'];
const { prisma } = await import('../../src/db.js');
const { saveIntegration } = await import('../../src/admin/integrations.js');
const { pollOpenDisputes } = await import('../../src/billing/dispute-poll.js');
const { DISPUTE_AUDIT_ACTION } = await import('../../src/billing/disputes.js');

/**
 * Изгубен уебхук `DISPUTE_*` (Продавача, 25.11.2026): работникът пита Revolut за откритите спорове и записва
 * новите (одит + писмо до мастърите); вече записаните не чете пак; в sandbox — нищо.
 */
const PROD = 'https://merchant.revolut.com';
const NEW_ID = '0d9e8f7a-1111-4222-8333-944455556666';
const KNOWN_ID = '1a2b3c4d-1111-4222-8333-944455556666';
const listed: string[] = [];
const reads: string[] = [];

const fakeFetch = (async (input: string | URL | Request) => {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
  assert.ok(url.startsWith(PROD), url);
  const path = url.slice(PROD.length);
  if (path.startsWith('/api/disputes?')) {
    listed.push(path);
    return Response.json([
      { id: NEW_ID, state: 'needs_response' },
      { id: KNOWN_ID, state: 'needs_response' },
      { id: '../bad', state: 'needs_response' },
    ]);
  }
  const one = /^\/api\/disputes\/([A-Za-z0-9-]+)$/.exec(path);
  if (one) {
    reads.push(one[1]!);
    return Response.json({
      id: one[1],
      state: 'needs_response',
      amount: 1200,
      currency: 'EUR',
      response_due_date: '2026-12-05T00:00:00Z',
      updated_at: '2026-11-24T08:00:00Z',
    });
  }
  return new Response(null, { status: 404 });
}) as typeof fetch;

let masterId = '';

before(async () => {
  await truncateAll(prisma);
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
  await prisma.$transaction(async (tx) => {
    const { audit } = await import('../../src/audit.js');
    await audit(tx, {
      actorId: null,
      action: DISPUTE_AUDIT_ACTION,
      targetType: 'RevolutDispute',
      targetId: KNOWN_ID,
      details: { state: 'needs_response', event: 'DISPUTE_ACTION_REQUIRED' },
    });
  });
});

after(async () => {
  await prisma.$disconnect();
});

const configure = (environment: 'sandbox' | 'production') =>
  saveIntegration({
    code: 'revolut',
    config: { environment },
    secrets: {
      secretKey: 'sk_live_poll_test_key_00000000',
      webhookSecret: 'wsk_poll_test_secret_0000',
    },
    changed: ['secretKey', 'webhookSecret'],
    cleared: [],
    actorId: masterId,
  });

test('в sandbox — без заявки към Revolut', async () => {
  await configure('sandbox');
  assert.equal(await pollOpenDisputes(fakeFetch), 0);
  assert.equal(listed.length, 0);
});

test('в продукция: новият открит спор се записва и стига до мастъра; записаният не се чете пак', async () => {
  await configure('production');
  const now = new Date('2026-11-25T10:00:00Z');
  assert.equal(await pollOpenDisputes(fakeFetch, now), 1);
  assert.equal(listed.length, 1);
  assert.match(listed[0]!, /state=needs_response/);
  assert.match(listed[0]!, /from_created_date=2026-10-26T10%3A00%3A00\.000Z/);
  assert.deepEqual(reads, [NEW_ID], 'вече записаният и невалидното id — без четене');
  assert.equal(
    await prisma.auditLog.count({ where: { action: DISPUTE_AUDIT_ACTION, targetId: NEW_ID } }),
    1,
  );
  assert.equal(
    await prisma.notification.count({
      where: { kind: 'master.dispute', payload: { path: ['disputeId'], equals: NEW_ID } },
    }),
    1,
  );
  // Следващата обиколка: и двата са записани — нищо ново.
  assert.equal(await pollOpenDisputes(fakeFetch, now), 0);
  assert.deepEqual(reads, [NEW_ID]);
});
