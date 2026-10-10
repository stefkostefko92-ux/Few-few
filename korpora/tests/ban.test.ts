import { test } from 'node:test';
import assert from 'node:assert/strict';
import { translatorFor } from '../src/i18n.js';
import { viewHelpers } from '../src/http/view.js';
import { extendedAfterMistake } from '../src/plans/ban.js';
import { auditDetail } from '../src/services/audit-detail.js';

const DAY = 86_400_000;
const banned = new Date('2026-10-01T09:30:00Z');
const lifted = new Date('2026-10-11T17:45:12.345Z');
const lasted = lifted.getTime() - banned.getTime();

test('a mistaken ban gives back exactly the time it lasted: trial and Premium', () => {
  for (const plan of ['TRIAL', 'PREMIUM'] as const) {
    const ends = new Date(banned.getTime() + 20 * DAY);
    const until = extendedAfterMistake({ plan, planExpiresAt: ends }, banned, lifted);
    assert.equal(until?.getTime(), ends.getTime() + lasted, plan);
    // what was left at the moment of the ban is left again after the lift
    assert.equal(until!.getTime() - lifted.getTime(), ends.getTime() - banned.getTime(), plan);
  }
});

test('a plan that ran out during the ban gets back what was left when it started', () => {
  const ends = new Date(banned.getTime() + 2 * DAY);
  const until = extendedAfterMistake({ plan: 'PREMIUM', planExpiresAt: ends }, banned, lifted);
  assert.equal(until!.getTime() - lifted.getTime(), 2 * DAY);
});

test('nothing to extend: Lifetime, a period not started, a period over before the ban', () => {
  const ends = new Date(banned.getTime() + 20 * DAY);
  assert.equal(
    extendedAfterMistake({ plan: 'LIFETIME', planExpiresAt: null }, banned, lifted),
    null,
  );
  assert.equal(
    extendedAfterMistake({ plan: 'LIFETIME', planExpiresAt: ends }, banned, lifted),
    null,
  );
  assert.equal(extendedAfterMistake({ plan: 'TRIAL', planExpiresAt: null }, banned, lifted), null);
  for (const over of [banned, new Date(banned.getTime() - DAY)])
    assert.equal(
      extendedAfterMistake({ plan: 'PREMIUM', planExpiresAt: over }, banned, lifted),
      null,
    );
  assert.equal(
    extendedAfterMistake({ plan: 'PREMIUM', planExpiresAt: ends }, banned, banned),
    null,
  );
});

test('the audit reads a lifted ban: the mark and the extension as words', () => {
  const fmt = viewHelpers('bg');
  const format = {
    t: translatorFor('bg'),
    date: (d: Date) => fmt.date(d),
    projectName: () => null,
  };
  assert.deepEqual(
    auditDetail(
      'admin.account.unbanned',
      { mistake: true, from: '2026-10-21T09:30:00.000Z', until: '2026-10-31T17:45:12.345Z' },
      format,
    ),
    ['блокирането е било грешка', 'планът е удължен: 21 октомври 2026 г. → 31 октомври 2026 г.'],
  );
  assert.deepEqual(auditDetail('admin.account.unbanned', { mistake: false }, format), []);
});
