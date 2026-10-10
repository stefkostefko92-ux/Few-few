import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, test } from 'node:test';
import type { Mailer, OutgoingMail, SendResult } from '../../src/services/email/mailer.js';
import { processOutbox, scheduleDigests, type EmailDeps } from '../../src/services/email/outbox.js';
import { db, startApp, type Harness, type Res } from './helpers.js';
import { del, open, resetCollab, say, seedCollab, type CollabWorld } from './collab-world.js';
import { newCase } from './world.js';

/**
 * Известия (FR-18, §12.3, §14.1): GET /notifications с предпочитания и курсор, личните
 * предпочитания (имейл, дайджест, тихи часове), „спешно“ като отделен вид, и имейлите през
 * outbox-а — само при ново известие, без съдържание, проверка на достъпа/прочетеното при
 * изпращане, тихи часове, повторни опити, идемпотентност, дневен дайджест.
 */

const DELAY = 5 * 60 * 1000;
let h: Harness;
let w: CollabWorld;

class FakeMailer implements Mailer {
  sent: OutgoingMail[] = [];
  next: SendResult[] = [];
  async send(mail: OutgoingMail): Promise<SendResult> {
    const result = this.next.shift() ?? { ok: true };
    if (result.ok) this.sent.push(mail);
    return result;
  }
}

const mailer = new FakeMailer();
const silent = { info: () => undefined, warn: () => undefined };
const deps = (): EmailDeps => ({
  db,
  mailer,
  logger: silent,
  baseUrl: 'https://chatchat.test/',
  maxAttempts: 3,
  digestHour: 7,
});
const later = (ms = DELAY + 1000) => new Date(Date.now() + ms);

before(async () => {
  h = await startApp({ diagnose: 'none', mail: { delayMs: DELAY } });
});
after(async () => {
  await h.close();
  await db.$disconnect();
});
beforeEach(async () => {
  await resetCollab();
  mailer.sent = [];
  mailer.next = [];
  w = await seedCollab(h);
});

describe('GET /notifications и предпочитанията', () => {
  test('непрочетените първо, после прочетените; курсор без дубли; предпочитания в отговора', async () => {
    const { c, users } = w;
    const convs: string[] = [];
    for (const who of [c.support, c.owner, c.internal, c.tenantAdmin]) {
      const id = await open(who, { type: 'DIRECT', userId: users.engineering.id });
      convs.push(id);
      await say(who, id, 'ciao');
    }
    // Две прочетени (последните две).
    await db.notification.updateMany({
      where: { userId: users.engineering.id, objectId: { in: convs.slice(2) } },
      data: { readAt: new Date() },
    });
    await c.engineering.patch(`/api/v1/conversations/${convs[0]}/preferences`, {
      notificationPref: 'MENTIONS',
    });
    const seen: Array<{ id: string; readAt: string | null }> = [];
    let cursor: string | null = null;
    for (let i = 0; i < 5; i += 1) {
      const path: string = `/api/v1/notifications?limit=3${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`;
      const res: Res = await c.engineering.get(path);
      assert.equal(res.status, 200, JSON.stringify(res.body));
      if (i === 0) {
        assert.equal(res.body.unreadCount, 2);
        assert.deepEqual(res.body.preferences.email, {
          available: true,
          enabled: true,
          digest: 'OFF',
          quietHours: null,
          timeZone: 'Europe/Rome',
        });
        assert.deepEqual(res.body.preferences.conversations, [
          { conversationId: convs[0], notificationPref: 'MENTIONS' },
        ]);
        assert.equal(res.body.notifications[0].priority, 'normal');
      }
      seen.push(...res.body.notifications);
      cursor = res.body.nextCursor;
      if (!cursor) break;
    }
    assert.equal(seen.length, 4);
    assert.equal(new Set(seen.map((n) => n.id)).size, 4);
    assert.deepEqual(
      seen.map((n) => n.readAt === null),
      [true, true, false, false],
    );
    assert.equal((await c.engineering.get('/api/v1/notifications?cursor=zzz')).status, 400);
  });

  test('PATCH /notifications/preferences: валидни стойности; иначе 400; само своите', async () => {
    const { c, users } = w;
    const ok = await c.engineering.patch('/api/v1/notifications/preferences', {
      digest: 'DAILY',
      quietHours: { start: '22:00', end: '07:30' },
      timeZone: 'Europe/Sofia',
    });
    assert.equal(ok.status, 200, JSON.stringify(ok.body));
    assert.deepEqual(ok.body.preferences.email.quietHours, { start: '22:00', end: '07:30' });
    const row = await db.notificationSettings.findUniqueOrThrow({
      where: { userId: users.engineering.id },
    });
    assert.deepEqual([row.quietStart, row.quietEnd, row.tenantId], [1320, 450, w.tenantA.id]);
    for (const bad of [
      {},
      { timeZone: 'Mars/Olympus' },
      { quietHours: { start: '10:00', end: '10:00' } },
      { quietHours: { start: '25:00', end: '07:00' } },
      { digest: 'WEEKLY' },
      { emailEnabled: true, userId: users.support.id },
    ]) {
      assert.equal(
        (await c.engineering.patch('/api/v1/notifications/preferences', bad)).status,
        400,
        JSON.stringify(bad),
      );
    }
    const off = await c.engineering.patch('/api/v1/notifications/preferences', {
      emailEnabled: false,
      quietHours: null,
    });
    assert.deepEqual(
      [off.body.preferences.email.enabled, off.body.preferences.email.quietHours],
      [false, null],
    );
    // Без CSRF — 403; друг човек не вижда чуждите.
    assert.equal(
      (
        await c.support.patch(
          '/api/v1/notifications/preferences',
          { digest: 'DAILY' },
          { csrf: null },
        )
      ).status,
      403,
    );
    assert.equal(
      (await c.support.get('/api/v1/notifications')).body.preferences.email.digest,
      'OFF',
    );
  });
});

describe('спешно поемане', () => {
  test('отворен тикет / AI препоръчва ескалация → case.urgent (приоритет urgent), иначе case.assigned', async () => {
    const { c, users } = w;
    const plain = await newCase(w.c.portalAlfa);
    const escalated = await newCase(w.c.portalAlfa);
    await db.ticket.create({
      data: {
        caseId: escalated,
        number: 'TS-2026-000001',
        reason: 'test',
        summary: {},
        createdById: users.portalAlfa.id,
      },
    });
    const blocked = await newCase(w.c.portalAlfa);
    await db.caseMessage.create({
      data: {
        caseId: blocked,
        kind: 'AI',
        body: 'Bloccato',
        payload: { safety: { level: 'blocked', notes: [] }, escalation: { recommended: false } },
      },
    });
    for (const id of [plain, escalated, blocked]) {
      assert.equal((await c.support.post(`/api/v1/cases/${id}/assign`)).status, 200);
    }
    const list = await c.portalAlfa.get('/api/v1/notifications');
    const byCase = new Map(
      list.body.notifications.map(
        (n: { objectId: string; eventType: string; priority: string }) => [
          n.objectId,
          `${n.eventType}/${n.priority}`,
        ],
      ),
    );
    assert.equal(byCase.get(plain), 'case.assigned/normal');
    assert.equal(byCase.get(escalated), 'case.urgent/urgent');
    assert.equal(byCase.get(blocked), 'case.urgent/urgent');
    // Писмата: спешните — веднага, обикновеното — след забавянето.
    const rows = await db.emailOutbox.findMany({ where: { userId: users.portalAlfa.id } });
    const now = Date.now();
    for (const r of rows) {
      const immediate = r.notBefore.getTime() <= now;
      assert.equal(immediate, r.kind === 'CASE_URGENT', r.kind);
    }
    assert.deepEqual(rows.map((r) => r.kind).sort(), [
      'CASE_ASSIGNED',
      'CASE_URGENT',
      'CASE_URGENT',
    ]);
    await processOutbox(deps());
    assert.equal(mailer.sent.length, 2);
    assert.ok(mailer.sent.every((m) => m.to === users.portalAlfa.email));
    assert.ok(mailer.sent.every((m) => m.text.includes('https://chatchat.test/#case=')));
  });
});

describe('имейл известия (outbox)', () => {
  test('ред само при ново известие; без съдържание и имена; прочетеното не тръгва', async () => {
    const { c, users } = w;
    const dm = await open(c.support, { type: 'DIRECT', userId: users.engineering.id });
    await say(c.support, dm, 'Il cliente Mario Rossi chiede del quadro');
    await say(c.support, dm, 'secondo messaggio');
    const rows = await db.emailOutbox.findMany({ where: { userId: users.engineering.id } });
    assert.equal(rows.length, 1);
    assert.equal(rows[0]?.kind, 'MESSAGE');
    assert.ok((rows[0]?.notBefore.getTime() ?? 0) > Date.now() + DELAY - 5000);

    // Преди забавянето — нищо; после — едно писмо, на езика на човека, без текст и имена.
    assert.equal((await processOutbox(deps())).claimed, 0);
    await db.user.update({ where: { id: users.engineering.id }, data: { locale: 'en' } });
    const report = await processOutbox(deps(), later());
    assert.equal(report.sent, 1);
    const mail = mailer.sent[0];
    assert.ok(mail);
    assert.equal(mail.to, users.engineering.email);
    assert.match(mail.subject, /new message in a direct conversation/);
    const all = `${mail.subject}${mail.text}${mail.html}`;
    for (const leak of ['Mario', 'Rossi', 'secondo', 'Sara', 'Supporto']) {
      assert.equal(all.includes(leak), false, leak);
    }
    assert.ok(mail.text.includes(`https://chatchat.test/#c=${dm}`));
    assert.equal(mail.idempotencyKey, rows[0]?.id);
    // Повторно минаване — нищо ново (идемпотентно).
    assert.equal((await processOutbox(deps(), later())).claimed, 0);

    // Ново известие, прочетено преди изпращането → SKIPPED.
    const list = await c.engineering.get(`/api/v1/conversations/${dm}/messages`);
    await c.engineering.post(`/api/v1/conversations/${dm}/read`, {
      messageId: list.body.messages.at(-1).id,
    });
    await say(c.support, dm, 'terzo');
    const unreadBefore = await c.engineering.get('/api/v1/notifications');
    await c.engineering.post('/api/v1/notifications/read', {
      ids: [unreadBefore.body.notifications[0].id],
    });
    const r2 = await processOutbox(deps(), later());
    assert.deepEqual([r2.sent, r2.skipped], [0, 1]);
    const skipped = await db.emailOutbox.findFirstOrThrow({ where: { status: 'SKIPPED' } });
    assert.equal(skipped.lastError, 'read');
  });

  test('при изпращане: MENTIONS само за споменаване; изключени имейли; изгубен достъп', async () => {
    const { c, users } = w;
    const group = await open(c.support, {
      type: 'GROUP',
      userIds: [users.engineering.id, users.owner.id, users.internal.id],
    });
    await say(c.support, group, 'per tutti');
    // Предпочитанието се сменя СЛЕД записа на реда — важи моментното.
    await c.engineering.patch(`/api/v1/conversations/${group}/preferences`, {
      notificationPref: 'MENTIONS',
    });
    await c.owner.patch('/api/v1/notifications/preferences', { emailEnabled: false });
    await del(c.support, `/api/v1/conversations/${group}/members/${users.internal.id}`);
    await processOutbox(deps(), later());
    const status = async (userId: string) =>
      (await db.emailOutbox.findFirstOrThrow({ where: { userId } })).lastError;
    assert.equal(await status(users.engineering.id), 'muted');
    assert.equal(await status(users.owner.id), 'disabled');
    assert.equal(await status(users.internal.id), 'no_access');
    assert.equal(mailer.sent.length, 0);

    // Споменаване при MENTIONS — тръгва.
    await say(c.support, group, 'guarda @Enzo Ingegnere');
    await processOutbox(deps(), later());
    assert.equal(mailer.sent.length, 1);
    assert.match(mailer.sent[0]?.subject ?? '', /menzione/);
  });

  test('тихи часове → отлагане без опит; 5xx/429 → повтор с отстъп; 4xx и таванът → FAILED', async () => {
    const { c, users } = w;
    const dm = await open(c.support, { type: 'DIRECT', userId: users.engineering.id });
    await say(c.support, dm, 'notte');
    // Тихи часове „цял ден без минута“ около момента на изпращане.
    const at = later();
    const local = new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Europe/Rome',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    }).format(at);
    const [hh, mm] = local.split(':').map(Number);
    const nowMin = (hh ?? 0) * 60 + (mm ?? 0);
    const hhmm = (m: number) =>
      `${String(Math.floor(m / 60) % 24).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
    await c.engineering.patch('/api/v1/notifications/preferences', {
      quietHours: { start: hhmm((nowMin + 1440 - 10) % 1440), end: hhmm((nowMin + 30) % 1440) },
    });
    const r = await processOutbox(deps(), at);
    assert.equal(r.deferred, 1);
    let row = await db.emailOutbox.findFirstOrThrow({ where: { userId: users.engineering.id } });
    assert.equal(row.status, 'PENDING');
    assert.equal(row.attempts, 0);
    assert.ok(row.notBefore.getTime() > at.getTime() + 20 * 60 * 1000);
    await c.engineering.patch('/api/v1/notifications/preferences', { quietHours: null });

    mailer.next = [
      { ok: false, retry: true, code: 'http_503' },
      { ok: false, retry: true, code: 'http_429' },
      { ok: false, retry: true, code: 'timeout' },
    ];
    let when = new Date(row.notBefore.getTime() + 1000);
    for (const expected of ['PENDING', 'PENDING', 'FAILED']) {
      await processOutbox(deps(), when);
      row = await db.emailOutbox.findFirstOrThrow({ where: { id: row.id } });
      assert.equal(row.status, expected);
      when = new Date(row.notBefore.getTime() + 1000);
    }
    assert.equal(row.attempts, 3);
    assert.equal(row.lastError, 'timeout');

    // Постоянна грешка (400) — веднага FAILED, без повтор.
    const dm2 = await open(c.owner, { type: 'DIRECT', userId: users.engineering.id });
    await say(c.owner, dm2, 'altro');
    mailer.next = [{ ok: false, retry: false, code: 'http_400' }];
    await processOutbox(deps(), later());
    const failed = await db.emailOutbox.findFirstOrThrow({ where: { lastError: 'http_400' } });
    assert.deepEqual([failed.status, failed.attempts], ['FAILED', 1]);
  });

  test('изоставен наем (срив по средата) → редът се взима отново; два изпращача — едно писмо', async () => {
    const { c, users } = w;
    const dm = await open(c.support, { type: 'DIRECT', userId: users.engineering.id });
    await say(c.support, dm, 'ciao');
    await db.emailOutbox.updateMany({
      data: { status: 'SENDING', lockedUntil: new Date(Date.now() - 1000), notBefore: new Date() },
    });
    const [a, b] = await Promise.all([processOutbox(deps()), processOutbox(deps())]);
    assert.equal(a.claimed + b.claimed, 1);
    assert.equal(mailer.sent.length, 1);
  });

  test('дайджест: веднъж на местен ден след часа; без непрочетено — пропуснат; без имена', async () => {
    const { c, users } = w;
    await c.engineering.patch('/api/v1/notifications/preferences', {
      digest: 'DAILY',
      timeZone: 'UTC',
    });
    const morning = new Date('2026-10-10T08:00:00Z');
    const night = new Date('2026-10-10T05:00:00Z');
    assert.equal(await scheduleDigests(deps(), night), 0);
    assert.equal(await scheduleDigests(deps(), morning), 1);
    assert.equal(await scheduleDigests(deps(), new Date('2026-10-10T20:00:00Z')), 0);
    // Нищо непрочетено → SKIPPED.
    await processOutbox(deps(), morning);
    assert.equal(
      (await db.emailOutbox.findFirstOrThrow({ where: { kind: 'DIGEST' } })).lastError,
      'nothing',
    );
    const dm = await open(c.support, { type: 'DIRECT', userId: users.engineering.id });
    await say(c.support, dm, 'uno');
    await say(c.support, dm, 'due');
    const nextDay = new Date('2026-10-11T08:00:00Z');
    assert.equal(await scheduleDigests(deps(), nextDay), 1);
    await processOutbox(deps(), nextDay);
    const digest = mailer.sent.find((m) => m.tag === 'DIGEST');
    assert.ok(digest);
    assert.match(digest.text, /2 messaggi non letti in 1 conversazioni/);
    assert.equal(digest.text.includes('Sara'), false);
  });

  test('без имейли (няма Brevo) → нито ред в outbox-а; известията в приложението остават', async () => {
    const off = await startApp({ diagnose: 'none' });
    try {
      const { c, users } = w;
      const support = c.support.withBase(off.base);
      const id = await open(support, { type: 'DIRECT', userId: users.engineering.id });
      await say(support, id, 'ciao');
      assert.equal(await db.emailOutbox.count(), 0);
      assert.equal(await db.notification.count({ where: { userId: users.engineering.id } }), 1);
      const prefs = await c.engineering.withBase(off.base).get('/api/v1/notifications');
      assert.equal(prefs.body.preferences.email.available, false);
    } finally {
      await off.close();
    }
  });
});
