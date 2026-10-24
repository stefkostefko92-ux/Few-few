import { prisma } from "@aso/db";

/** Минималната форма на потребител, нужна за проверка на бан. */
export interface BanFields {
  id: string;
  banned: boolean;
  banReason: string | null;
  banUntil: Date | null;
}

/**
 * Действащ ли е банът (§14). Временен бан с изтекъл `banUntil` НЕ се брои и се
 * вдига на място (в базата и в подадения обект), за да не зависи изтичането от
 * това някой админ да отвори админ панела. Общо за вход, refresh, `/me` и OAuth.
 *
 * Вдигането е условно (`banUntil <= сега`), затова е безопасно при надпревара с
 * админ, който междувременно е наложил нов бан. Проваленото вдигане не блокира
 * входа — изтеклият бан така или иначе вече не важи.
 */
export async function isBanActive(user: BanFields, now: Date = new Date()): Promise<boolean> {
  if (!user.banned) return false;
  if (!user.banUntil || user.banUntil.getTime() > now.getTime()) return true;

  await prisma.user
    .updateMany({
      where: { id: user.id, banned: true, banUntil: { not: null, lte: now } },
      data: { banned: false, banReason: null, banUntil: null },
    })
    .catch(() => undefined);
  user.banned = false;
  user.banReason = null;
  user.banUntil = null;
  return false;
}

/**
 * Тялото на отговора 403 `banned`: причината (DSA чл. 17 — изложение на
 * мотивите) и до кога важи банът (ISO; `null` = безсрочен). Клиентът го оформя
 * и показва контакта за обжалване.
 */
export function banDetails(user: BanFields): { reason: string; until: string | null } {
  return { reason: user.banReason ?? "", until: user.banUntil ? user.banUntil.toISOString() : null };
}
