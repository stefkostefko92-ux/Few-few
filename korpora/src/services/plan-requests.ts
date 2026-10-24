import type { User } from '@prisma/client';
import { z } from 'zod';
import { audit } from '../audit.js';
import { LEGAL_UPDATED } from '../company.js';
import { prisma } from '../db.js';
import type { RequestMeta } from '../http/meta.js';
import { LABEL } from '../labels.js';
import { logger } from '../logger.js';
import { orderNo } from '../plans/order-number.js';
import { addDays } from '../plans/plan.js';
import { isOptionId, optionMonths, optionPriceCents } from '../plans/pricing.js';
import {
  canWithdraw,
  WITHDRAWAL_DAYS,
  withdrawalOutcomeOf,
  type PlanOutcome,
} from '../plans/withdrawal.js';
import { customerActor } from './auth-common.js';
import { hasUnsafeTextChars } from './names.js';
import {
  notifyStaffOfOrder,
  notifyStaffOfWithdrawal,
  sendOrderConfirmation,
  sendWithdrawalReceipt,
} from './order-mail.js';
import { settlePlanAfterWithdrawal } from './withdrawal-plan.js';

export type RequestResult = { ok: true } | { ok: false; key: string };
/** Приетата поръчка: номерата на поръчките, които е заменила — съобщението на екрана ги казва. */
export type OrderResult = { ok: true; replaced: string[] } | { ok: false; key: string };

/** Толкова поръчки за 24 часа на акаунт — истинският клиент прави една-две, поправката на грешка — още една. */
const ORDERS_PER_DAY = 5;

const orderSchema = z.object({
  option: z.string().refine(isOptionId),
  buyer: z.enum(['consumer', 'business']),
  early: z.literal('yes').optional(),
  message: z
    .string()
    .refine((value) => !hasUnsafeTextChars(value))
    .optional(),
});

/**
 * Поръчка на Premium или Lifetime — със задължение за плащане. Договорът се сключва с нея и
 * потвърждението тръгва веднага по имейл. Цената се смята тук, от ценоразписа — от клиента идват
 * само изборите. Искането за ранно начало се приема само от потребител и само с отметката му.
 * Една неизпълнена поръчка на акаунт: новата заменя старата — екипът и клиентът научават коя.
 */
export async function createUpgradeRequest(
  user: User,
  raw: unknown,
  meta: RequestMeta,
  now: Date = new Date(),
): Promise<OrderResult> {
  const parsed = orderSchema.safeParse(raw);
  if (!parsed.success) {
    const buyerMissing = parsed.error.issues.some((issue) => issue.path[0] === 'buyer');
    return { ok: false, key: buyerMissing ? 'plan.errors.buyer' : 'error.badInput' };
  }
  if (user.plan === 'LIFETIME') return { ok: false, key: 'plan.request.alreadyLifetime' };
  // договорът и отказът минават по имейла — само по адрес, който акаунтът е потвърдил
  if (!user.emailVerifiedAt) return { ok: false, key: 'plan.errors.unverified' };
  const input = parsed.data;
  const option = input.option;
  const buyerType = input.buyer === 'business' ? 'BUSINESS' : 'CONSUMER';
  const message = (input.message ?? '').trim().slice(0, 1000);
  const created = await prisma.$transaction(async (tx) => {
    // Поръчките на един акаунт — една след друга, и при паралелни заявки: таванът и „една неизпълнена
    // поръчка“ не се заобикалят. Ключът е само за поръчките (двете числа не се засичат с ключа на одита)
    // и се взима преди редовете — редът на заключване спрямо активирането и отказа не се обръща.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(7241021, hashtext(${user.id}))`;
    // всяка поръчка праща писмо на човека и на екипа: таван на акаунт, за да не изчерпи квотата на пощата
    const recent = await tx.upgradeRequest.count({
      where: { userId: user.id, createdAt: { gt: addDays(now, -1) } },
    });
    if (recent >= ORDERS_PER_DAY) return null;
    const order = await tx.upgradeRequest.create({
      data: {
        userId: user.id,
        option,
        months: optionMonths(option),
        listPriceCents: optionPriceCents(option),
        message: message || null,
        buyerType,
        earlyStartRequestedAt: buyerType === 'CONSUMER' && input.early === 'yes' ? now : null,
        termsVersion: LEGAL_UPDATED.terms,
        createdAt: now,
      },
    });
    // Заменените поръчки помнят коя ги е заменила: повторното писмо от поддръжката казва същото като първото.
    const replaced = await tx.upgradeRequest.updateManyAndReturn({
      where: { userId: user.id, status: 'OPEN', id: { not: order.id } },
      data: {
        status: 'CANCELLED',
        handledAt: now,
        handledByLabel: LABEL.superseded,
        supersededById: order.id,
      },
      select: { id: true, number: true, createdAt: true },
    });
    return { order, replaced };
  });
  if (!created) return { ok: false, key: 'plan.errors.tooMany' };
  const { order, replaced } = created;
  await audit(customerActor(user, meta), {
    action: 'plan.request.created',
    targetType: 'request',
    targetId: order.id,
    detail: {
      option,
      buyer: buyerType,
      earlyStart: order.earlyStartRequestedAt !== null,
      terms: LEGAL_UPDATED.terms,
      replaced: replaced.map((row) => row.id),
    },
  });
  if (await sendOrderConfirmation(order, user, replaced)) {
    await prisma.upgradeRequest.update({
      where: { id: order.id },
      data: { confirmationSentAt: new Date() },
    });
  }
  void notifyStaffOfOrder(order, user, replaced);
  return { ok: true, replaced: replaced.map(orderNo) };
}

/**
 * Оттегляне на неплатена поръчка, за която няма право на отказ (фирма или след срока). В срока за
 * отказ потребителят ползва функцията за отказ — с потвърждение и писмо за получаването.
 */
export async function cancelOwnRequest(
  user: User,
  requestId: string,
  meta: RequestMeta,
  now: Date = new Date(),
): Promise<boolean> {
  const order = await prisma.upgradeRequest.findFirst({
    where: { id: requestId, userId: user.id, status: 'OPEN' },
  });
  if (!order || canWithdraw(order, now)) return false;
  const result = await prisma.upgradeRequest.updateMany({
    where: { id: requestId, userId: user.id, status: 'OPEN' },
    data: { status: 'CANCELLED', handledAt: now, handledByLabel: LABEL.cancelledByCustomer },
  });
  if (result.count === 1) {
    await audit(customerActor(user, meta), {
      action: 'plan.request.cancelled',
      targetType: 'request',
      targetId: requestId,
    });
  }
  return result.count === 1;
}

/** Поръчка, от която потребителят може да се откаже сега — за страницата с потвърждението. */
export async function withdrawableOrder(user: User, requestId: string, now: Date = new Date()) {
  const order = await prisma.upgradeRequest.findFirst({
    where: { id: requestId, userId: user.id },
  });
  return order && canWithdraw(order, now) ? order : null;
}

/**
 * Отказ от договора (чл. 11а от Директива 2011/83): поръчката става WITHDRAWN. Ако вече е била
 * активирана и оттогава планът не е пипан, планът се връща към състоянието преди нея — иначе го
 * оправя екипът. Поръчката се заключва първа, затова отказ и активиране едновременно не се разминават.
 */
export async function withdrawFromOrder(
  user: User,
  requestId: string,
  meta: RequestMeta,
  now: Date = new Date(),
): Promise<RequestResult> {
  const before = await withdrawableOrder(user, requestId, now);
  if (!before) return { ok: false, key: 'plan.withdraw.unavailable' };
  const outcome = await prisma.$transaction(async (tx): Promise<PlanOutcome | null> => {
    const locked = await tx.upgradeRequest.updateMany({
      where: {
        id: requestId,
        userId: user.id,
        status: { in: ['OPEN', 'DONE'] },
        withdrawnAt: null,
      },
      data: { status: 'WITHDRAWN', withdrawnAt: now },
    });
    if (locked.count !== 1) return null;
    await tx.$executeRaw`SELECT 1 FROM "User" WHERE "id" = ${user.id} FOR UPDATE`;
    const result = await settlePlanAfterWithdrawal(tx, user, before);
    // изходът се пази: повторното писмо и панелът го четат, вместо да го извеждат наново
    await tx.upgradeRequest.update({
      where: { id: requestId },
      data: { withdrawalOutcome: result },
    });
    return result;
  });
  if (!outcome) return { ok: false, key: 'plan.withdraw.unavailable' };
  const order = { ...before, status: 'WITHDRAWN' as const, withdrawnAt: now };
  await audit(customerActor(user, meta), {
    action: 'plan.request.withdrawn',
    targetType: 'request',
    targetId: requestId,
    detail: { plan: outcome, earlyStart: order.earlyStartRequestedAt !== null },
  });
  if (await sendWithdrawalReceipt(order, user, outcome)) {
    await prisma.upgradeRequest.update({
      where: { id: requestId },
      data: { withdrawalAckSentAt: new Date() },
    });
  }
  void notifyStaffOfWithdrawal(order, user, outcome);
  return { ok: true };
}

/**
 * Поддръжката: потвърждение на договор или на отказ, което не е тръгнало (SMTP грешка), се праща пак.
 * Само за поръчки от последните дни и не по-млади от 10 минути — тези още ги праща самата заявка — и само
 * на живи акаунти: от поръчката на изтрит акаунт е останал само договорът.
 */
export async function resendOrderMail(now: Date = new Date()): Promise<number> {
  const recent = addDays(now, -(WITHDRAWAL_DAYS + 16));
  const settled = new Date(now.getTime() - 10 * 60_000);
  const pending = await prisma.upgradeRequest.findMany({
    where: {
      termsVersion: { not: null },
      userId: { not: null },
      OR: [
        {
          confirmationSentAt: null,
          status: { in: ['OPEN', 'DONE'] },
          createdAt: { gt: recent, lt: settled },
        },
        {
          status: 'WITHDRAWN',
          withdrawalAckSentAt: null,
          withdrawnAt: { gt: recent, lt: settled },
        },
      ],
    },
    include: {
      user: true,
      planChanges: { where: { note: LABEL.withdrawal }, take: 1 },
      supersedes: { select: { number: true, createdAt: true }, orderBy: { createdAt: 'asc' } },
    },
    take: 50,
  });
  let sent = 0;
  for (const order of pending) {
    const { user } = order;
    if (!user) continue;
    if (order.status === 'WITHDRAWN') {
      // заявката взима само поръчки с момент на отказа; проверката стеснява типа
      const { withdrawnAt } = order;
      if (!withdrawnAt) continue;
      const outcome = withdrawalOutcomeOf(order);
      if (await sendWithdrawalReceipt({ ...order, withdrawnAt }, user, outcome)) {
        await prisma.upgradeRequest.update({
          where: { id: order.id },
          data: { withdrawalAckSentAt: now },
        });
        sent += 1;
      }
    } else if (await sendOrderConfirmation(order, user, order.supersedes)) {
      await prisma.upgradeRequest.update({
        where: { id: order.id },
        data: { confirmationSentAt: now },
      });
      sent += 1;
    }
  }
  if (pending.length > sent)
    logger.warn({ pending: pending.length - sent }, 'писма за поръчки чакат');
  return sent;
}
