import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import {
  forgetMailTo,
  mailTo,
  outbox,
  prisma,
  startApp,
  stopApp,
  type Browser,
} from './harness.js';
import { customer, sessionCsrf, staff, type StaffMember } from './people.js';
import { enable2fa } from './twofa.js';

before(startApp);
after(stopApp);

const ACTIONS = ['2fa-reset', 'sessions/revoke', 'unlock', 'reset-password'] as const;
type Action = (typeof ACTIONS)[number];

/** A customer with 2FA on, a live session and a lock — everything the four actions touch. */
async function lockedCustomer(email: string): Promise<{ b: Browser; id: string }> {
  const b = await customer(email);
  await enable2fa(b);
  const { id } = await prisma.user.update({
    where: { email },
    data: { lockedUntil: new Date(Date.now() + 600_000), failedLogins: 3 },
  });
  return { b, id };
}

async function act(member: StaffMember, id: string, action: Action) {
  return member.browser.post(`/admin/accounts/${id}/${action}`, {
    _csrf: await sessionCsrf(member.browser, `/admin/accounts/${id}`),
  });
}

async function untouched(id: string): Promise<void> {
  const user = await prisma.user.findUniqueOrThrow({ where: { id } });
  assert.ok(user.totpEnabledAt && user.totpSecretEnc, '2FA stays');
  assert.ok(user.lockedUntil && user.failedLogins === 3, 'the lock stays');
  assert.ok(await prisma.recoveryCode.count({ where: { userId: id } }), 'recovery codes stay');
  assert.ok(await prisma.session.count({ where: { userId: id } }), 'sessions stay');
  assert.equal(
    await prisma.auditLog.count({
      where: { targetId: id, action: { startsWith: 'admin.' } },
    }),
    0,
    'nothing is written to the audit',
  );
}

test('the security actions of the panel need the security capability: viewers and analysts get 403', async () => {
  const viewer = await staff('VIEWER', 'sec-viewer@example.test');
  const analyst = await staff('ANALYST', 'sec-analyst@example.test');
  const { id } = await lockedCustomer('sec-target-low@example.test');
  forgetMailTo('sec-target-low@example.test');
  for (const member of [viewer, analyst])
    for (const action of ACTIONS)
      assert.equal(
        (await act(member, id, action)).status,
        403,
        `${action} by ${member.actor.role}`,
      );
  await untouched(id);
  assert.equal(
    outbox.filter((m) => m.to === 'sec-target-low@example.test' && /Нова парола/.test(m.subject))
      .length,
    0,
  );
});

test('support cannot touch the security of an account of a higher or equal rank', async () => {
  const support = await staff('SUPPORT', 'sec-support-rank@example.test');
  const admin = await staff('ADMIN', 'sec-admin-rank@example.test');
  await prisma.user.update({
    where: { id: admin.id },
    data: { lockedUntil: new Date(Date.now() + 600_000), failedLogins: 3 },
  });
  await prisma.recoveryCode.create({ data: { userId: admin.id, codeHash: 'x'.repeat(64) } });
  for (const action of ACTIONS) {
    const reply = await act(support, admin.id, action);
    assert.equal(reply.status, 302, action);
    assert.equal(support.browser.flash(), 'admin.errors.rank', action);
  }
  await untouched(admin.id);
});

test('support resets 2FA: secret, recovery codes and sessions go, the audit and the person are told', async () => {
  const support = await staff('SUPPORT', 'sec-support-2fa@example.test');
  const { b, id } = await lockedCustomer('sec-target-2fa@example.test');
  forgetMailTo('sec-target-2fa@example.test');
  assert.equal((await act(support, id, '2fa-reset')).status, 302);
  assert.equal(support.browser.flash(), 'flash.twoFactorReset');
  const user = await prisma.user.findUniqueOrThrow({ where: { id } });
  assert.equal(user.totpEnabledAt, null);
  assert.equal(user.totpSecretEnc, null);
  assert.equal(await prisma.recoveryCode.count({ where: { userId: id } }), 0);
  assert.equal(await prisma.session.count({ where: { userId: id } }), 0);
  assert.equal((await b.get('/app')).status, 302, 'the old session is over');
  const entry = await prisma.auditLog.findFirstOrThrow({
    where: { action: 'admin.totp.reset', targetId: id },
  });
  assert.equal(entry.actorId, support.id);
  await mailTo('sec-target-2fa@example.test', /Двуфакторната защита е изключена/);
});

test('support ends all sessions, lifts a lock and sends a password link', async () => {
  const support = await staff('SUPPORT', 'sec-support-ops@example.test');

  const revoked = await lockedCustomer('sec-target-revoke@example.test');
  await act(support, revoked.id, 'sessions/revoke');
  assert.equal(support.browser.flash(), 'flash.sessionsRevoked');
  assert.equal(await prisma.session.count({ where: { userId: revoked.id } }), 0);
  assert.equal((await revoked.b.get('/app')).status, 302);
  assert.ok(
    await prisma.auditLog.count({
      where: { action: 'admin.sessions.revoked', targetId: revoked.id },
    }),
  );

  const locked = await lockedCustomer('sec-target-unlock@example.test');
  await act(support, locked.id, 'unlock');
  assert.equal(support.browser.flash(), 'flash.unlocked');
  const unlocked = await prisma.user.findUniqueOrThrow({ where: { id: locked.id } });
  assert.equal(unlocked.lockedUntil, null);
  assert.equal(unlocked.failedLogins, 0);
  assert.ok(
    await prisma.auditLog.count({
      where: { action: 'admin.account.unlocked', targetId: locked.id },
    }),
  );

  const mailed = await lockedCustomer('sec-target-reset@example.test');
  forgetMailTo('sec-target-reset@example.test');
  await act(support, mailed.id, 'reset-password');
  assert.equal(support.browser.flash(), 'flash.resetSent');
  await mailTo('sec-target-reset@example.test', /Нова парола/);
  assert.ok(
    await prisma.auditLog.count({ where: { action: 'admin.reset.sent', targetId: mailed.id } }),
  );
});
