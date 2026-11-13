import assert from 'node:assert/strict';
import { test } from 'node:test';
import { prorationCredit } from '../src/billing/proration.js';

/**
 * Прихващане при смяна на план (решение на собственика, 13.11.2026): неизползваната част от платеното
 * (основата без ДДС), пропорционално на оставащото време, в цели центове надолу — без float.
 */
const day = 86_400_000;
const start = new Date('2026-11-01T00:00:00Z');

test('половин период → половината основа; надолу до цент', () => {
  const end = new Date(start.getTime() + 30 * day);
  assert.equal(
    prorationCredit({ paidNetCents: 900, start, end, now: new Date(start.getTime() + 15 * day) }),
    450,
  );
  assert.equal(
    prorationCredit({ paidNetCents: 1000, start, end, now: new Date(start.getTime() + 10 * day) }),
    666,
  );
});

test('изтекъл или удължен (започва в бъдещето) период; огромни суми без загуба на точност', () => {
  const end = new Date(start.getTime() + 365 * day);
  assert.equal(prorationCredit({ paidNetCents: 29000, start, end, now: end }), 0);
  assert.equal(
    prorationCredit({ paidNetCents: 29000, start, end, now: new Date(end.getTime() + day) }),
    0,
  );
  // Удължен абонамент: периодът започва утре — оставащото включва и днешния ден от предишното плащане.
  assert.equal(
    prorationCredit({ paidNetCents: 29000, start, end, now: new Date(start.getTime() - day) }),
    29079,
  );
  assert.equal(
    prorationCredit({
      paidNetCents: 9_000_000_000,
      start,
      end,
      now: new Date(start.getTime() + 73 * day),
    }),
    7_200_000_000,
  );
});
