import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { prepareTestDatabase, truncateAll } from './harness.js';

prepareTestDatabase();
const { prisma } = await import('../../src/db.js');
const { purgeExpired } = await import('../../src/maintenance.js');
const { DAY } = await import('../../src/time.js');

/** Сроковете от политиката за поверителност: сесии и връзки — 30 дни след изтичане, писма — 90 дни. */
const NOW = new Date('2026-11-13T12:00:00Z');
const ago = (days: number) => new Date(NOW.getTime() - days * DAY);
let userId = '';

before(async () => {
  await truncateAll(prisma);
  userId = (
    await prisma.user.create({ data: { email: 'u@example.test', name: 'Иван', passwordHash: 'x' } })
  ).id;
});

after(async () => {
  await prisma.$disconnect();
});

test('почистването трие само изтеклото над срока; живото остава', async () => {
  const session = (expiresAt: Date) =>
    prisma.session.create({ data: { userId, csrfToken: 'x', expiresAt } });
  await session(ago(31));
  const recent = await session(ago(29));
  const live = await session(new Date(NOW.getTime() + DAY));
  const token = (expiresAt: Date, hash: string) =>
    prisma.userToken.create({
      data: {
        userId,
        purpose: 'PASSWORD_RESET',
        tokenHash: hash,
        email: 'u@example.test',
        expiresAt,
      },
    });
  await token(ago(31), 'a'.repeat(64));
  const recentToken = await token(ago(29), 'b'.repeat(64));
  const mail = (status: 'SENT' | 'FAILED' | 'PENDING', createdAt: Date, sentAt: Date | null) =>
    prisma.notification.create({
      data: { kind: 'x', toEmail: 'u@example.test', payload: {}, status, createdAt, sentAt },
    });
  await mail('SENT', ago(100), ago(91));
  const recentSent = await mail('SENT', ago(100), ago(89));
  await mail('FAILED', ago(91), null);
  const oldPending = await mail('PENDING', ago(200), null);
  const event = (receivedAt: Date, deliveryId: string) =>
    prisma.peppolEvent.create({
      data: { deliveryId, topic: 'InvoiceSent', partyId: '9926:BG131063188', receivedAt },
    });
  await event(ago(91), 'old-event-0001');
  const recentEvent = await event(ago(89), 'new-event-0001');

  assert.deepEqual(await purgeExpired(NOW), {
    sessions: 1,
    tokens: 1,
    mails: 2,
    erased: 0,
    deleted: 0,
    statements: 0,
    submissions: 0,
    peppolEvents: 1,
    invites: 0,
  });
  const ids = async (rows: Promise<Array<{ id: string }>>) => (await rows).map((r) => r.id).sort();
  assert.deepEqual(await ids(prisma.session.findMany()), [recent.id, live.id].sort());
  assert.deepEqual(await ids(prisma.userToken.findMany()), [recentToken.id]);
  assert.deepEqual(
    await ids(prisma.notification.findMany()),
    [recentSent.id, oldPending.id].sort(),
  );
  assert.deepEqual(await ids(prisma.peppolEvent.findMany()), [recentEvent.id]);
});

test('неприетите покани (членове и собственост) — 30 дни след изтичането или отмяната; приетите остават', async () => {
  const org = await prisma.organization.create({
    data: {
      kind: 'COMPANY',
      legalName: 'Пекарна Зора ЕООД',
      eik: '123456786',
      addressStreet: 'ул. „Витоша“ 1',
      addressCity: 'София',
      postalCode: '1000',
    },
  });
  let n = 0;
  const member = (expiresAt: Date, extra: Record<string, unknown> = {}) =>
    prisma.memberInvite.create({
      data: {
        organizationId: org.id,
        email: `m${(n += 1)}@example.test`,
        role: 'VIEWER',
        tokenHash: String(n).padStart(64, 'c'),
        expiresAt,
        ...extra,
      },
    });
  const owner = (expiresAt: Date, extra: Record<string, unknown> = {}) =>
    prisma.transferInvite.create({
      data: {
        organizationId: org.id,
        email: `o${(n += 1)}@example.test`,
        tokenHash: String(n).padStart(64, 'd'),
        expiresAt,
        ...extra,
      },
    });
  await member(ago(31));
  await member(ago(10), { revokedAt: ago(31) });
  const keptMembers = [
    await member(ago(29)),
    await member(ago(60), { acceptedAt: ago(61), acceptedById: userId }),
    await member(new Date(NOW.getTime() + DAY)),
  ];
  await owner(ago(31));
  const keptOwners = [
    await owner(ago(29)),
    await owner(ago(60), { acceptedAt: ago(61), acceptedById: userId }),
  ];
  const result = await purgeExpired(NOW);
  assert.equal(result.invites, 3);
  const ids = async (rows: Promise<Array<{ id: string }>>) => (await rows).map((r) => r.id).sort();
  assert.deepEqual(await ids(prisma.memberInvite.findMany()), keptMembers.map((r) => r.id).sort());
  assert.deepEqual(await ids(prisma.transferInvite.findMany()), keptOwners.map((r) => r.id).sort());
});
