// Дефект 1 (ядро: пари): еднократен промо код не бива да дава N продажби с
// отстъпка. Ползването се резервира атомарно при старт на checkout-а,
// освобождава се идемпотентно при незавършена сесия и не се брои втори път.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  COUPON_RESERVATION_KEY,
  MAX_HELD_PER_CLIENT,
  NULL_SESSION_RELEASE_MS,
  STALE_RESERVATION_MS,
  applyCouponStep,
  couponClientKey,
  couponStepForEvent,
  reserveCouponForCheckout,
  reservedCheckoutExpiresAt,
  staleReservationAction,
  sweepStaleReservations,
  type CouponLedger,
} from '../coupon-reservation';
import { CouponLedgerModel } from './coupon-model';

const COMPLETED = 'checkout.session.completed';
const ASYNC_OK = 'checkout.session.async_payment_succeeded';
const EXPIRED = 'checkout.session.expired';
const ASYNC_FAILED = 'checkout.session.async_payment_failed';

function ledgerWith(max: number | null, times = 0): CouponLedgerModel {
  const l = new CouponLedgerModel();
  l.addCoupon('cpn_1', max, times);
  return l;
}

let sessionSeq = 0;
const okCreate = async (reservationId: string) => ({
  id: `cs_${++sessionSeq}`,
  metadata: { [COUPON_RESERVATION_KEY]: reservationId },
});

async function reserveId(l: CouponLedgerModel, client: string | null = null): Promise<string> {
  const r = await reserveCouponForCheckout(l, 'cpn_1', client, okCreate);
  assert.ok(r.ok);
  return r.ok ? r.reservationId : '';
}

async function deliver(
  l: CouponLedgerModel,
  type: string,
  metadata: Record<string, string>,
  opts: { paid?: boolean; firstRecord?: boolean } = {},
): Promise<void> {
  const step = couponStepForEvent(type, metadata, {
    paid: opts.paid ?? true,
    firstRecord: opts.firstRecord ?? true,
  });
  await applyCouponStep(l, step, 'cs_1');
}

const meta = (id: string) => ({ kind: 'shop', couponId: 'cpn_1', [COUPON_RESERVATION_KEY]: id });

// КП1: двата конкурентни checkout-а с maxRedemptions=1 → втората резервация отказана.
test('CR1 два конкурентни checkout-а с maxRedemptions=1: само единият резервира', async () => {
  const l = ledgerWith(1);
  let sessions = 0;
  const create = async (reservationId: string) => {
    await Promise.resolve();
    sessions += 1;
    return { id: `cs_${sessions}`, reservationId };
  };
  const results = await Promise.all([
    reserveCouponForCheckout(l, 'cpn_1', 'a', create),
    reserveCouponForCheckout(l, 'cpn_1', 'b', create),
  ]);
  assert.equal(results.filter((r) => r.ok).length, 1);
  assert.deepEqual(
    results.filter((r) => !r.ok).map((r) => (r.ok ? null : r.reason)),
    ['exhausted'],
  );
  assert.equal(sessions, 1, 'без Stripe сесия при отказана резервация');
  assert.equal(l.times('cpn_1'), 1);
});

test('CR1b код без лимит резервира винаги', async () => {
  const l = ledgerWith(null);
  const r = await Promise.all(
    ['a', 'b', 'c'].map((c) => reserveCouponForCheckout(l, 'cpn_1', c, okCreate)),
  );
  assert.ok(r.every((x) => x.ok));
  assert.equal(l.times('cpn_1'), 3);
});

// КП5 + №2(а): след create id-то на сесията се записва в резервацията.
test('CR5 успешна сесия: резервацията получава session.id', async () => {
  const l = ledgerWith(1);
  const r = await reserveCouponForCheckout(l, 'cpn_1', null, okCreate);
  assert.ok(r.ok);
  const id = r.ok ? r.reservationId : '';
  assert.equal(l.reservations.get(id)?.sessionId, r.ok ? r.value.id : '');
  assert.equal(l.status(id), 'HELD');
});

test('CR5b провалена Stripe сесия връща резервацията и пази грешката от create', async () => {
  const l = ledgerWith(1);
  const boom = new Error('stripe down');
  const r = await reserveCouponForCheckout(l, 'cpn_1', null, async () => {
    throw boom;
  });
  assert.equal(r.ok, false);
  assert.ok(!r.ok && r.reason === 'create-failed');
  assert.equal(r.error, boom);
  assert.equal(l.times('cpn_1'), 0);
  assert.equal((await reserveCouponForCheckout(l, 'cpn_1', null, okCreate)).ok, true);
});

// №2(б): хвърляне от release в catch не маскира грешката от create.
test('CR5c release хвърля в catch → пак create-failed с грешката от create', async () => {
  const l = ledgerWith(1);
  const failing: CouponLedger = {
    ...methodsOf(l),
    release: async () => {
      throw new Error('db down');
    },
  };
  const boom = new Error('stripe down');
  const r = await reserveCouponForCheckout(failing, 'cpn_1', null, async () => {
    throw boom;
  });
  assert.ok(!r.ok && r.reason === 'create-failed');
  assert.equal(r.error, boom);
  assert.equal(r.releaseError instanceof Error, true);
});

test('CR5d провален attachSession не проваля checkout-а (sweep го покрива)', async () => {
  const l = ledgerWith(1);
  const failing: CouponLedger = {
    ...methodsOf(l),
    attachSession: async () => {
      throw new Error('db blip');
    },
  };
  const r = await reserveCouponForCheckout(failing, 'cpn_1', null, okCreate);
  assert.equal(r.ok, true);
});

function methodsOf(l: CouponLedgerModel): CouponLedger {
  return {
    reserve: l.reserve.bind(l),
    attachSession: l.attachSession.bind(l),
    release: l.release.bind(l),
    consume: l.consume.bind(l),
    countLegacy: l.countLegacy.bind(l),
    listStaleHeld: l.listStaleHeld.bind(l),
  };
}

// №3: таван на HELD резервациите за (код, клиент).
test('CR7 един клиент държи най-много MAX_HELD_PER_CLIENT резервации на код', async () => {
  const l = ledgerWith(10);
  const results = [];
  for (let i = 0; i < 5; i++) {
    results.push(await reserveCouponForCheckout(l, 'cpn_1', 'client_x', okCreate));
  }
  assert.equal(results.filter((r) => r.ok).length, MAX_HELD_PER_CLIENT);
  assert.ok(results.slice(MAX_HELD_PER_CLIENT).every((r) => !r.ok && r.reason === 'client-limit'));
  assert.equal(l.times('cpn_1'), MAX_HELD_PER_CLIENT, 'отказаната не вдига брояча');
  // друг клиент не е засегнат
  assert.equal((await reserveCouponForCheckout(l, 'cpn_1', 'client_y', okCreate)).ok, true);
});

test('CR7b освободена резервация освобождава и мястото на клиента', async () => {
  const l = ledgerWith(10);
  const a = await reserveId(l, 'client_x');
  await reserveId(l, 'client_x');
  await deliver(l, EXPIRED, meta(a));
  assert.equal((await reserveCouponForCheckout(l, 'cpn_1', 'client_x', okCreate)).ok, true);
});

test('CR7c клиентският ключ е HMAC: детерминиран, без суровия IP, зависи от кода и тайната', () => {
  const k = couponClientKey('203.0.113.7', 'cpn_1', 's3');
  assert.equal(k, couponClientKey('203.0.113.7', 'cpn_1', 's3'));
  assert.match(k, /^[0-9a-f]{32}$/);
  assert.ok(!k.includes('203'));
  assert.notEqual(k, couponClientKey('203.0.113.7', 'cpn_2', 's3'));
  assert.notEqual(k, couponClientKey('203.0.113.7', 'cpn_1', 'other'));
  assert.notEqual(k, couponClientKey('203.0.113.8', 'cpn_1', 's3'));
});

// Ревю (Кодаджията, 02.11.2026, M1): IPv6 клиент има цяла /64 мрежа — ключ по целия адрес се сменя на
// всяка заявка и таванът не го спира. Ключът е по /64 префикса; IPv4-mapped = IPv4.
test('CR7d IPv6: ключът е по /64 префикса; IPv4-mapped съвпада с IPv4', () => {
  const key = (ip: string) => couponClientKey(ip, 'cpn_1', 's3');
  assert.equal(key('2001:db8:1:2::1'), key('2001:db8:1:2:ffff:ee:dd:cc'), 'една /64 — един клиент');
  assert.equal(key('2001:db8:1:2::1'), key('2001:0DB8:0001:0002:0:0:0:9'), 'нотацията не сменя ключа');
  assert.equal(key('2001:db8:1:2::1%eth0'), key('2001:db8:1:2::1'), 'zone id се маха');
  assert.notEqual(key('2001:db8:1:2::1'), key('2001:db8:1:3::1'), 'друга /64 — друг клиент');
  assert.equal(key('::ffff:203.0.113.7'), key('203.0.113.7'));
  assert.notEqual(key('203.0.113.7'), key('203.0.113.8'), 'IPv4 остава по адрес');
});

// КП2: expired → освобождава веднъж при двойна доставка.
test('CR2 checkout.session.expired освобождава веднъж при двойна доставка', async () => {
  const l = ledgerWith(1);
  const id = await reserveId(l);
  await deliver(l, EXPIRED, meta(id));
  await deliver(l, EXPIRED, meta(id));
  assert.equal(l.times('cpn_1'), 0);
  assert.equal(l.status(id), 'RELEASED');
});

test('CR2b паралелна двойна доставка на expired освобождава веднъж', async () => {
  const l = ledgerWith(2);
  const id = await reserveId(l);
  await reserveId(l);
  await Promise.all([deliver(l, EXPIRED, meta(id)), deliver(l, EXPIRED, meta(id))]);
  assert.equal(l.times('cpn_1'), 1, 'другата резервация остава');
});

test('CR2c async_payment_failed освобождава; повторното е no-op', async () => {
  const l = ledgerWith(1);
  const id = await reserveId(l);
  await deliver(l, COMPLETED, meta(id), { paid: false });
  assert.equal(l.status(id), 'HELD', 'completed с unpaid не пипа резервацията');
  await deliver(l, ASYNC_FAILED, meta(id), { paid: false });
  await deliver(l, ASYNC_FAILED, meta(id), { paid: false });
  assert.equal(l.times('cpn_1'), 0);
});

// КП3: завършена сесия с резервация не брои втори път.
test('CR3 completed с резервация не брои пак (и при повторна доставка)', async () => {
  const l = ledgerWith(1);
  const id = await reserveId(l);
  await deliver(l, COMPLETED, meta(id), { firstRecord: true });
  await deliver(l, COMPLETED, meta(id), { firstRecord: false });
  await deliver(l, ASYNC_OK, meta(id), { firstRecord: false });
  assert.equal(l.times('cpn_1'), 1);
  assert.equal(l.status(id), 'CONSUMED');
  await deliver(l, EXPIRED, meta(id));
  assert.equal(l.times('cpn_1'), 1, 'закъсняло expired не освобождава консумирана');
});

test('CR3b платена сесия след освободена резервация се брои точно веднъж', async () => {
  const l = ledgerWith(1);
  const id = await reserveId(l);
  await l.release(id);
  await deliver(l, COMPLETED, meta(id));
  await deliver(l, COMPLETED, meta(id), { firstRecord: false });
  assert.equal(l.times('cpn_1'), 1);
});

// КП4: стара сесия без маркер → брои както досега.
test('CR4 заварена сесия без маркер се брои при първия запис (както досега)', async () => {
  const l = ledgerWith(1);
  const legacy = { kind: 'shop', couponId: 'cpn_1', couponCode: 'X' };
  await deliver(l, COMPLETED, legacy, { firstRecord: true });
  await deliver(l, COMPLETED, legacy, { firstRecord: false });
  assert.equal(l.times('cpn_1'), 1);
  await deliver(l, EXPIRED, legacy);
  assert.equal(l.times('cpn_1'), 1);
});

test('CR4b без код и без маркер — нищо', () => {
  for (const type of [COMPLETED, EXPIRED, ASYNC_FAILED]) {
    assert.deepEqual(
      couponStepForEvent(type, { kind: 'shop', couponId: '' }, { paid: true, firstRecord: true }),
      { action: 'none' },
    );
  }
  assert.deepEqual(couponStepForEvent(COMPLETED, null, { paid: true, firstRecord: true }), {
    action: 'none',
  });
});

// КП6: кратък expires_at (Stripe: 30 мин–24 ч след създаване).
test('CR6 expires_at на сесия с резервация е между 30 мин и 1 ч', () => {
  const now = Date.UTC(2026, 10, 2, 12, 0, 0);
  const delta = reservedCheckoutExpiresAt(now) - Math.floor(now / 1000);
  assert.ok(delta > 30 * 60 && delta <= 60 * 60, `${delta}s`);
  assert.ok(STALE_RESERVATION_MS > delta * 1000, 'sweep прагът е след изтичането на сесията');
});

// №2(в): почистване на застояли HELD резервации.
test('CS1 решение по сесия: без сесия/expired → release; complete+paid → consume; иначе keep', () => {
  assert.equal(staleReservationAction(null), 'release');
  assert.equal(staleReservationAction({ status: 'expired', payment_status: 'unpaid' }), 'release');
  assert.equal(staleReservationAction({ status: 'complete', payment_status: 'paid' }), 'consume');
  assert.equal(staleReservationAction({ status: 'complete', payment_status: 'unpaid' }), 'keep');
  assert.equal(staleReservationAction({ status: 'open', payment_status: 'unpaid' }), 'keep');
});

async function staleSetup() {
  const l = ledgerWith(10);
  const noSession = (await l.reserve('cpn_1', null)) as { id: string };
  const expired = await reserveId(l);
  const paid = await reserveId(l);
  const processing = await reserveId(l);
  const sessions: Record<string, { status: string; payment_status: string }> = {
    [l.reservations.get(expired)!.sessionId!]: { status: 'expired', payment_status: 'unpaid' },
    [l.reservations.get(paid)!.sessionId!]: { status: 'complete', payment_status: 'paid' },
    [l.reservations.get(processing)!.sessionId!]: { status: 'complete', payment_status: 'unpaid' },
  };
  return { l, ids: { noSession: noSession.id, expired, paid, processing }, sessions };
}

test('CS2 sweep: трите пътя + keep; повторният sweep е no-op', async () => {
  const { l, ids, sessions } = await staleSetup();
  assert.equal(l.times('cpn_1'), 4);
  // След 72 ч — и резервацията без сесия е уредима (прозорецът 2–72 ч е в CS5).
  const later = new Date(l.now.getTime() + NULL_SESSION_RELEASE_MS + 1);
  const out = await sweepStaleReservations(l, async (sid) => sessions[sid]!, {
    now: later,
    apply: true,
  });
  const byId = Object.fromEntries(out.map((o) => [o.id, o.action]));
  assert.deepEqual(byId, {
    [ids.noSession]: 'release',
    [ids.expired]: 'release',
    [ids.paid]: 'consume',
    [ids.processing]: 'keep',
  });
  assert.equal(l.status(ids.noSession), 'RELEASED');
  assert.equal(l.status(ids.expired), 'RELEASED');
  assert.equal(l.status(ids.paid), 'CONSUMED');
  assert.equal(l.status(ids.processing), 'HELD');
  assert.equal(l.times('cpn_1'), 2, 'платената + обработваната остават броени');
  await sweepStaleReservations(l, async (sid) => sessions[sid]!, { now: later, apply: true });
  assert.equal(l.times('cpn_1'), 2, 'повторен sweep не освобождава втори път');
});

test('CS3 sweep: пресни резервации не се пипат; dry-run не пише', async () => {
  const { l, sessions } = await staleSetup();
  const fresh = await sweepStaleReservations(l, async (sid) => sessions[sid]!, {
    now: new Date(l.now.getTime() + 60_000),
    apply: true,
  });
  assert.deepEqual(fresh, []);
  const dry = await sweepStaleReservations(l, async (sid) => sessions[sid]!, {
    now: new Date(l.now.getTime() + STALE_RESERVATION_MS + 1),
    apply: false,
  });
  assert.equal(dry.length, 4);
  assert.equal(l.times('cpn_1'), 4, 'dry-run не променя брояча');
});

test('CS4 sweep: грешка от Stripe → keep с грешка, без release (fail-safe)', async () => {
  const { l, ids } = await staleSetup();
  const out = await sweepStaleReservations(
    l,
    async () => {
      throw new Error('stripe 500');
    },
    { now: new Date(l.now.getTime() + STALE_RESERVATION_MS + 1), apply: true },
  );
  const expired = out.find((o) => o.id === ids.expired)!;
  assert.equal(expired.action, 'keep');
  assert.ok(expired.error);
  assert.equal(l.status(ids.expired), 'HELD');
});

// Ревю (L1): без session.id (attachSession се е провалил) сесията може да е платена, а webhook-ът да
// закъснее — Stripe опитва до 3 дни. Затова такава резервация се освобождава едва след 72 ч.
test('CS5 sweep: HELD без сесия се пази до 72 ч, после се освобождава', async () => {
  const { l, ids, sessions } = await staleSetup();
  const at = (ms: number) => new Date(l.now.getTime() + ms);
  const early = await sweepStaleReservations(l, async (sid) => sessions[sid]!, {
    now: at(STALE_RESERVATION_MS + 1),
    apply: true,
  });
  assert.equal(early.find((o) => o.id === ids.noSession)!.action, 'keep');
  assert.equal(l.status(ids.noSession), 'HELD');
  assert.equal(l.status(ids.expired), 'RELEASED', 'резервациите със сесия се уреждат както досега');
  await sweepStaleReservations(l, async (sid) => sessions[sid]!, {
    now: at(NULL_SESSION_RELEASE_MS + 1),
    apply: true,
  });
  assert.equal(l.status(ids.noSession), 'RELEASED');
});

// Ревю (L2): грешка от базата при един ред не спира sweep-а за останалите.
test('CS6 sweep: грешка при запис на един ред се записва и sweep-ът продължава', async () => {
  const { l, ids, sessions } = await staleSetup();
  const ledger = methodsOf(l);
  const failing: CouponLedger = {
    ...ledger,
    release: async (id, sid) => {
      if (id === ids.expired) throw new Error('db down');
      return ledger.release(id, sid);
    },
  };
  const out = await sweepStaleReservations(failing, async (sid) => sessions[sid]!, {
    now: new Date(l.now.getTime() + NULL_SESSION_RELEASE_MS + 1),
    apply: true,
  });
  const byId = Object.fromEntries(out.map((o) => [o.id, o]));
  assert.equal(byId[ids.expired]!.error, 'db down');
  assert.equal(l.status(ids.expired), 'HELD');
  assert.equal(l.status(ids.paid), 'CONSUMED', 'следващите редове са обработени');
  assert.equal(l.status(ids.noSession), 'RELEASED');
});
