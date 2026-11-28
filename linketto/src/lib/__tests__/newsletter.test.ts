import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildSubscribersCsv,
  generateSubscriberToken,
  isValidEmail,
  normalizeEmail,
} from '../newsletter';

test('normalizeEmail: малки букви + тримване', () => {
  assert.equal(normalizeEmail('  Maria@Example.COM '), 'maria@example.com');
});

test('isValidEmail', () => {
  assert.equal(isValidEmail('a@b.co'), true);
  assert.equal(isValidEmail('no-at'), false);
  assert.equal(isValidEmail('a@b'), false);
  assert.equal(isValidEmail('a b@c.de'), false);
});

test('generateSubscriberToken: 32 hex, различни', () => {
  const a = generateSubscriberToken();
  const b = generateSubscriberToken();
  assert.match(a, /^[0-9a-f]{32}$/);
  assert.notEqual(a, b);
});

test('buildSubscribersCsv: заглавие + екраниране', () => {
  const csv = buildSubscribersCsv([
    {
      email: 'a@b.co',
      locale: 'bg',
      confirmedAt: new Date('2026-07-09T00:00:00Z'),
      createdAt: new Date('2026-07-01T00:00:00Z'),
    },
    {
      email: 'weird,"@x.co',
      locale: null,
      confirmedAt: null,
      createdAt: new Date('2026-07-02T00:00:00Z'),
    },
  ]);
  const lines = csv.trim().split('\r\n');
  assert.equal(lines[0], 'email,locale,confirmed_at,created_at');
  assert.equal(
    lines[1],
    'a@b.co,bg,2026-07-09T00:00:00.000Z,2026-07-01T00:00:00.000Z',
  );
  // запетая и кавичка → цялата клетка в кавички, вътрешните удвоени
  assert.equal(
    lines[2],
    '"weird,""@x.co",,,2026-07-02T00:00:00.000Z',
  );
});

test('buildSubscribersCsv: неутрализира формула-водещи знаци (= + - @)', () => {
  const csv = buildSubscribersCsv([
    {
      email: '=HYPERLINK("http://evil")@x.co',
      locale: null,
      confirmedAt: null,
      createdAt: new Date('2026-07-02T00:00:00Z'),
    },
    {
      email: '+summon@x.co',
      locale: null,
      confirmedAt: null,
      createdAt: new Date('2026-07-02T00:00:00Z'),
    },
  ]);
  const lines = csv.trim().split('\r\n');
  // водещ апостроф пречи на Excel/Sheets да изпълнят клетката като формула
  assert.ok(lines[1].startsWith(`"'=HYPERLINK(`));
  assert.ok(lines[2].startsWith(`'+summon@x.co`));
});

test('писмото за потвърждение: темата е без името на профила (текст от нападателя)', async () => {
  // Разбивача т. 5: „Акаунтът ви е блокиран — посетете …“ като име на профил не бива да е в темата.
  const { subscribeConfirmSubject } = await import('../email');
  for (const locale of ['bg', 'en', 'it', 'es', 'de', 'fr', 'fi']) {
    const subject = subscribeConfirmSubject('Акаунтът ви е блокиран — посетете evil.example', locale);
    assert.ok(!subject.includes('evil.example'), `${locale}: ${subject}`);
    assert.ok(subject.includes('Linketto'), `${locale}: ${subject}`);
  }
});

test('рассылка: най-много 1 на 24 часа на профил', async () => {
  const { broadcastAllowed, BROADCAST_COOLDOWN_MS } = await import('../newsletter');
  const now = Date.UTC(2026, 10, 21, 12);
  assert.equal(broadcastAllowed(null, now), true);
  assert.equal(broadcastAllowed(new Date(now - BROADCAST_COOLDOWN_MS + 60_000), now), false);
  assert.equal(broadcastAllowed(new Date(now - BROADCAST_COOLDOWN_MS - 1), now), true);
  assert.equal(BROADCAST_COOLDOWN_MS, 24 * 60 * 60_000);
});
