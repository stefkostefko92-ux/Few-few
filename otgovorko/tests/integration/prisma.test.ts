import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { PrismaClient } from '@prisma/client';
import { PrismaTicketStore } from '../../src/tickets/prisma.js';
import { purgeExpired } from '../../src/tickets/retention.js';
import type { InboundMail } from '../../src/inbound/brevo.js';

/**
 * Истински PostgreSQL (миграциите вече пуснати с `prisma migrate deploy`). Пуска се само с TEST_DATABASE_URL,
 * чието име съдържа _test — тестът трие таблиците.
 */
const url = process.env.TEST_DATABASE_URL ?? '';
const enabled = /_test\b|_test$/.test(new URL(url || 'postgresql://x/none').pathname);
const KEY = Buffer.alloc(32, 6).toString('base64');
let db: PrismaClient;
let store: PrismaTicketStore;

const mail = (id: string): InboundMail => ({
  messageId: id,
  inReplyTo: null,
  fromAddress: 'maria.ivanova@firma.bg',
  fromName: 'Мария Иванова',
  subject: 'Двойно таксуване по фактура 1042',
  text: 'Здравейте, таксувахте ме два пъти. IBAN BG80BNBG96611020345678.',
  spamScore: 0,
  attachments: [{ name: 'razpechatka.pdf', contentType: 'application/pdf', size: 1000 }],
});

before(async () => {
  if (!enabled) return;
  db = new PrismaClient({ datasourceUrl: url });
  await db.$executeRawUnsafe('TRUNCATE "Owner","Ticket","Sample","Setting"');
  store = new PrismaTicketStore(db, KEY);
});

after(async () => {
  if (enabled) await db.$disconnect();
});

test('в CI интеграционната база е задължителна', () => {
  if (process.env.CI) assert.ok(enabled, 'TEST_DATABASE_URL липсва или името няма _test');
});

test(
  'в базата няма открит текст: подател, тема, писмо и чернова са шифровани',
  { skip: !enabled },
  async () => {
    const { id, created } = await store.saveInbound(mail('<int-1@x>'), 'payment', new Date());
    assert.equal(created, true);
    assert.equal(
      (await store.saveInbound(mail('<int-1@x>'), 'payment', new Date())).created,
      false,
      'идемпотентно',
    );
    const claimed = await store.claimNext(new Date());
    assert.equal(claimed?.id, id);
    await store.setDraft(id, 'Здравейте, Мария! Проверяваме.', new Date());
    const raw = JSON.stringify(await db.$queryRawUnsafe('SELECT * FROM "Ticket"'));
    for (const plain of [
      'maria.ivanova',
      'Мария',
      'таксувахте',
      'BG80BNBG',
      'Двойно',
      'Проверяваме',
      '<int-1@x>',
      'razpechatka',
    ]) {
      assert.ok(!raw.includes(plain), `в базата има открит „${plain}“`);
    }
    const t = (await store.get(id))!;
    assert.equal(t.from.address, 'maria.ivanova@firma.bg');
    assert.equal(t.draft, 'Здравейте, Мария! Проверяваме.');
    assert.equal(t.status, 'drafted');
  },
);

test('пратено само веднъж; срокът трие и черновата', { skip: !enabled }, async () => {
  const { id } = await store.saveInbound(
    mail('<int-2@x>'),
    'question',
    new Date('2026-01-01T00:00:00Z'),
  );
  assert.equal(await store.markSent(id, 'отговор', 'h', new Date()), true);
  assert.equal(await store.markSent(id, 'отговор', 'h', new Date()), false);
  assert.equal(await purgeExpired(store, new Date('2026-11-27T00:00:00Z'), 180), 1);
  assert.equal(await store.get(id), null);
});

test('двама работници не взимат един и същ билет', { skip: !enabled }, async () => {
  await db.$executeRawUnsafe('TRUNCATE "Ticket"');
  await store.saveInbound(mail('<int-3@x>'), 'question', new Date());
  const [a, b] = await Promise.all([store.claimNext(new Date()), store.claimNext(new Date())]);
  assert.equal([a, b].filter(Boolean).length, 1);
});

test(
  'failDraft: 3 неуспеха → draft_failed; затворен по време на черновата остава затворен; образците се трият по срока',
  { skip: !enabled },
  async () => {
    await db.$executeRawUnsafe('TRUNCATE "Ticket","Sample"');
    const { id } = await store.saveInbound(mail('<int-4@x>'), 'question', new Date());
    for (let i = 0; i < 3; i++) {
      assert.equal((await store.claimNext(new Date()))?.id, id);
      await store.failDraft(id, 3);
    }
    const t = (await store.get(id))!;
    assert.equal(t.status, 'draft_failed');
    assert.equal(t.attempts, 3);
    const b = await store.saveInbound(mail('<int-5@x>'), 'question', new Date());
    await store.claimNext(new Date());
    await store.setStatus(b.id, 'closed');
    await store.failDraft(b.id, 3);
    assert.equal((await store.get(b.id))!.status, 'closed');
    await store.addSample('стар', new Date('2026-01-01T00:00:00Z'));
    await store.addSample('нов', new Date());
    await purgeExpired(store, new Date(), 180);
    assert.deepEqual(
      (await store.samples(10)).map((s) => s.text),
      ['нов'],
    );
  },
);
