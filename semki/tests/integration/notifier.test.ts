import { after, before, beforeEach, test } from 'node:test';
import assert from 'node:assert/strict';
import type { PrismaClient } from '@prisma/client';
import { HOUR_MS, percentAt } from '../../src/domain/decay.js';
import {
  createBatch,
  deleteExpiredBatches,
  listBatches,
  updateBatch,
  updateSeedTypeRate,
} from '../../src/services/batches.js';
import { createNotifier } from '../../src/services/notifier.js';
import { createRule, updateSettings } from '../../src/services/rules.js';
import { CHANNEL, fakeSender, ROLE, silentLog, type SentMessage } from '../helpers.js';
import { prepareDb, resetDb } from './db.js';

let db: PrismaClient;
const t0 = new Date('2026-11-03T10:00:00Z'); // 12:00 в София
let clock = t0;
const at = (h: number) => new Date(t0.getTime() + h * HOUR_MS);
const actor = { id: '100000000000000001', name: 'Тестер' };
const ruleBase = { seedTypeKey: null, channelId: CHANNEL.id, roleId: ROLE.id, enabled: true };

function notifier(sent: SentMessage[], fail = false) {
  return createNotifier({
    db,
    sender: fakeSender(sent, fail),
    log: silentLog,
    now: () => clock,
    retryAfterMs: HOUR_MS,
  });
}

before(() => {
  db = prepareDb();
});
after(async () => {
  await db.$disconnect();
});
beforeEach(async () => {
  await resetDb(db);
  clock = t0;
});

test('прагът в % пингва веднъж, когато времето го стигне', async () => {
  await createRule(db, { ...ruleBase, kind: 'PERCENT', threshold: 20 }, t0);
  const { passed } = await createBatch(
    db,
    { seedTypeKey: 'amnesia', count: 5, percent: 26 },
    actor,
    'command',
    t0,
  );
  assert.equal(passed.length, 0);
  const sent: SentMessage[] = [];
  const n = notifier(sent);

  clock = at(9.9);
  assert.equal((await n.tick()).sent, 0);
  clock = at(10); // 26% → 20% за 10 ч
  assert.equal((await n.tick()).sent, 1);
  assert.equal(sent.length, 1);
  assert.ok(sent[0]?.content.startsWith(`<@&${ROLE.id}>`));
  assert.equal(sent[0]?.channelId, CHANNEL.id);
  assert.equal(sent[0]?.ping, true);
  clock = at(11);
  assert.equal((await n.tick()).sent, 0);
  assert.equal(sent.length, 1);
});

test('партида, въведена под прага, се отбелязва тихо и не пингва', async () => {
  await createRule(db, { ...ruleBase, kind: 'PERCENT', threshold: 20 }, t0);
  const { batch, passed } = await createBatch(
    db,
    { seedTypeKey: 'ak', count: 2, percent: 15 },
    actor,
    'command',
    t0,
  );
  assert.deepEqual(
    passed.map((r) => r.threshold),
    [20],
  );
  const rows = await db.notification.findMany({ where: { batchId: batch.id } });
  assert.equal(rows.length, 1);
  assert.equal(rows[0]?.silent, true);
  const sent: SentMessage[] = [];
  await notifier(sent).tick();
  assert.equal(sent.length, 0);
});

test('ново правило не пингва със задна дата', async () => {
  await createBatch(db, { seedTypeKey: 'ak', count: 2, percent: 15 }, actor, 'command', t0);
  await createRule(db, { ...ruleBase, kind: 'PERCENT', threshold: 20 }, t0);
  const sent: SentMessage[] = [];
  await notifier(sent).tick();
  assert.equal(sent.length, 0);
});

test('в прозореца пингва веднага, след края му — не', async () => {
  await updateSettings(db, {
    dashboardRoleId: null,
    commandRoleId: null,
    quietEnabled: true,
    windowStart: '10:00',
    windowEnd: '23:00',
    timezone: 'Europe/Sofia',
  });
  await createRule(db, { ...ruleBase, kind: 'PERCENT', threshold: 20 }, t0);
  // 26% в 12:00 София → 20% в 22:00; 23:00 е краят на прозореца
  await createBatch(db, { seedTypeKey: 'purple', count: 1, percent: 26 }, actor, 'dashboard', t0);
  await createBatch(db, { seedTypeKey: 'purple', count: 2, percent: 30 }, actor, 'dashboard', t0); // 20% в 04:40
  const sent: SentMessage[] = [];
  const n = notifier(sent);
  clock = at(10.5); // 22:30 София — в прозореца
  assert.equal((await n.tick()).sent, 1);
  clock = at(11.5); // 23:30 София — извън [10:00, 23:00)
  assert.equal((await n.tick()).skipped, 'window');
  clock = at(17); // 05:00 София — вторият праг е минат, но е нощ
  assert.equal((await n.tick()).skipped, 'window');
  assert.equal(sent.length, 1);
});

test('праг, минат през нощта, се пингва в началото на прозореца', async () => {
  await updateSettings(db, {
    dashboardRoleId: null,
    commandRoleId: null,
    quietEnabled: true,
    windowStart: '10:00',
    windowEnd: '23:00',
    timezone: 'Europe/Sofia',
  });
  await createRule(db, { ...ruleBase, kind: 'PERCENT', threshold: 20 }, t0);
  // 29% в 12:00 → 20% в 03:00 София
  await createBatch(db, { seedTypeKey: 'purple', count: 1, percent: 29 }, actor, 'dashboard', t0);
  const sent: SentMessage[] = [];
  const n = notifier(sent);
  clock = at(15.5); // 03:30 София
  assert.equal((await n.tick()).skipped, 'window');
  clock = at(21.5); // 09:30 София
  assert.equal((await n.tick()).skipped, 'window');
  clock = at(22.01); // 10:00 София
  assert.equal((await n.tick()).sent, 1);
  assert.equal(sent.length, 1);
});

test('оставащо време пингва X часа преди 0%', async () => {
  await createRule(db, { ...ruleBase, kind: 'HOURS_LEFT', threshold: 3 }, t0);
  await createBatch(db, { seedTypeKey: 'skunk', count: 4, percent: 12 }, actor, 'command', t0); // 0% след 20 ч
  const sent: SentMessage[] = [];
  const n = notifier(sent);
  clock = at(16.9);
  await n.tick();
  assert.equal(sent.length, 0);
  clock = at(17);
  await n.tick();
  assert.equal(sent.length, 1);
  assert.match(sent[0]?.content ?? '', /≤ 3 ч до 0%/);
});

test('правило за един вид не пингва за друг; два прага → едно съобщение', async () => {
  await createRule(db, { ...ruleBase, kind: 'PERCENT', threshold: 20, seedTypeKey: 'ogkush' }, t0);
  await createRule(db, { ...ruleBase, kind: 'PERCENT', threshold: 25 }, t0);
  await createRule(db, { ...ruleBase, kind: 'PERCENT', threshold: 22 }, t0);
  await createBatch(db, { seedTypeKey: 'amnesia', count: 1, percent: 30 }, actor, 'command', t0);
  const sent: SentMessage[] = [];
  clock = at(20); // 30% → 18%
  await notifier(sent).tick();
  assert.equal(sent.length, 1);
  assert.match(sent[0]?.content ?? '', /≤ 25%, ≤ 22%|≤ 22%, ≤ 25%/);
  assert.doesNotMatch(sent[0]?.content ?? '', /≤ 20%/);
});

test('провал при изпращане: нищо не се отбелязва, нов опит след паузата', async () => {
  await createRule(db, { ...ruleBase, kind: 'PERCENT', threshold: 20 }, t0);
  await createBatch(db, { seedTypeKey: 'amnesia', count: 1, percent: 21 }, actor, 'command', t0);
  clock = at(2);
  const failing = await notifier([], true).tick();
  assert.equal(failing.failed, 1);
  assert.equal(await db.notification.count(), 0);
  const sent: SentMessage[] = [];
  await notifier(sent).tick();
  assert.equal(sent.length, 1);
  assert.equal(await db.notification.count({ where: { silent: false } }), 1);
});

test('редакция нагоре връща прага в играта', async () => {
  await createRule(db, { ...ruleBase, kind: 'PERCENT', threshold: 20 }, t0);
  const { batch } = await createBatch(
    db,
    { seedTypeKey: 'amnesia', count: 1, percent: 15 },
    actor,
    'command',
    t0,
  );
  assert.equal(await db.notification.count(), 1);
  assert.equal(await updateBatch(db, batch.id, { count: 3, percent: 50 }, at(1)), true);
  assert.equal(await db.notification.count(), 0);
  const sent: SentMessage[] = [];
  clock = at(1 + 50); // 50% → 20% за 50 ч
  await notifier(sent).tick();
  assert.equal(sent.length, 1);
  assert.match(sent[0]?.content ?? '', /×3/);
});

test('смяна на скоростта пази текущия процент', async () => {
  await createBatch(db, { seedTypeKey: 'ak', count: 1, percent: 100 }, actor, 'command', t0);
  assert.equal(
    await updateSeedTypeRate(db, 'ak', { decayPercent: 1, decayMinutes: 60 }, at(10)),
    true,
  );
  const [b] = await listBatches(db);
  assert.ok(b);
  assert.ok(Math.abs(b.percent - 94) < 1e-6);
  assert.equal(b.anchoredAt.getTime(), at(10).getTime());
  assert.ok(Math.abs(percentAt(b, b.rate, at(11)) - 93) < 1e-6);
  assert.equal(
    await updateSeedTypeRate(db, 'nope', { decayPercent: 1, decayMinutes: 60 }, at(10)),
    false,
  );
});

test('изтриване на изтеклите пази живите', async () => {
  await createBatch(db, { seedTypeKey: 'ak', count: 1, percent: 1.2 }, actor, 'command', t0); // 0% след 2 ч
  await createBatch(db, { seedTypeKey: 'ak', count: 1, percent: 50 }, actor, 'command', t0);
  assert.equal(await deleteExpiredBatches(db, at(3)), 1);
  assert.equal((await listBatches(db)).length, 1);
});

test('базата отказва невалидни стойности и мимо zod', async () => {
  await assert.rejects(
    db.batch.create({
      data: {
        seedTypeKey: 'ak',
        count: 1,
        percent: 101,
        anchoredAt: t0,
        createdById: actor.id,
        createdByName: actor.name,
        source: 'command',
      },
    }),
  );
});
