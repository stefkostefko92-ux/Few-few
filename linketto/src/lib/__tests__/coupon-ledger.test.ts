// №4 (Кодаджията): условните записи в coupon-ledger.ts срещу mock на Prisma,
// който ИЗПЪЛНЯВА условията от SQL/WHERE (не ги приема на доверие) — махнат
// лимит, махнат `status: 'HELD'` или махнат клон RELEASED→CONSUMED променят
// резултата и тестът пада.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createCouponLedger, type LedgerDb, type LedgerTx } from '../coupon-ledger';
import { MAX_HELD_PER_CLIENT, type StaleReservation } from '../coupon-reservation';

interface Row {
  active: boolean;
  expiresAt: Date | null;
  maxRedemptions: number | null;
  timesRedeemed: number;
}
interface Res {
  id: string;
  couponId: string;
  status: string;
  stripeSessionId: string | null;
  clientKey: string | null;
  createdAt: Date;
  settledAt: Date | null;
}

class MockDb implements LedgerDb {
  coupons = new Map<string, Row>();
  res = new Map<string, Res>();
  sql: string[] = [];
  now = new Date('2026-11-02T12:00:00Z');
  private seq = 0;

  addCoupon(id: string, over: Partial<Row> = {}): void {
    this.coupons.set(id, {
      active: true,
      expiresAt: null,
      maxRedemptions: null,
      timesRedeemed: 0,
      ...over,
    });
  }

  // Минимален интерпретатор на ползваните UPDATE-и: всяко условие в текста се
  // проверява; непознат SQL хвърля.
  async $executeRaw(strings: TemplateStringsArray, ...values: unknown[]): Promise<number> {
    const text = strings.join('$');
    this.sql.push(text);
    const m = /^UPDATE "Coupon" SET "timesRedeemed" = "timesRedeemed" ([+-]) 1 WHERE "id" = \$(.*)$/.exec(text);
    if (!m) throw new Error(`unexpected SQL: ${text}`);
    const rest = m[2];
    const known = [
      ' AND "active" = true',
      ' AND ("expiresAt" IS NULL OR "expiresAt" > NOW())',
      ' AND ("maxRedemptions" IS NULL OR "timesRedeemed" < "maxRedemptions")',
      ' AND "timesRedeemed" > 0',
    ];
    let leftover = rest;
    for (const k of known) leftover = leftover.replace(k, '');
    if (leftover !== '') throw new Error(`unexpected SQL clause: ${leftover}`);
    const row = this.coupons.get(String(values[0]));
    if (!row) return 0;
    if (rest.includes('"active" = true') && !row.active) return 0;
    if (rest.includes('"expiresAt" > NOW()') && row.expiresAt && row.expiresAt <= this.now) return 0;
    if (
      rest.includes('"timesRedeemed" < "maxRedemptions"') &&
      row.maxRedemptions !== null &&
      row.timesRedeemed >= row.maxRedemptions
    ) {
      return 0;
    }
    if (rest.includes('"timesRedeemed" > 0') && row.timesRedeemed <= 0) return 0;
    row.timesRedeemed += m[1] === '+' ? 1 : -1;
    return 1;
  }

  private matches(r: Res, where: Record<string, unknown>): boolean {
    return Object.entries(where).every(([k, v]) => {
      if (k === 'createdAt') return r.createdAt < (v as { lt: Date }).lt;
      return (r as unknown as Record<string, unknown>)[k] === v;
    });
  }

  couponReservation: LedgerTx['couponReservation'] = {
    create: async ({ data }) => {
      const id = `res_${++this.seq}`;
      this.res.set(id, {
        id,
        couponId: data.couponId,
        clientKey: data.clientKey,
        status: 'HELD',
        stripeSessionId: null,
        createdAt: this.now,
        settledAt: null,
      });
      return { id };
    },
    count: async ({ where }) =>
      [...this.res.values()].filter((r) => this.matches(r, where)).length,
    updateMany: async ({ where, data }) => {
      let count = 0;
      for (const r of this.res.values()) {
        if (this.matches(r, where)) {
          Object.assign(r, data);
          count += 1;
        }
      }
      return { count };
    },
    findUnique: async ({ where }) => {
      const r = this.res.get(where.id);
      return r ? { couponId: r.couponId } : null;
    },
    // Огледало на Prisma select: връща САМО избраните полета (L7 проверява, че createdAt е избран).
    findMany: async ({ where, take, select }) =>
      [...this.res.values()]
        .filter((r) => this.matches(r, where))
        .slice(0, take)
        .map((r) => {
          const row = r as unknown as Record<string, unknown>;
          const picked = Object.entries(select as Record<string, boolean>)
            .filter(([, on]) => on)
            .map(([k]) => [k, row[k]]);
          return Object.fromEntries(picked) as unknown as StaleReservation;
        }),
  };

  // Транзакция: при хвърляне всичко се връща (огледало на ROLLBACK).
  async $transaction<T>(fn: (tx: LedgerTx) => Promise<T>): Promise<T> {
    const snapC = new Map([...this.coupons].map(([k, v]) => [k, { ...v }]));
    const snapR = new Map([...this.res].map(([k, v]) => [k, { ...v }]));
    try {
      return await fn(this);
    } catch (error) {
      this.coupons = snapC;
      this.res = snapR;
      throw error;
    }
  }
}

function setup(over: Partial<Row> = {}) {
  const db = new MockDb();
  db.addCoupon('cpn_1', over);
  return { db, ledger: createCouponLedger(db), times: () => db.coupons.get('cpn_1')!.timesRedeemed };
}

test('L1 reserve: условен инкремент под лимита (лимит 1 → втората изчерпана)', async () => {
  const { db, ledger, times } = setup({ maxRedemptions: 1 });
  const a = await ledger.reserve('cpn_1', null);
  const b = await ledger.reserve('cpn_1', null);
  assert.ok('id' in a);
  assert.deepEqual(b, { refused: 'exhausted' });
  assert.equal(times(), 1);
  assert.equal(db.res.size, 1, 'без запис при отказ');
  assert.ok(db.sql[0].includes('"maxRedemptions" IS NULL OR "timesRedeemed" < "maxRedemptions"'));
});

test('L1b reserve: неактивен или изтекъл код → изчерпан', async () => {
  const inactive = setup({ active: false });
  assert.deepEqual(await inactive.ledger.reserve('cpn_1', null), { refused: 'exhausted' });
  const expired = setup({ expiresAt: new Date('2026-01-01T00:00:00Z') });
  assert.deepEqual(await expired.ledger.reserve('cpn_1', null), { refused: 'exhausted' });
});

test('L2 reserve: таван на клиента връща и инкремента (rollback)', async () => {
  const { db, ledger, times } = setup({ maxRedemptions: 10 });
  for (let i = 0; i < MAX_HELD_PER_CLIENT; i++) {
    assert.ok('id' in (await ledger.reserve('cpn_1', 'k1')));
  }
  assert.deepEqual(await ledger.reserve('cpn_1', 'k1'), { refused: 'client-limit' });
  assert.equal(times(), MAX_HELD_PER_CLIENT, 'отказът не държи ползване');
  assert.equal(db.res.size, MAX_HELD_PER_CLIENT);
  assert.ok('id' in (await ledger.reserve('cpn_1', 'k2')));
  assert.ok('id' in (await ledger.reserve('cpn_1', null)), 'без ключ — без таван');
});

test('L3 release: CAS по HELD — веднъж; не освобождава консумирана', async () => {
  const { db, ledger, times } = setup({ maxRedemptions: 5 });
  const a = (await ledger.reserve('cpn_1', 'k1')) as { id: string };
  const b = (await ledger.reserve('cpn_1', null)) as { id: string };
  assert.equal(await ledger.release(a.id, 'cs_a'), true);
  assert.equal(await ledger.release(a.id, 'cs_a'), false);
  assert.equal(times(), 1);
  assert.equal(db.res.get(a.id)!.clientKey, null, 'ключът на клиента се маха при уреждане');
  assert.equal(db.res.get(a.id)!.stripeSessionId, 'cs_a');
  await ledger.consume(b.id, 'cs_b');
  assert.equal(await ledger.release(b.id, 'cs_b'), false);
  assert.equal(db.res.get(b.id)!.status, 'CONSUMED');
  assert.equal(times(), 1, 'консумираната остава броена');
});

test('L4 consume: HELD → без +1; RELEASED → +1 веднъж; CONSUMED → нищо', async () => {
  const { db, ledger, times } = setup({ maxRedemptions: 5 });
  const a = (await ledger.reserve('cpn_1', null)) as { id: string };
  await ledger.consume(a.id, 'cs_a');
  await ledger.consume(a.id, 'cs_a');
  assert.equal(times(), 1);
  const b = (await ledger.reserve('cpn_1', null)) as { id: string };
  await ledger.release(b.id);
  assert.equal(times(), 1);
  await ledger.consume(b.id, 'cs_b');
  assert.equal(db.res.get(b.id)!.status, 'CONSUMED');
  assert.equal(times(), 2, 'платеното по освободена се брои');
  await ledger.consume(b.id, 'cs_b');
  assert.equal(times(), 2);
});

test('L5 attachSession пише само в празно поле', async () => {
  const { db, ledger } = setup();
  const a = (await ledger.reserve('cpn_1', null)) as { id: string };
  await ledger.attachSession(a.id, 'cs_1');
  await ledger.attachSession(a.id, 'cs_other');
  assert.equal(db.res.get(a.id)!.stripeSessionId, 'cs_1');
});

test('L6 countLegacy: условно под лимита', async () => {
  const { ledger, times } = setup({ maxRedemptions: 1 });
  await ledger.countLegacy('cpn_1');
  await ledger.countLegacy('cpn_1');
  assert.equal(times(), 1);
});

test('L7 listStaleHeld: само HELD, по-стари от прага', async () => {
  const { db, ledger } = setup();
  const a = (await ledger.reserve('cpn_1', null)) as { id: string };
  const b = (await ledger.reserve('cpn_1', null)) as { id: string };
  await ledger.release(b.id);
  db.now = new Date('2026-11-02T15:00:00Z');
  await ledger.reserve('cpn_1', null); // прясна
  const stale = await ledger.listStaleHeld(new Date('2026-11-02T13:00:00Z'), 50);
  assert.equal(stale.length, 1);
  assert.equal(stale[0]!.id, a.id);
  assert.equal(stale[0]!.stripeSessionId, null);
  assert.ok(stale[0]!.createdAt instanceof Date, 'createdAt е избран (sweep-ът брои 72 ч по него)');
});
