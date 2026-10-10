import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, beforeEach, describe, test } from 'node:test';
import { appendAudit, verifyAuditChain } from '../../src/audit.js';
import { loadRetentionConfig } from '../../src/config-retention.js';
import { AuditChainBroken, pruneAudit } from '../../src/services/audit-retention.js';
import { runRetention } from '../../src/services/retention.js';
import { MAGIC } from '../file-fixtures.js';
import { FakeScanner, SpyStore, URL_KEY } from './files.js';
import { db, startApp, type Harness } from './helpers.js';
import { open, resetCollab, say, seedCollab, type CollabWorld } from './collab-world.js';
import { newCase } from './world.js';

/**
 * Ретенция по класове (NFR-08, NFR-13): съобщенията по вид разговор (дискусиите по случай —
 * не), известията, присъствието, метаданните, одитът с контролна точка (веригата остава
 * проверима, архивът — проверим), счупена верига не се трие. Файловете — преди редовете.
 */

const DAY = 24 * 3600 * 1000;
const ago = (days: number) => new Date(Date.now() - days * DAY);
let h: Harness;
let w: CollabWorld;
const store = new SpyStore();

before(async () => {
  h = await startApp({
    diagnose: 'none',
    attachments: { store, scanner: new FakeScanner(), urlKey: URL_KEY },
  });
});
after(async () => {
  await h.close();
  await db.$disconnect();
});
beforeEach(async () => {
  await resetCollab();
  store.reset();
  w = await seedCollab(h);
});

const age = (id: string, days: number) =>
  db.conversationMessage.update({ where: { id }, data: { createdAt: ago(days) } });

describe('класове', () => {
  test('съобщения: всеки вид със свой срок; дискусията по случай — не; корен с нов отговор → следа', async () => {
    const { c, users } = w;
    const dm = await open(c.support, { type: 'DIRECT', userId: users.engineering.id });
    const group = await open(c.support, {
      type: 'GROUP',
      userIds: [users.engineering.id, users.owner.id],
    });
    const channel = await open(c.support, { type: 'CHANNEL', name: 'Generale' });
    const caseId = await newCase(w.c.portalAlfa);
    const disc = (await c.support.post(`/api/v1/cases/${caseId}/conversation`)).body.conversation
      .id as string;
    const dmOld = await say(c.support, dm, 'dm vecchio');
    const groupOld = await say(c.support, group, 'gruppo vecchio');
    const root = await say(c.support, channel, 'radice vecchia');
    const reply = await say(c.engineering, channel, 'risposta nuova', { replyToId: root.id });
    const chanOld = await say(c.support, channel, 'canale vecchio');
    const discOld = await say(c.support, disc, 'caso vecchio');
    await c.engineering.req('PUT', `/api/v1/messages/${chanOld.id}/marks/todo`);
    const photo = (
      await c.support.upload(`/api/v1/conversations/${channel}/attachments?kind=PHOTO`, MAGIC.png)
    ).body.attachment.id as string;
    const withFile = (
      await c.support.post(`/api/v1/conversations/${channel}/messages`, {
        text: 'radice con file',
        attachmentIds: [photo],
      })
    ).body.message;
    await say(c.engineering, channel, 'altra risposta', { replyToId: withFile.id });
    for (const m of [dmOld, groupOld, root, chanOld, discOld, withFile]) await age(m.id, 400);
    for (const m of [dmOld]) await age(m.id, 20);

    const report = await runRetention(db, store, {
      sessionDays: 30,
      caseDays: null,
      directDays: 30,
      groupDays: 365,
      channelDays: 90,
    });
    assert.deepEqual(report.messages, {
      direct: { deleted: 0, tombstoned: 0, files: 0 },
      group: { deleted: 1, tombstoned: 0, files: 0 },
      channel: { deleted: 1, tombstoned: 2, files: 1 },
    });
    const left = async (id: string) =>
      db.conversationMessage.findUnique({ where: { id }, select: { body: true, deletedAt: true } });
    assert.ok(await left(dmOld.id)); // 20 дни < 30
    assert.equal(await left(groupOld.id), null);
    assert.equal(await left(chanOld.id), null);
    assert.equal(await db.messageMark.count(), 0);
    // Корените с нови отговори — следи (без текст и файлове), нишката е цяла.
    const kept = await left(root.id);
    assert.equal(kept?.body, '');
    assert.ok(kept?.deletedAt);
    assert.equal(
      (await db.conversationMessage.findUniqueOrThrow({ where: { id: reply.id } })).replyToId,
      root.id,
    );
    assert.equal(await db.attachment.count({ where: { id: photo } }), 0);
    assert.equal(store.deletions.length, 1);
    assert.equal(store.deletions[0]?.rowExisted, true);
    // Дискусията по случай следва случая — недокосната.
    assert.equal((await left(discOld.id))?.body, 'caso vecchio');
    // Второ пускане — следите не се броят отново.
    const again = await runRetention(db, store, {
      sessionDays: 30,
      caseDays: null,
      channelDays: 90,
    });
    assert.deepEqual(again.messages.channel, { deleted: 0, tombstoned: 0, files: 0 });
  });

  test('известия, присъствие (настройката „последно видян“ се пази), метаданни', async () => {
    const { c, users } = w;
    const dm = await open(c.support, { type: 'DIRECT', userId: users.engineering.id });
    await say(c.support, dm, 'uno');
    // Старото известие (прочетено, 100 дни) пада; новото (друг разговор) остава.
    await db.notification.updateMany({ data: { createdAt: ago(100), readAt: ago(99) } });
    const fresh = await open(c.owner, { type: 'DIRECT', userId: users.engineering.id });
    await say(c.owner, fresh, 'nuovo');
    await db.userPresence.createMany({
      data: [
        { userId: users.support.id, status: 'ONLINE', lastSeenAt: ago(10) },
        { userId: users.owner.id, status: 'AWAY', lastSeenAt: ago(10), showLastSeen: false },
        { userId: users.engineering.id, status: 'ONLINE', lastSeenAt: ago(1) },
      ],
    });
    await db.emailOutbox.createMany({
      data: [
        {
          tenantId: w.tenantA.id,
          userId: users.support.id,
          kind: 'DIGEST',
          dedupeKey: 'a',
          status: 'SENT',
        },
        {
          tenantId: w.tenantA.id,
          userId: users.support.id,
          kind: 'DIGEST',
          dedupeKey: 'b',
          status: 'PENDING',
        },
      ],
    });
    await db.$executeRaw`UPDATE "EmailOutbox" SET "updatedAt" = ${ago(200)}`;
    const gone = await say(c.support, dm, 'da cancellare');
    await c.support.req('DELETE', `/api/v1/messages/${gone.id}`);
    await db.conversationMessage.update({ where: { id: gone.id }, data: { deletedAt: ago(200) } });

    const report = await runRetention(db, store, {
      sessionDays: 30,
      caseDays: null,
      notificationDays: 90,
      presenceDays: 7,
      metadataDays: 90,
    });
    assert.equal(report.notifications, 1);
    assert.equal(report.presence, 2);
    assert.deepEqual(report.metadata, { emails: 1, passwordLinks: 0, tombstones: 1 });
    // Остават само новите: „nuovo“ и „da cancellare“ (ново известие — старото беше прочетено).
    assert.equal(await db.notification.count({ where: { createdAt: { lt: ago(1) } } }), 0);
    assert.equal(await db.notification.count({ where: { objectId: fresh } }), 1);
    const presence = await db.userPresence.findMany({ orderBy: { userId: 'asc' } });
    const owner = presence.find((p) => p.userId === users.owner.id);
    assert.equal(owner?.showLastSeen, false);
    assert.equal(owner?.lastSeenAt.getTime(), 0);
    assert.equal(
      presence.some((p) => p.userId === users.support.id),
      false,
    );
    assert.equal(await db.emailOutbox.count({ where: { status: 'PENDING' } }), 1);
    assert.equal(await db.conversationMessage.count({ where: { id: gone.id } }), 0);
  });

  test('конфигурацията: подразбиранията, празно = „не е зададено“, долни граници', () => {
    const cfg = loadRetentionConfig({ RETENTION_CASE_DAYS: '', RETENTION_DIRECT_DAYS: '180' });
    assert.equal(cfg.RETENTION_CASE_DAYS, null);
    assert.equal(cfg.RETENTION_DIRECT_DAYS, 180);
    assert.equal(cfg.RETENTION_GROUP_DAYS, null);
    assert.equal(cfg.RETENTION_AUDIT_DAYS, 3650);
    assert.equal(cfg.RETENTION_PRESENCE_DAYS, 7);
    assert.throws(() => loadRetentionConfig({ RETENTION_AUDIT_DAYS: '30' }));
    assert.throws(() => loadRetentionConfig({ RETENTION_CASE_DAYS: '5' }));
  });
});

describe('одит с контролна точка', () => {
  test('изтрива най-старото парче, пази котвата и архива; веригата остава проверима', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'chatchat-audit-'));
    try {
      for (let i = 0; i < 5; i += 1) {
        await appendAudit(db, { tenantId: null, actorId: null, action: `old.${i}` });
      }
      await new Promise((r) => setTimeout(r, 20));
      const mid = new Date();
      for (let i = 0; i < 3; i += 1) {
        await appendAudit(db, { tenantId: null, actorId: null, action: `new.${i}` });
      }
      const before = await db.auditEvent.findMany({ orderBy: { id: 'asc' } });
      const oldCount = before.filter((e) => e.at < mid).length;

      const report = await pruneAudit(db, { cutoff: mid, archiveDir: dir });
      assert.equal(report.deleted, oldCount);
      assert.equal(await verifyAuditChain(db), null);
      const cp = await db.auditCheckpoint.findFirstOrThrow();
      const lastOld = before.filter((e) => e.at < mid).at(-1);
      assert.equal(cp.throughHash, lastOld?.hash);
      assert.equal(cp.fromHash, '0'.repeat(64));
      // Архивът: точно изтритите редове, sha256 = записаното в точката.
      const [file] = await readdir(dir);
      assert.ok(file);
      const bytes = await readFile(join(dir, file));
      assert.equal(createHash('sha256').update(bytes).digest('hex'), report.archiveSha256);
      assert.equal(bytes.toString('utf8').trim().split('\n').length, oldCount);
      // Самата точка е свидетелствана във веригата.
      const ev = await db.auditEvent.findFirstOrThrow({ where: { action: 'audit.checkpoint' } });
      assert.equal((ev.detail as { throughHash: string }).throughHash, lastOld?.hash);

      // Всичко изтича → празна таблица + нова точка; следващият запис продължава от котвата.
      const all = await pruneAudit(db, { cutoff: new Date(Date.now() + DAY), archiveDir: null });
      assert.ok(all.deleted > 0);
      assert.equal(await verifyAuditChain(db), null);
      await appendAudit(db, { tenantId: null, actorId: null, action: 'after.prune' });
      assert.equal(await verifyAuditChain(db), null);
      assert.equal(await db.auditCheckpoint.count(), 2);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  test('счупена верига → нищо не се трие, архивът се маха; без срок — одитът не се пипа', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'chatchat-audit-'));
    try {
      for (let i = 0; i < 3; i += 1) {
        await appendAudit(db, { tenantId: null, actorId: null, action: `x.${i}` });
      }
      const victim = await db.auditEvent.findFirstOrThrow({ orderBy: { id: 'asc' } });
      await db.auditEvent.update({ where: { id: victim.id }, data: { action: 'подправено' } });
      await assert.rejects(
        pruneAudit(db, { cutoff: new Date(Date.now() + DAY), archiveDir: dir }),
        AuditChainBroken,
      );
      assert.equal(await db.auditEvent.count(), 3);
      assert.equal(await db.auditCheckpoint.count(), 0);
      assert.deepEqual(await readdir(dir), []);
      const report = await runRetention(db, null, { sessionDays: 30, caseDays: null });
      assert.equal(report.audit, null);
      assert.equal(await db.auditEvent.count(), 3);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
