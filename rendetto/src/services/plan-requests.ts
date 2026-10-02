import type { User } from '@prisma/client';
import { audit } from '../audit.js';
import { prisma } from '../db.js';
import type { RequestMeta } from '../http/meta.js';
import { LABEL } from '../labels.js';
import { isOptionId, optionMonths, optionPriceCents } from '../plans/pricing.js';
import { customerActor } from './auth-common.js';

export type RequestResult = { ok: true } | { ok: false; key: string };

/**
 * Заявка за Premium или Lifetime. Цената се смята тук, от ценоразписа — от клиента идва само
 * идентификаторът на варианта. Една отворена заявка на акаунт: новата заменя старата.
 */
export async function createUpgradeRequest(
  user: User,
  rawOption: unknown,
  rawMessage: unknown,
  meta: RequestMeta,
): Promise<RequestResult> {
  if (!isOptionId(rawOption)) return { ok: false, key: 'error.badInput' };
  if (user.plan === 'LIFETIME') return { ok: false, key: 'plan.request.alreadyLifetime' };
  const message = typeof rawMessage === 'string' ? rawMessage.trim().slice(0, 1000) : '';
  await prisma.$transaction([
    prisma.upgradeRequest.updateMany({
      where: { userId: user.id, status: 'OPEN' },
      data: {
        status: 'CANCELLED',
        handledAt: new Date(),
        handledByLabel: LABEL.superseded,
      },
    }),
    prisma.upgradeRequest.create({
      data: {
        userId: user.id,
        option: rawOption,
        months: optionMonths(rawOption),
        listPriceCents: optionPriceCents(rawOption),
        message: message || null,
      },
    }),
  ]);
  await audit(customerActor(user, meta), {
    action: 'plan.request.created',
    targetType: 'user',
    targetId: user.id,
    detail: { option: rawOption },
  });
  return { ok: true };
}

export async function cancelOwnRequest(
  user: User,
  requestId: string,
  meta: RequestMeta,
): Promise<boolean> {
  const result = await prisma.upgradeRequest.updateMany({
    where: { id: requestId, userId: user.id, status: 'OPEN' },
    data: { status: 'CANCELLED', handledAt: new Date(), handledByLabel: LABEL.cancelledByCustomer },
  });
  if (result.count === 1) {
    await audit(customerActor(user, meta), {
      action: 'plan.request.cancelled',
      targetType: 'user',
      targetId: user.id,
    });
  }
  return result.count === 1;
}
