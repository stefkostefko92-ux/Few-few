import type { User } from '@prisma/client';
import { audit, SYSTEM_ACTOR } from '../audit.js';
import { prisma } from '../db.js';
import { describeUserAgent } from '../auth/device.js';
import { accountLocale, isLocale } from '../i18n.js';
import type { RequestMeta } from '../http/meta.js';
import { greetingName, mailAccountDeleted } from '../mail/templates.js';
import { customerActor, nameSchema } from './auth-common.js';
import { keepOrdersAsContracts, notifyStaffOfDeletedOrders } from './order-retention.js';
import { reauthCode, reauthPassword } from './reauth.js';

export interface SessionRow {
  id: string;
  current: boolean;
  browser: string;
  os: string;
  ip: string | null;
  country: string | null;
  createdAt: Date;
  lastSeenAt: Date;
}

/** Активните сесии на човека, текущата най-отгоре. */
export async function listSessions(userId: string, currentId: string): Promise<SessionRow[]> {
  const rows = await prisma.session.findMany({
    where: { userId, mfaPassed: true, expiresAt: { gt: new Date() } },
    orderBy: { lastSeenAt: 'desc' },
  });
  return rows
    .map((row) => ({
      id: row.id,
      current: row.id === currentId,
      ...describeUserAgent(row.userAgent),
      ip: row.ip,
      country: row.country,
      createdAt: row.createdAt,
      lastSeenAt: row.lastSeenAt,
    }))
    .sort((a, b) => Number(b.current) - Number(a.current));
}

/** Прекратява една собствена сесия (чужда не може — проверява се userId). */
export async function revokeOwnSession(
  user: User,
  sessionId: string,
  meta: RequestMeta,
): Promise<boolean> {
  const result = await prisma.session.deleteMany({ where: { id: sessionId, userId: user.id } });
  if (result.count === 1) {
    await audit(customerActor(user, meta), {
      action: 'auth.session.revoked',
      targetType: 'user',
      targetId: user.id,
    });
  }
  return result.count === 1;
}

export async function revokeOtherSessions(
  user: User,
  currentId: string,
  meta: RequestMeta,
): Promise<void> {
  const result = await prisma.session.deleteMany({
    where: { userId: user.id, id: { not: currentId } },
  });
  await audit(customerActor(user, meta), {
    action: 'auth.session.revoked.others',
    targetType: 'user',
    targetId: user.id,
    detail: { count: result.count },
  });
}

export type ProfileUpdate = { ok: true } | { ok: false; key: string };

export async function updateProfile(
  user: User,
  name: string,
  locale: string,
  meta: RequestMeta,
): Promise<ProfileUpdate> {
  const parsedName = nameSchema.safeParse(name);
  if (!parsedName.success) return { ok: false, key: 'auth.errors.name' };
  if (!isLocale(locale)) return { ok: false, key: 'error.badInput' };
  await prisma.user.update({ where: { id: user.id }, data: { name: parsedName.data, locale } });
  await audit(customerActor(user, meta), {
    action: 'account.profile.updated',
    targetType: 'user',
    targetId: user.id,
  });
  return { ok: true };
}

export type DeleteResult = { ok: true } | { ok: false; key: string };

/**
 * Изтриване на собствения акаунт (чл. 17 GDPR): парола + втори фактор + отметка за потвърждение.
 * Акаунтът и проектите се трият; поръчките остават само с данните на договора (services/order-retention.ts).
 * Последният собственик не може да изтрие себе си — продуктът остава без управление.
 */
export async function deleteOwnAccount(
  user: User,
  input: { password: string; code: string; confirmed: boolean },
  meta: RequestMeta,
): Promise<DeleteResult> {
  if (!input.confirmed) return { ok: false, key: 'account.delete.confirmMissing' };
  // Последният собственик спира преди паролата и кода: резервен код не се харчи за отказ.
  if (user.role === 'OWNER' && (await prisma.user.count({ where: { role: 'OWNER' } })) <= 1) {
    return { ok: false, key: 'account.delete.lastOwner' };
  }
  const denied =
    (await reauthPassword(user, input.password, meta)) ??
    (await reauthCode(user, input.code, meta));
  if (denied) return { ok: false, key: denied };
  // Броенето и изтриването са под ключ на редовете на собствениците: двама собственици, които се
  // трият едновременно, не оставят продукта без управление.
  // Поръчките остават само с данните на договора — в същата транзакция, преди реда на акаунта.
  const kept = await prisma.$transaction(async (tx) => {
    if (user.role === 'OWNER') {
      const owners = await tx.$queryRaw<Array<{ id: string }>>`
        SELECT "id" FROM "User" WHERE "role" = 'OWNER' FOR UPDATE`;
      if (owners.length <= 1) return null;
    }
    const orders = await keepOrdersAsContracts(tx, user, new Date());
    await tx.user.delete({ where: { id: user.id } });
    return orders;
  });
  if (!kept) return { ok: false, key: 'account.delete.lastOwner' };
  const locale = accountLocale(user);
  await audit(
    { ...SYSTEM_ACTOR, ip: meta.ip },
    {
      action: 'account.deleted.self',
      targetType: 'user',
      targetId: user.id,
      detail: { ordersKept: kept.count, ordersCancelled: kept.cancelled },
    },
  );
  void mailAccountDeleted(user.email, locale, greetingName(user), kept.count > 0);
  notifyStaffOfDeletedOrders(user.email, kept);
  return { ok: true };
}
