import type { PrismaClient } from '@prisma/client';
import { disputeOutcome, isTransientRevolutError, orderOutcome, refundOutcome, type DisputeState } from '@/lib/revolut-core';
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
// Споровете (chargeback) не сменят състоянието — само одит и аларма (recordDispute).
//
// Ядрото е с инжектирани зависимости (база, Revolut, имейл, аларми) — без
// server-only, за да се тества срещу реален Postgres с фалшив Revolut
// (__tests__/plan-order-service.int.test.ts). Сървърната обвивка с истинските
// зависимости е lib/plan-order-service.ts.

export type SettleResult = 'completed' | 'conflict' | 'failed' | 'cancelled' | 'pending' | 'noop';
// 'stuck': Revolut не отговори ясно (таймаут, 409, 5XX) — в ход, повтори от /admin със същия ключ.
export type RefundRequest = 'requested' | 'refunded' | 'stuck' | 'not-refundable' | 'newer-first';
export type DisputeRecord = 'recorded' | 'unchanged' | 'unreadable';

export interface PlanOrderDeps {
  db: PrismaClient;
  revolut: {
    getOrder(orderId: string): Promise<unknown>;
    /** Самата refund поръчка (2xx); отказ с 4XX/5XX хвърля. */
    refund(input: { orderId: string; amountCents: number; idempotencyKey: string }): Promise<unknown>;
    /** `GET /api/disputes/{id}`; грешката носи `status` при HTTP отговор. */
    getDispute(disputeId: string): Promise<unknown>;
  };
  email: {
    configured(): boolean | Promise<boolean>;
    send(input: { to: string; subject: string; html: string; tag?: string }): Promise<boolean>;
  };
  /** true, ако поне едно писмо е тръгнало (спорът се допраща от cron-а при false). */
  notifyAdmins(subject: string, lines: string[]): Promise<boolean>;
  applyPlanLimits(userId: string): Promise<void>;
  siteUrl: string;
  log(...args: unknown[]): void;
}

const DISPUTE_SUBJECT: Record<DisputeState, string> = {
  needs_response: 'Спор по плащане — нужен е отговор',
  under_review: 'Спор по плащане — в разглеждане',
  won: 'Спор по плащане — спечелен',
  lost: 'Спор по плащане — загубен',
};
// „Няма срок“ в уникалния ключ на RevolutDispute (NULL не се засича в Postgres).
const NO_DUE_DATE = new Date(0);
const PLAN_ORDER_ALERT = { id: true, plan: true, interval: true, amountCents: true, state: true } as const;

/** Темата и редовете на алармата за спор — едни и същи от уебхука и от cron-а. */
function disputeAlert(d: {
  id: string;
  state: DisputeState;
  substate: string;
  responseDueAt: Date;
  reasonCode: string | null;
  reason: string | null;
  amountCents: number;
  currency: string;
  revolutOrderId: string | null;
  planOrder: { id: string; plan: string; interval: string; amountCents: number; state: string } | null;
}): [string, string[]] {
  const due = d.responseDueAt.getTime() === NO_DUE_DATE.getTime() ? null : d.responseDueAt;
  return [
    DISPUTE_SUBJECT[d.state] ?? 'Спор по плащане',
    [
      `Спор при Revolut: ${d.id} — ${d.state}${d.substate ? ` (${d.substate})` : ''}`,
      d.planOrder
        ? `Поръчка: ${d.planOrder.id} (${d.planOrder.plan}, ${d.planOrder.interval}, €${(d.planOrder.amountCents / 100).toFixed(2)}, ${d.planOrder.state})`
        : `Плащане при Revolut: ${d.revolutOrderId ?? '—'} — не е поръчка за план в Linketto.`,
      `Оспорена сума: ${(d.amountCents / 100).toFixed(2)} ${d.currency}`,
      due
        ? `Срок за отговор: ${due.toISOString()} (UTC) — без отговор спорът е загубен.`
        : 'Срок за отговор: не е посочен — провери в Revolut Business.',
      `Причина: ${[d.reasonCode, d.reason].filter(Boolean).join(' — ') || '—'}`,
      'Нищо не е пипнато автоматично (планът, поръчката, реферал бонусът) — решава човек: отговор в Revolut Business, при загубен спор — от /admin.',
    ],
  ];
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
    if (!(await deps.email.configured())) return false;
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
        data: { state: 'refund_pending', refundAttempts: { increment: 1 }, refundStuckAlertedAt: null },
      });
      return { result: 'go' as const, order: updated, attempt: updated.refundAttempts };
    });
    if (claim.result !== 'go') return claim.result;
    const { order, attempt } = claim;
    // Revolut не прие връщането (изричен 4XX или отказано плащане) → поръчката е пак платена.
    const backToPaid = () =>
      db.planOrder.updateMany({
        where: { id: order.id, state: 'refund_pending', refundOrderId: null },
        data: { state: order.applied ? 'completed' : 'conflict' },
      });
    let raw: unknown;
    try {
      // Idempotency-Key (≤50 знака): същият опит → същият ключ; нов опит → нов.
      raw = await deps.revolut.refund({
        orderId: order.revolutOrderId as string,
        amountCents: order.amountCents,
        idempotencyKey: `${order.id}-${attempt}`,
      });
    } catch (error) {
      // Таймаут, мрежа, 429, 5XX: Revolut може вече да е създал refund-а. Поръчката
      // остава refund_pending без refundOrderId („stuck“) — следващото връщане от
      // /admin повтаря СЪЩИЯ опит със същия ключ (Revolut връща същия refund),
      // никога нов ключ, който би върнал парите втори път.
      if (isTransientRevolutError(error)) {
        deps.log(`[plan-order] ${order.id}: refund без отговор от Revolut — в ход, повтори от /admin (същият ключ)`);
        return 'stuck';
      }
      await backToPaid();
      throw error;
    }
    const outcome = refundOutcome(raw);
    // F1: отказ, върнат с 200, е същото като синхронния 400 — същият път надолу
    // (refund поръчката не се пази). Днес API_VERSION е 2026-08-17 и отказът идва
    // като 400; клонът е за 2026-09-22 (Revolut Pay → 200 с отказано плащане).
    if (outcome.state === 'failed') {
      await backToPaid();
      throw new Error(`revolut: refund declined${outcome.declineReason ? ` (${outcome.declineReason})` : ''}`);
    }
    // 2xx без id: приет, но не знаем кой е — като таймаут (повтор със същия ключ).
    if (!outcome.id) {
      deps.log(`[plan-order] ${order.id}: refund без id в отговора на Revolut — в ход, повтори от /admin`);
      return 'stuck';
    }
    const refund = { id: outcome.id, state: outcome.state };
    const recorded = await db.planOrder.updateMany({
      where: { id: order.id, state: 'refund_pending' },
      data: { refundOrderId: refund.id },
    });
    if (recorded.count !== 1) {
      // Revolut прие refund-а, а поръчката вече не е refund_pending (паралелна
      // заявка я е върнала в „платена“) — парите може да се върнат, без това да се
      // види у нас. Не се поправя автоматично: човек сверява в Revolut Business.
      deps.log(`[plan-order] ${order.id}: refund ${refund.id} при Revolut без запис у нас`);
      await deps
        .notifyAdmins('Refund при Revolut без запис у нас', [
          `Поръчка: ${order.id} (€${(order.amountCents / 100).toFixed(2)})`,
          `Refund поръчка при Revolut: ${refund.id} (${refund.state})`,
          'Поръчката вече не е „връщане в ход“ — НЕ връщай пак. Свери refund-а в Revolut Business и реши ръчно плана.',
        ])
        .catch(() => false);
      throw new Error(`revolut: refund ${refund.id} без запис у нас (поръчка ${order.id})`);
    }
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
    // F1: и по `payments[].state` — отказаното плащане оставя поръчката в processing.
    const live = refundOutcome(await deps.revolut.getOrder(order.refundOrderId));
    if (live.state === 'completed') {
      await finalizeRefund(order.id);
      return 'refunded';
    }
    if (live.state === 'failed') {
      // Парите НЕ са върнати → поръчката е пак платена; правото не се пипа.
      await db.planOrder.updateMany({
        where: { id: order.id, state: 'refund_pending' },
        data: { state: order.applied ? 'completed' : 'conflict', refundOrderId: null },
      });
      const why = live.declineReason ? ` (${live.declineReason})` : '';
      deps.log(`[plan-order] ${order.id}: refund при Revolut е отказан${why} — поръчката е пак платена`);
      await deps.notifyAdmins('Връщането на пари е неуспешно', [
        `Поръчка: ${order.id} (€${(order.amountCents / 100).toFixed(2)})`,
        `Refund при Revolut: отказан${why} — поръчката е пак платена; опитай отново от админ панела.`,
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

  /**
   * F2: спор (chargeback) при Revolut — уебхукът `DISPUTE_*` носи само id, затова
   * спорът се чете на живо (`GET /api/disputes/{id}`, само в Production), връзва
   * се с поръчката за план по `payment.order_id`, записва се в одита
   * (RevolutDispute — ред за всяко ново състояние) и админите получават срока за
   * отговор. НИЩО автоматично: планът, поръчката и реферал бонусът не се пипат —
   * решава човек (отговор в Revolut Business; при загубен спор — от /admin).
   * Временна грешка при четенето хвърля (уебхукът връща 409 → нов опит); изричен
   * отказ (404 в Sandbox, 401/403) или непознат отговор → аларма само с id-то.
   */
  async function recordDispute(disputeId: string): Promise<DisputeRecord> {
    let raw: unknown;
    try {
      raw = await deps.revolut.getDispute(disputeId);
    } catch (error) {
      if (isTransientRevolutError(error)) throw error;
      const status = (error as { status?: unknown }).status;
      deps.log(`[plan-order] спор ${disputeId}: не се чете от Revolut (${String(status)})`);
      await notifyUnreadableDispute(disputeId, `Revolut отказа четенето (HTTP ${String(status)})`);
      return 'unreadable';
    }
    const dispute = disputeOutcome(raw);
    if (!dispute || dispute.id !== disputeId) {
      deps.log(`[plan-order] спор ${disputeId}: непознат отговор от Revolut`);
      await notifyUnreadableDispute(disputeId, 'непознат отговор от Revolut (състояние или полета)');
      return 'unreadable';
    }
    const planOrder = dispute.revolutOrderId
      ? await db.planOrder.findUnique({ where: { revolutOrderId: dispute.revolutOrderId }, select: PLAN_ORDER_ALERT })
      : null;
    // Ред за (спор, състояние, подсъстояние, срок): повторно или паралелно
    // известие за същото не дава нов ред и втора аларма (уникален ключ, без
    // изключение); нов етап или нов срок — да. „Няма“ = „“ / 1970-01-01.
    const key = {
      disputeId: dispute.id,
      state: dispute.state,
      substate: dispute.substate ?? '',
      responseDueAt: dispute.responseDueAt ?? NO_DUE_DATE,
    };
    const { count } = await db.revolutDispute.createMany({
      data: [
        {
          ...key,
          reasonCode: dispute.reasonCode,
          reason: dispute.reason,
          amountCents: dispute.amountCents,
          currency: dispute.currency,
          revolutOrderId: dispute.revolutOrderId,
          planOrderId: planOrder?.id ?? null,
        },
      ],
      skipDuplicates: true,
    });
    if (count !== 1) return 'unchanged';
    deps.log(`[plan-order] спор ${dispute.id}: ${dispute.state} (поръчка ${planOrder?.id ?? '—'})`);
    // Алармата трябва да стигне до човек: пращаме я сега, а неуспехът (Brevo,
    // празен ADMIN_EMAILS) оставя notifiedAt = NULL и cron-ът я допраща.
    const [subject, lines] = disputeAlert({ ...dispute, ...key, planOrder });
    if (await deps.notifyAdmins(subject, lines).catch(() => false)) {
      await db.revolutDispute.updateMany({ where: { ...key, notifiedAt: null }, data: { notifiedAt: new Date() } });
    } else {
      deps.log(`[plan-order] спор ${dispute.id}: алармата не е тръгнала — cron-ът ще опита пак`);
    }
    return 'recorded';
  }

  /**
   * Допраща алармите за спорове, които не са тръгнали (notifiedAt = NULL), от
   * /api/cron/plans. Пресните (под 10 мин.) не се пипат — уебхукът още може да
   * праща. Връща колко са тръгнали сега.
   */
  async function resendDisputeAlerts(now: Date = new Date()): Promise<number> {
    const rows = await db.revolutDispute.findMany({
      where: { notifiedAt: null, createdAt: { lt: new Date(now.getTime() - 10 * 60_000) } },
      orderBy: { createdAt: 'asc' },
      take: 50,
      include: { planOrder: { select: PLAN_ORDER_ALERT } },
    });
    let sent = 0;
    for (const row of rows) {
      const [subject, lines] = disputeAlert({ ...row, id: row.disputeId, state: row.state as DisputeState });
      if (!(await deps.notifyAdmins(subject, lines).catch(() => false))) continue;
      const { count } = await db.revolutDispute.updateMany({
        where: { id: row.id, notifiedAt: null },
        data: { notifiedAt: new Date() },
      });
      sent += count;
    }
    return sent;
  }

  async function notifyUnreadableDispute(disputeId: string, why: string): Promise<void> {
    const sent = await deps
      .notifyAdmins('Спор по плащане — провери в Revolut Business', [
        `Спор при Revolut: ${disputeId}`,
        `Не е прочетен: ${why}. Нищо не е записано и нищо не е пипнато.`,
        'Отвори спора в Revolut Business и виж срока за отговор.',
      ])
      .catch(() => false);
    // Няма ред, който cron-ът да допрати — уебхукът връща 409 и Revolut опитва пак.
    if (!sent) throw new Error('admin alert not sent (dispute unreadable)');
  }

  /**
   * Заседнали връщания (refund_pending без refundOrderId — Revolut не отговори
   * ясно) по-стари от 1 ч.: аларма до админите веднъж за опит (маркер
   * refundStuckAlertedAt, нулира се при нов опит). Неуспешно писмо → маркерът се
   * маха и следващото пускане на cron-а опитва пак. Връща колко са тръгнали.
   */
  async function alertStuckRefunds(now: Date = new Date()): Promise<number> {
    const stuckWhere = {
      state: 'refund_pending',
      refundOrderId: null,
      refundStuckAlertedAt: null,
      updatedAt: { lt: new Date(now.getTime() - 60 * 60_000) },
    };
    const orders = await db.planOrder.findMany({
      where: stuckWhere,
      orderBy: { updatedAt: 'asc' },
      take: 50,
      select: { id: true, amountCents: true, refundAttempts: true, withdrawalRequestedAt: true },
    });
    let sent = 0;
    for (const order of orders) {
      const marker = new Date();
      const claimed = await db.planOrder.updateMany({
        where: { ...stuckWhere, id: order.id },
        data: { refundStuckAlertedAt: marker },
      });
      if (claimed.count !== 1) continue;
      const ok = await deps
        .notifyAdmins('Връщане на пари в ход без отговор от Revolut', [
          `Поръчка: ${order.id} (€${(order.amountCents / 100).toFixed(2)}, опит ${order.refundAttempts})`,
          'Revolut не отговори ясно (таймаут, 409 или 5XX) — refund-ът може вече да е създаден.',
          'Натисни „Върни парите“ пак в /admin: повтаря СЪЩИЯ опит със същия ключ, без двойно връщане.',
          order.withdrawalRequestedAt
            ? `Има изявление за отказ от ${order.withdrawalRequestedAt.toISOString()} — срокът за връщане е 14 дни.`
            : 'Без изявление за отказ.',
        ])
        .catch(() => false);
      if (ok) sent += 1;
      else {
        await db.planOrder.updateMany({
          where: { id: order.id, refundStuckAlertedAt: marker },
          data: { refundStuckAlertedAt: null },
        });
      }
    }
    return sent;
  }

  return {
    settlePlanOrder,
    sendPlanConfirmation,
    requestPlanRefund,
    settlePlanRefund,
    recordDispute,
    resendDisputeAlerts,
    alertStuckRefunds,
  };
}
