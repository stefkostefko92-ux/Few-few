// МОДЕЛ, НЕ PRODUCTION. Леджър на промо кодовете в паметта — огледало на
// условните SQL записи в src/lib/coupon-ledger.ts (един UPDATE = една
// атомарна стъпка; JS е еднонишков, затова всяка синхронна стъпка тук е
// атомарна като реда в Postgres). За тестовете на оркестрацията; самият SQL
// се тества срещу mock на Prisma в coupon-ledger.test.ts.
import {
  MAX_HELD_PER_CLIENT,
  type CouponLedger,
  type ReserveOutcome,
  type StaleReservation,
} from '../coupon-reservation';

export interface ModelCoupon {
  maxRedemptions: number | null;
  timesRedeemed: number;
}

type Status = 'HELD' | 'CONSUMED' | 'RELEASED';

interface ModelReservation {
  couponId: string;
  status: Status;
  sessionId: string | null;
  clientKey: string | null;
  createdAt: Date;
}

export class CouponLedgerModel implements CouponLedger {
  readonly coupons = new Map<string, ModelCoupon>();
  readonly reservations = new Map<string, ModelReservation>();
  private seq = 0;
  now = new Date('2026-11-02T12:00:00Z');

  addCoupon(id: string, maxRedemptions: number | null, timesRedeemed = 0): void {
    this.coupons.set(id, { maxRedemptions, timesRedeemed });
  }

  times(id: string): number {
    return this.coupons.get(id)?.timesRedeemed ?? NaN;
  }

  status(reservationId: string): Status | undefined {
    return this.reservations.get(reservationId)?.status;
  }

  // UPDATE "Coupon" SET +1 WHERE max IS NULL OR times < max; таван на клиента; INSERT HELD.
  async reserve(couponId: string, clientKey: string | null): Promise<ReserveOutcome> {
    const c = this.coupons.get(couponId);
    if (!c) return { refused: 'exhausted' };
    if (c.maxRedemptions !== null && c.timesRedeemed >= c.maxRedemptions) {
      return { refused: 'exhausted' };
    }
    if (clientKey) {
      const held = [...this.reservations.values()].filter(
        (r) => r.couponId === couponId && r.clientKey === clientKey && r.status === 'HELD',
      ).length;
      if (held >= MAX_HELD_PER_CLIENT) return { refused: 'client-limit' };
    }
    c.timesRedeemed += 1;
    const id = `res_${++this.seq}`;
    this.reservations.set(id, {
      couponId,
      status: 'HELD',
      sessionId: null,
      clientKey,
      createdAt: this.now,
    });
    await Promise.resolve();
    return { id };
  }

  async attachSession(reservationId: string, sessionId: string): Promise<void> {
    const r = this.reservations.get(reservationId);
    if (r && r.sessionId === null) r.sessionId = sessionId;
    await Promise.resolve();
  }

  // UPDATE reservation SET RELEASED WHERE status = HELD; при 1 ред → -1.
  async release(reservationId: string, sessionId?: string | null): Promise<boolean> {
    const r = this.reservations.get(reservationId);
    if (!r || r.status !== 'HELD') return false;
    r.status = 'RELEASED';
    r.clientKey = null;
    r.sessionId = sessionId ?? r.sessionId;
    const c = this.coupons.get(r.couponId);
    if (c && c.timesRedeemed > 0) c.timesRedeemed -= 1;
    await Promise.resolve();
    return true;
  }

  // HELD → CONSUMED (без +1); RELEASED → CONSUMED (+1, реално ползване).
  async consume(reservationId: string, sessionId?: string | null): Promise<void> {
    const r = this.reservations.get(reservationId);
    if (!r) return;
    if (r.status === 'HELD') {
      r.status = 'CONSUMED';
    } else if (r.status === 'RELEASED') {
      r.status = 'CONSUMED';
      const c = this.coupons.get(r.couponId);
      if (c) c.timesRedeemed += 1;
    }
    r.clientKey = null;
    r.sessionId = sessionId ?? r.sessionId;
    await Promise.resolve();
  }

  // Заварен път (както досега): условен +1 под лимита.
  async countLegacy(couponId: string): Promise<void> {
    const c = this.coupons.get(couponId);
    if (!c) return;
    if (c.maxRedemptions !== null && c.timesRedeemed >= c.maxRedemptions) return;
    c.timesRedeemed += 1;
    await Promise.resolve();
  }

  async listStaleHeld(before: Date, limit: number): Promise<StaleReservation[]> {
    return [...this.reservations.entries()]
      .filter(([, r]) => r.status === 'HELD' && r.createdAt.getTime() < before.getTime())
      .slice(0, limit)
      .map(([id, r]) => ({ id, stripeSessionId: r.sessionId, createdAt: r.createdAt }));
  }
}
