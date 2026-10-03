import type { User } from '@prisma/client';
import { z } from 'zod';
import { audit } from '../audit.js';
import { LEGAL_UPDATED } from '../company.js';
import { prisma } from '../db.js';
import type { RequestMeta } from '../http/meta.js';
import { customerLabel, LABEL } from '../labels.js';
import { logger } from '../logger.js';
import { isOptionId, optionMonths, optionPriceCents } from '../plans/pricing.js';
import { canWithdraw, WITHDRAWAL_DAYS } from '../plans/withdrawal.js';
import { customerActor } from './auth-common.js';
import {
  notifyStaffOfOrder,
  notifyStaffOfWithdrawal,
  sendOrderConfirmation,
  sendWithdrawalReceipt,
  type PlanOutcome,
} from './order-mail.js';

export type RequestResult = { ok: true } | { ok: false; key: string };

const orderSchema = z.object({
  option: z.string().refine(isOptionId),
  buyer: z.enum(['consumer', 'business']),
  early: z.literal('yes').optional(),
  message: z.string().optional(),
});

/**
 * Поръчка на Premium или Lifetime — със задължение за плащане. Договорът се сключва с нея и
 * потвърждението тръгва веднага по имейл. Цената се смята тук, от ценоразписа — от клиента идват
 * само изборите. Искането за ранно начало се приема само от потребител и само с отметката му.
 * Една неплатена поръчка на акаунт: новата заменя старата.
 */
export async function createUpgradeRequest(
  user: User,
  raw: unknown,
  meta: RequestMeta,
  now: Date = new Date(),
): Promise<RequestResult> {
  const parsed = orderSchema.safeParse(raw);
  if (!parsed.success) {
    const buyerMissing = parsed.error.issues.some((issue) => issue.path[0] === 'buyer');
    return { ok: false, key: buyerMissing ? 'plan.errors.buyer' : 'error.badInput' };
  }
  if (user.plan === 'LIFETIME') return { ok: false, key: 'plan.request.alreadyLifetime' };
  // договорът и отказът минават по имейла — само по адрес, който акаунтът е потвърдил
  if (!user.emailVerifiedAt) return { ok: false, key: 'plan.errors.unverified' };
  const input = parsed.data;
  const option = input.option as Parameters<typeof optionPriceCents>[0];
  const buyerType = input.buyer === 'business' ? 'BUSINESS' : 'CONSUMER';
  const message = (input.message ?? '').trim().slice(0, 1000);
  const order = await prisma.$transaction(async (tx) => {
    await tx.upgradeRequest.updateMany({
      where: { userId: user.id, status: 'OPEN' },
      data: { status: 'CANCELLED', handledAt: now, handledByLabel: LABEL.superseded },
    });
    return tx.upgradeRequest.create({
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
  });
  await audit(customerActor(user, meta), {
    action: 'plan.request.created',
    targetType: 'request',
    targetId: order.id,
    detail: {
      option,
      buyer: buyerType,
      earlyStart: order.earlyStartRequestedAt !== null,
      terms: LEGAL_UPDATED.terms,
    },
  });
  if (await sendOrderConfirmation(order, user)) {
    await prisma.upgradeRequest.update({
      where: { id: order.id },
      data: { confirmationSentAt: new Date() },
    });
  }
  void notifyStaffOfOrder(order, user);
  return { ok: true };
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
    const activation = await tx.planChange.findFirst({
      where: { requestId },
      orderBy: { createdAt: 'desc' },
    });
    if (!activation) {
      // Активирана, но без връзка към промяната (или планът е сменен на ръка след поръчката) — не
      // гадаем какво да върнем: оправя го екипът.
      const changedSince = await tx.planChange.count({
        where: { userId: user.id, createdAt: { gt: before.createdAt } },
      });
      return before.status === 'DONE' || changedSince > 0 ? 'manual' : 'open';
    }
    const [latest, current] = await Promise.all([
      tx.planChange.findFirst({ where: { userId: user.id }, orderBy: { createdAt: 'desc' } }),
      tx.user.findUniqueOrThrow({ where: { id: user.id } }),
    ]);
    const untouched =
      latest?.id === activation.id &&
      activation.fromPlan !== null &&
      current.plan === activation.toPlan &&
      (current.planExpiresAt?.getTime() ?? null) === (activation.toExpiresAt?.getTime() ?? null);
    if (!untouched || !activation.fromPlan) return 'manual';
    await tx.user.update({
      where: { id: user.id },
      data: { plan: activation.fromPlan, planExpiresAt: activation.fromExpiresAt },
    });
    await tx.planChange.create({
      data: {
        userId: user.id,
        actorId: user.id,
        actorLabel: customerLabel(user.id),
        fromPlan: current.plan,
        toPlan: activation.fromPlan,
        fromExpiresAt: current.planExpiresAt,
        toExpiresAt: activation.fromExpiresAt,
        note: LABEL.withdrawal,
        requestId,
      },
    });
    return 'reverted';
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
 * Само за поръчки от последните дни и не по-млади от 10 минути — тези още ги праща самата заявка.
 */
export async function resendOrderMail(now: Date = new Date()): Promise<number> {
  const recent = new Date(now.getTime() - (WITHDRAWAL_DAYS + 16) * 86_400_000);
  const settled = new Date(now.getTime() - 10 * 60_000);
  const pending = await prisma.upgradeRequest.findMany({
    where: {
      termsVersion: { not: null },
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
    include: { user: true, planChanges: { where: { note: LABEL.withdrawal }, take: 1 } },
    take: 50,
  });
  let sent = 0;
  for (const order of pending) {
    if (order.status === 'WITHDRAWN') {
      const outcome: PlanOutcome = order.planChanges.length
        ? 'reverted'
        : order.handledById
          ? 'manual'
          : 'open';
      if (await sendWithdrawalReceipt(order, order.user, outcome)) {
        await prisma.upgradeRequest.update({
          where: { id: order.id },
          data: { withdrawalAckSentAt: now },
        });
        sent += 1;
      }
    } else if (await sendOrderConfirmation(order, order.user)) {
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
