import type { PrismaClient } from '@prisma/client';
import { orderOutcome } from '@/lib/revolut-core';
import { applyPaidOrder, checkPurchase, isPaidPlan, planAfterRefund } from '@/lib/plan-orders';
import { referralRewardCents } from '@/lib/referral';
import { planConfirmationEmail } from '@/lib/plan-confirmation';
import { withdrawalLastDay } from '@/lib/withdrawal';
import type { BillingIntervalId, PlanId } from '@/lib/plans';

// Уреждане на поръчка за план (spec §7.1 P4/P5/P6/P10/P12/P14) — общо за
// уебхука и cron-а. Истината е `GET /api/orders/{id}`; правото се дава с условен
// запис pending → completed, затова повторно събитие или паралелна проверка не
// удължават плана два пъти.
//
// Състояния на PlanOrder: pending → completed (приложена, applied=true) |
// conflict (платена, но НЕ приложена — сумата не съвпада или междувременно е
// купен по-висок план; чака връщане от админа) | failed | cancelled;
// completed/conflict → refund_pending (refund поръчката при Revolut е
// асинхронна, до 2 дни) → refunded (или обратно при неуспешен refund).
//
// Ядрото е с инжектирани зависимости (база, Revolut, имейл, аларми) — без
// server-only, за да се тества срещу реален Postgres с фалшив Revolut
// (__tests__/plan-order-service.int.test.ts). Сървърната обвивка с истинските
// зависимости е lib/plan-order-service.ts.

export type SettleResult = 'completed' | 'conflict' | 'failed' | 'cancelled' | 'pending' | 'noop';
export type RefundRequest = 'requested' | 'refunded' | 'not-refundable' | 'newer-first';

export interface PlanOrderDeps {
  db: PrismaClient;
  revolut: {
    getOrder(orderId: string): Promise<unknown>;
    refund(input: { orderId: string; amountCents: number; idempotencyKey: string }): Promise<{ id: string; state: string }>;
  };
  email: {
    configured(): boolean;
    send(input: { to: string; subject: string; html: string; tag?: string }): Promise<boolean>;
  };
  notifyAdmins(subject: string, lines: string[]): Promise<void>;
  applyPlanLimits(userId: string): Promise<void>;
  siteUrl: string;
  log(...args: unknown[]): void;
}

export function createPlanOrderService(deps: PlanOrderDeps) {
  const db = deps.db;

  /** Урежда поръчка по id на Revolut (уебхук) или на нашия запис (cron). */
  async function settlePlanOrder(where: { revolutOrderId: string } | { id: string }): Promise<SettleResult> {
    const order = await db.planOrder.findUnique({ where });
    if (!order?.revolutOrderId || order.state !== 'pending') return 'noop';
    const live = orderOutcome(await deps.revolut.getOrder(order.revolutOrderId));

    if (live.state === 'failed' || live.state === 'cancelled') {
      await db.planOrder.updateMany({
        where: { id: order.id, state: 'pending' },
        data: { state: live.state },
      });
      return live.state;
    }
    if (live.state !== 'completed') return 'pending';

    const outcome = await db.$transaction(async (tx) => {
      // Две поръчки на един потребител, уредени едновременно, не бива да четат
      // един и същ план (изгубено удължаване) — заключваме реда му.
      await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${order.userId} FOR UPDATE`;
      const user = await tx.user.findUnique({
        where: { id: order.userId },
        select: { plan: true, planExpiresAt: true, referredById: true },
      });
      if (!user) return 'noop' as const;
      const now = new Date();
      const paid = {
        completedAt: now,
        buyerCountry: live.billingCountry,
        cardCountry: live.cardCountry,
        prevPlan: user.plan,
        prevExpiresAt: user.planExpiresAt,
      };
      // P4: сумата и валутата трябва да са точно записаните при checkout. P6:
      // покупката се проверява ОТНОВО срещу текущия план — стара висяща поръчка
      // не сваля FOUNDER/по-висок план, купен междувременно.
      const amountOk = live.amountCents === order.amountCents && live.currency === 'EUR';
      // Докато тече връщане на приложена поръчка, нова поръчка не се прилага —
      // иначе приключването на връщането (снимката отпреди) би изтрило и нея.
      const refundInFlight = await tx.planOrder.count({
        where: { userId: order.userId, applied: true, state: 'refund_pending' },
      });
      const allowed =
        refundInFlight === 0 &&
        isPaidPlan(order.plan) &&
        checkPurchase({ plan: user.plan as PlanId, expiresAt: user.planExpiresAt, want: order.plan, now }) === 'ok';
      if (!amountOk || !allowed) {
        const marked = await tx.planOrder.updateMany({
          where: { id: order.id, state: 'pending' },
          data: { state: 'conflict', ...paid },
        });
        return marked.count === 1 ? ('conflict' as const) : ('noop' as const);
      }
      // P5: CAS — само един процес минава от pending към completed. Снимката на
      // плана отпреди поръчката позволява връщане без загуба на предишния период.
      const claimed = await tx.planOrder.updateMany({
        where: { id: order.id, state: 'pending' },
        data: { state: 'completed', applied: true, ...paid },
      });
      if (claimed.count !== 1) return 'noop' as const;
      const want = order.plan as Exclude<PlanId, 'FREE'>;
      const next = applyPaidOrder({
        plan: user.plan as PlanId,
        expiresAt: user.planExpiresAt,
        want,
        interval: order.interval as BillingIntervalId,
        now,
      });
      await tx.user.update({
        where: { id: order.userId },
        data: { plan: next.plan, planExpiresAt: next.expiresAt, planReminded: null },
      });
      // P12: бонус само за първата платена поръчка на поканения, веднъж — в
      // СЪЩАТА транзакция (иначе срив след CAS-а го губи завинаги). Проверка
      // преди create: нарушение на уникалност би прекратило транзакцията;
      // редът на поканения е заключен, затова проверката е надеждна.
      const rewardCents = referralRewardCents(order.amountCents);
      if (user.referredById && rewardCents > 0) {
        const existing = await tx.referral.findUnique({ where: { referredUserId: order.userId } });
        if (!existing) {
          await tx.referral.create({
            data: {
              referrerId: user.referredById,
              referredUserId: order.userId,
              plan: want,
              rewardCents,
              planOrderId: order.id,
            },
          });
          await tx.user.update({
            where: { id: user.referredById },
            data: { referralCreditCents: { increment: rewardCents } },
          });
        }
      }
      return 'completed' as const;
    });

    if (outcome === 'conflict') {
      deps.log(`[plan-order] ${order.id}: платена, но неприложена (сума/валута или по-висок план) — за връщане от /admin`);
      await deps.notifyAdmins('Платена, неприложена поръчка — върни парите', [
        `Поръчка: ${order.id} (${order.plan}, ${order.interval}, €${(order.amountCents / 100).toFixed(2)})`,
        'Причина: сумата/валутата не съвпада, по-висок план е купен междувременно или тече връщане.',
      ]).catch(() => undefined);
      return 'conflict';
    }
    if (outcome !== 'completed') return 'noop';
    // Потвърждението е най-добро усилие тук; пропуснатото праща cron-ът (P14).
    await sendPlanConfirmation(order.id).catch((error) => {
      deps.log(`[plan-order] ${order.id}: потвърждението не е изпратено:`, error instanceof Error ? error.message : 'unknown error');
    });
    return 'completed';
  }

  /**
   * P14: потвърждение на траен носител след платена поръчка — веднъж
   * (условен запис на confirmationSentAt). Връща true, ако е изпратено сега.
   */
  async function sendPlanConfirmation(planOrderId: string): Promise<boolean> {
    if (!deps.email.configured()) return false;
    const order = await db.planOrder.findUnique({
      where: { id: planOrderId },
      include: { user: { select: { email: true, name: true, locale: true, planExpiresAt: true } } },
    });
    if (!order || order.state !== 'completed' || !order.applied || order.confirmationSentAt) return false;
    const { subject, html } = planConfirmationEmail({
      locale: order.user.locale,
      name: order.user.name,
      plan: order.plan,
      interval: order.interval,
      amountCents: order.amountCents,
      vatCents: order.vatCents,
      vatRateBp: order.vatRateBp,
      paidUntil: order.plan === 'FOUNDER' ? null : order.user.planExpiresAt,
      orderRef: order.id,
      termsUrl: `${deps.siteUrl}/${order.user.locale}/terms`,
      withdrawUntil: withdrawalLastDay(order.completedAt ?? order.createdAt),
      dashboardUrl: `${deps.siteUrl}/${order.user.locale}/dashboard#plan`,
    });
    const sent = await deps.email.send({ to: order.user.email, subject, html, tag: 'plan-confirmation' });
    if (!sent) return false;
    const { count } = await db.planOrder.updateMany({
      where: { id: order.id, confirmationSentAt: null },
      data: { confirmationSentAt: new Date() },
    });
    return count === 1;
  }

  /**
   * P10: пълно връщане по искане на админа (отказ в 14 дни и др.). Поръчката
   * трябва да е платена (completed/conflict) или заседнала в refund_pending без
   * refund поръчка (сривът между записа и Revolut — повторът е безопасен със
   * същия ключ). Приложена поръчка се връща само ако е последната приложена.
   * Проверката и преходът са под заключване на реда на потребителя, а
   * refund_pending блокира нови поръчки (settlePlanOrder → conflict) — затова
   * нищо не се прилага върху поръчка, която се връща. Revolut създава refund
   * поръчка; приключваме при нейния `completed` (веднага, уебхук или cron).
   */
  async function requestPlanRefund(planOrderId: string): Promise<RefundRequest> {
    const claim = await db.$transaction(async (tx) => {
      const found = await tx.planOrder.findUnique({ where: { id: planOrderId }, select: { userId: true } });
      if (!found) return { result: 'not-refundable' as const };
      await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${found.userId} FOR UPDATE`;
      const order = await tx.planOrder.findUnique({ where: { id: planOrderId } });
      if (!order?.revolutOrderId) return { result: 'not-refundable' as const };
      const stuck = order.state === 'refund_pending' && order.refundOrderId === null;
      if (order.state !== 'completed' && order.state !== 'conflict' && !stuck) {
        return { result: 'not-refundable' as const };
      }
      if (order.applied) {
        const newer = await tx.planOrder.count({
          where: {
            userId: order.userId,
            applied: true,
            state: { in: ['completed', 'refund_pending'] },
            completedAt: { gt: order.completedAt ?? order.createdAt },
          },
        });
        if (newer > 0) return { result: 'newer-first' as const };
      }
      if (stuck) return { result: 'go' as const, order, attempt: order.refundAttempts };
      const updated = await tx.planOrder.update({
        where: { id: order.id },
        data: { state: 'refund_pending', refundAttempts: { increment: 1 } },
      });
      return { result: 'go' as const, order: updated, attempt: updated.refundAttempts };
    });
    if (claim.result !== 'go') return claim.result;
    const { order, attempt } = claim;
    let refund: { id: string; state: string };
    try {
      // Idempotency-Key (≤50 знака): същият опит → същият ключ; нов опит → нов.
      refund = await deps.revolut.refund({
        orderId: order.revolutOrderId as string,
        amountCents: order.amountCents,
        idempotencyKey: `${order.id}-${attempt}`,
      });
    } catch (error) {
      // Revolut не прие връщането → поръчката е пак платена.
      await db.planOrder.updateMany({
        where: { id: order.id, state: 'refund_pending', refundOrderId: null },
        data: { state: order.applied ? 'completed' : 'conflict' },
      });
      throw error;
    }
    await db.planOrder.updateMany({
      where: { id: order.id, state: 'refund_pending' },
      data: { refundOrderId: refund.id },
    });
    if (refund.state === 'completed') {
      await finalizeRefund(order.id);
      return 'refunded';
    }
    return 'requested';
  }

  /** Урежда висящ refund — по id на refund поръчката при Revolut (уебхук) или по нашето (cron). */
  async function settlePlanRefund(
    where: { refundOrderId: string } | { id: string },
  ): Promise<'refunded' | 'failed' | 'pending' | 'noop'> {
    const order = await db.planOrder.findUnique({ where });
    if (!order?.refundOrderId || order.state !== 'refund_pending') return 'noop';
    const live = orderOutcome(await deps.revolut.getOrder(order.refundOrderId));
    if (live.state === 'completed') {
      await finalizeRefund(order.id);
      return 'refunded';
    }
    if (live.state === 'failed' || live.state === 'cancelled') {
      // Парите НЕ са върнати → поръчката е пак платена; правото не се пипа.
      await db.planOrder.updateMany({
        where: { id: order.id, state: 'refund_pending' },
        data: { state: order.applied ? 'completed' : 'conflict', refundOrderId: null },
      });
      deps.log(`[plan-order] ${order.id}: refund при Revolut е ${live.state} — поръчката е пак платена`);
      await deps.notifyAdmins('Връщането на пари е неуспешно', [
        `Поръчка: ${order.id} (€${(order.amountCents / 100).toFixed(2)})`,
        `Refund при Revolut: ${live.state} — поръчката е пак платена; опитай отново от админ панела.`,
        order.withdrawalRequestedAt ? `Има изявление за отказ от ${order.withdrawalRequestedAt.toISOString()} — срокът за връщане е 14 дни.` : 'Без изявление за отказ.',
      ]).catch(() => undefined);
      return 'failed';
    }
    return 'pending';
  }

  /**
   * P10/P10′: парите са върнати — поръчката е `refunded`. Приложена поръчка:
   * планът се връща към този ОТПРЕДИ нея (planAfterRefund; изтекъл → FREE,
   * R-limits) и бонусът по нея се сторнира (може да остави отрицателен баланс —
   * правилото от ОУ). Неприложена (conflict) поръчка не пипа плана.
   */
  async function finalizeRefund(planOrderId: string): Promise<void> {
    const order = await db.planOrder.findUnique({ where: { id: planOrderId } });
    if (!order || order.state !== 'refund_pending') return;
    let planNotRestored = false;
    const restoredPlan = await db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${order.userId} FOR UPDATE`;
      const claimed = await tx.planOrder.updateMany({
        where: { id: order.id, state: 'refund_pending' },
        data: { state: 'refunded', refundedAt: new Date() },
      });
      if (claimed.count !== 1 || !order.applied) return false;
      // Защитна мрежа: ако въпреки блокировката има по-нова приложена поръчка,
      // снимката е остаряла — планът не се пипа, админът решава ръчно.
      const newer = await tx.planOrder.count({
        where: {
          userId: order.userId,
          applied: true,
          id: { not: order.id },
          state: { in: ['completed', 'refund_pending'] },
          completedAt: { gt: order.completedAt ?? order.createdAt },
        },
      });
      if (newer > 0) {
        deps.log(`[plan-order] ${order.id}: върната, но има по-нова приложена поръчка — планът НЕ е върнат, нужна е ръчна проверка`);
        planNotRestored = true;
      }
      const restored = newer > 0 ? null : planAfterRefund({
        prevPlan: order.prevPlan,
        prevExpiresAt: order.prevExpiresAt,
        now: new Date(),
      });
      if (restored) {
        await tx.user.update({
          where: { id: order.userId },
          data: { plan: restored.plan, planExpiresAt: restored.expiresAt, planReminded: null },
        });
      }
      const referral = await tx.referral.findUnique({ where: { planOrderId: order.id } });
      if (referral && !referral.reversedAt) {
        await tx.referral.update({
          where: { id: referral.id },
          data: { reversedAt: new Date(), reversalReason: 'refund' },
        });
        await tx.user.update({
          where: { id: referral.referrerId },
          data: { referralCreditCents: { decrement: referral.rewardCents } },
        });
      }
      return true;
    });
    if (restoredPlan) await deps.applyPlanLimits(order.userId);
    // Имейлът — извън транзакцията (тя може да се повтори, а писмото — не).
    if (planNotRestored) {
      await deps
        .notifyAdmins('Върната поръчка — планът НЕ е върнат', [
          `Поръчка: ${order.id} (€${(order.amountCents / 100).toFixed(2)})`,
          'Има по-нова приложена поръчка — реши ръчно срока/плана на потребителя.',
        ])
        .catch(() => undefined);
    }
  }

  return { settlePlanOrder, sendPlanConfirmation, requestPlanRefund, settlePlanRefund };
}
