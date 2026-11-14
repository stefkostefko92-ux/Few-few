// Условните записи зад CouponLedger (огледало: __tests__/coupon-model.ts;
// SQL-ът се тества срещу mock на Prisma в __tests__/coupon-ledger.test.ts).
// Postgres (READ COMMITTED): конкурентният UPDATE на същия ред чака
// заключването и преоценява WHERE върху новата версия → при лимит 1 вторият
// получава 0 реда. Заключеният ред на кода сериализира и броенето за тавана
// на клиента. Статусните преходи са CAS (WHERE status = ...) — повторено или
// паралелно събитие променя реда най-много веднъж.
// Без 'server-only'/prisma импорт: инжектира се (createCouponLedger(prisma)).
import {
  MAX_HELD_PER_CLIENT,
  type CouponLedger,
  type ReserveOutcome,
  type StaleReservation,
} from './coupon-reservation';

type ReservationStatus = 'HELD' | 'CONSUMED' | 'RELEASED';

export interface LedgerTx {
  $executeRaw(query: TemplateStringsArray, ...values: unknown[]): PromiseLike<number>;
  couponReservation: {
    create(args: {
      data: { couponId: string; clientKey: string | null };
      select: { id: true };
    }): PromiseLike<{ id: string }>;
    count(args: {
      where: { couponId: string; clientKey: string; status: ReservationStatus };
    }): PromiseLike<number>;
    updateMany(args: {
      where: { id: string; status?: ReservationStatus; stripeSessionId?: null };
      data: {
        status?: ReservationStatus;
        settledAt?: Date;
        stripeSessionId?: string;
        clientKey?: null;
      };
    }): PromiseLike<{ count: number }>;
    findUnique(args: {
      where: { id: string };
      select: { couponId: true };
    }): PromiseLike<{ couponId: string } | null>;
    findMany(args: {
      where: { status: ReservationStatus; createdAt: { lt: Date } };
      select: { id: true; stripeSessionId: true; createdAt: true };
      orderBy: { createdAt: 'asc' };
      take: number;
    }): PromiseLike<StaleReservation[]>;
  };
}

export interface LedgerDb extends LedgerTx {
  $transaction<T>(fn: (tx: LedgerTx) => Promise<T>): Promise<T>;
}

class ClientLimitReached extends Error {}

class PrismaCouponLedger implements CouponLedger {
  constructor(private readonly db: LedgerDb) {}

  reserve(couponId: string, clientKey: string | null): Promise<ReserveOutcome> {
    return this.db.$transaction(async (tx): Promise<ReserveOutcome> => {
      const claimed = await tx.$executeRaw`UPDATE "Coupon" SET "timesRedeemed" = "timesRedeemed" + 1 WHERE "id" = ${couponId} AND "active" = true AND ("expiresAt" IS NULL OR "expiresAt" > NOW()) AND ("maxRedemptions" IS NULL OR "timesRedeemed" < "maxRedemptions")`;
      if (claimed !== 1) return { refused: 'exhausted' };
      if (clientKey) {
        // Под заключването на реда на кода (UPDATE-ът горе) → без надпревара.
        const held = await tx.couponReservation.count({
          where: { couponId, clientKey, status: 'HELD' },
        });
        // Хвърляне → ROLLBACK, т.е. и инкрементът горе се връща.
        if (held >= MAX_HELD_PER_CLIENT) throw new ClientLimitReached();
      }
      const reservation = await tx.couponReservation.create({
        data: { couponId, clientKey },
        select: { id: true },
      });
      return { id: reservation.id };
    }).catch((error: unknown): ReserveOutcome => {
      if (error instanceof ClientLimitReached) return { refused: 'client-limit' };
      throw error;
    });
  }

  async attachSession(reservationId: string, sessionId: string): Promise<void> {
    await this.db.couponReservation.updateMany({
      where: { id: reservationId, stripeSessionId: null },
      data: { stripeSessionId: sessionId },
    });
  }

  release(reservationId: string, sessionId?: string | null): Promise<boolean> {
    return this.db.$transaction(async (tx) => {
      const moved = await tx.couponReservation.updateMany({
        where: { id: reservationId, status: 'HELD' },
        data: {
          status: 'RELEASED',
          settledAt: new Date(),
          clientKey: null,
          ...(sessionId ? { stripeSessionId: sessionId } : {}),
        },
      });
      if (moved.count !== 1) return false;
      const row = await tx.couponReservation.findUnique({
        where: { id: reservationId },
        select: { couponId: true },
      });
      if (row) {
        await tx.$executeRaw`UPDATE "Coupon" SET "timesRedeemed" = "timesRedeemed" - 1 WHERE "id" = ${row.couponId} AND "timesRedeemed" > 0`;
      }
      return true;
    });
  }

  async consume(reservationId: string, sessionId?: string | null): Promise<void> {
    await this.db.$transaction(async (tx) => {
      const data = {
        status: 'CONSUMED' as const,
        settledAt: new Date(),
        clientKey: null,
        ...(sessionId ? { stripeSessionId: sessionId } : {}),
      };
      const held = await tx.couponReservation.updateMany({
        where: { id: reservationId, status: 'HELD' },
        data,
      });
      if (held.count === 1) return;
      // Освободена резервация, по която все пак е платено (timeout при
      // създаването на сесията): реалното ползване се брои веднъж.
      const released = await tx.couponReservation.updateMany({
        where: { id: reservationId, status: 'RELEASED' },
        data,
      });
      if (released.count !== 1) return;
      const row = await tx.couponReservation.findUnique({
        where: { id: reservationId },
        select: { couponId: true },
      });
      if (row) {
        await tx.$executeRaw`UPDATE "Coupon" SET "timesRedeemed" = "timesRedeemed" + 1 WHERE "id" = ${row.couponId}`;
        // Безусловно (реално платено) → може да мине лимита: видимо за админа.
        console.warn(
          `[coupon] резервация ${reservationId}: платено след освобождаване — броено отново (провери лимита на кода ${row.couponId})`,
        );
      }
    });
  }

  async countLegacy(couponId: string): Promise<void> {
    await this.db.$executeRaw`UPDATE "Coupon" SET "timesRedeemed" = "timesRedeemed" + 1 WHERE "id" = ${couponId} AND ("maxRedemptions" IS NULL OR "timesRedeemed" < "maxRedemptions")`;
  }

  async listStaleHeld(before: Date, limit: number): Promise<StaleReservation[]> {
    return this.db.couponReservation.findMany({
      where: { status: 'HELD', createdAt: { lt: before } },
      select: { id: true, stripeSessionId: true, createdAt: true },
      orderBy: { createdAt: 'asc' },
      take: limit,
    });
  }
}

export function createCouponLedger(db: LedgerDb): CouponLedger {
  return new PrismaCouponLedger(db);
}
