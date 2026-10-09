import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { LOGIN_RETENTION_DAYS } from '../../src/retention.js';
import { TRIAL_REMINDER_DAYS } from '../../src/plans/plan.js';
import { runMaintenance } from '../../src/services/maintenance.js';
import { forgetMailTo, mailTo, outbox, prisma, startApp, stopApp } from './harness.js';
import { customer } from './people.js';

before(startApp);
after(stopApp);

const DAY = 86_400_000;
const daysAgo = (days: number) => new Date(Date.now() - days * DAY);

test('sign-in records, devices, sign-up fingerprint and audit IPs are erased after the retention period, and only then', async () => {
  const keptEmail = 'retention-kept@example.test';
  const goneEmail = 'retention-gone@example.test';
  await customer(keptEmail);
  await customer(goneEmail);
  const kept = await prisma.user.findUniqueOrThrow({ where: { email: keptEmail } });
  const gone = await prisma.user.findUniqueOrThrow({ where: { email: goneEmail } });
  assert.ok(kept.signupDeviceHash && kept.signupFingerprint, 'sign-up fingerprint is stored first');

  const outside = daysAgo(LOGIN_RETENTION_DAYS + 1);
  const inside = daysAgo(LOGIN_RETENTION_DAYS - 1);
  // the older person: every record one day past the term; the other: one day inside it
  for (const [user, when] of [
    [gone, outside],
    [kept, inside],
  ] as const) {
    await prisma.user.update({ where: { id: user.id }, data: { createdAt: when } });
    await prisma.loginEvent.updateMany({ where: { userId: user.id }, data: { createdAt: when } });
    await prisma.device.updateMany({ where: { userId: user.id }, data: { lastSeenAt: when } });
    // the audit chain also hashes the time: the chain breaks here, which the clean-up reports but survives
    await prisma.auditLog.updateMany({
      where: { actorId: user.id },
      data: { at: when, ip: '203.0.113.7' },
    });
  }
  assert.ok(await prisma.loginEvent.count({ where: { userId: gone.id } }), 'there are records');
  assert.ok(await prisma.device.count({ where: { userId: gone.id } }), 'there are devices');
  assert.ok(
    await prisma.auditLog.count({ where: { actorId: gone.id, ip: { not: null } } }),
    'there are audit IPs',
  );

  await runMaintenance();

  assert.equal(await prisma.loginEvent.count({ where: { userId: gone.id } }), 0, 'logins erased');
  assert.equal(await prisma.device.count({ where: { userId: gone.id } }), 0, 'devices erased');
  const goneAfter = await prisma.user.findUniqueOrThrow({ where: { id: gone.id } });
  assert.equal(goneAfter.signupDeviceHash, null);
  assert.equal(goneAfter.signupFingerprint, null);
  assert.equal(
    await prisma.auditLog.count({ where: { actorId: gone.id, ip: { not: null } } }),
    0,
    'the IP is erased from the audit log',
  );
  assert.ok(
    await prisma.auditLog.count({ where: { actorId: gone.id } }),
    'the audit entries themselves stay',
  );

  assert.ok(
    await prisma.loginEvent.count({ where: { userId: kept.id } }),
    'logins inside the term stay',
  );
  assert.ok(
    await prisma.device.count({ where: { userId: kept.id } }),
    'devices inside the term stay',
  );
  const keptAfter = await prisma.user.findUniqueOrThrow({ where: { id: kept.id } });
  assert.ok(keptAfter.signupDeviceHash && keptAfter.signupFingerprint, 'fingerprint stays');
  assert.ok(
    await prisma.auditLog.count({ where: { actorId: kept.id, ip: '203.0.113.7' } }),
    'audit IPs inside the term stay',
  );
});

test('the trial-ending reminder goes out once, only for a trial that ends within the window', async () => {
  const soon = 'trial-soon@example.test';
  const far = 'trial-far@example.test';
  await customer(soon);
  await customer(far);
  await prisma.user.update({
    where: { email: soon },
    data: { planExpiresAt: new Date(Date.now() + (TRIAL_REMINDER_DAYS - 1) * DAY) },
  });
  const count = (to: string) => outbox.filter((m) => m.to === to).length;
  forgetMailTo(soon);
  forgetMailTo(far);

  await runMaintenance();
  const mail = await mailTo(soon, /Тестовият ви период в Korpora свършва/);
  assert.match(mail.subject, /свършва на /);
  assert.ok(
    (await prisma.user.findUniqueOrThrow({ where: { email: soon } })).trialReminderAt,
    'the reminder is marked as sent',
  );
  assert.equal(count(far), 0, 'a trial far from its end gets nothing');

  await runMaintenance();
  assert.equal(count(soon), 1, 'a second run sends nothing new');
});
