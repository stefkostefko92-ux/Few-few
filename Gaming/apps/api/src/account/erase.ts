import { prisma } from "@aso/db";
import { revokeUser } from "../auth/revocation.js";
import { getStripe, stripeEnabled } from "../economy/stripe.js";
import { logger } from "../logger.js";

/**
 * GDPR право на изтриване (чл. 17). Анонимизира акаунта вместо твърдо
 * изтриване, за да оцелеят финансовите записи (покупки) в неидентифицируем вид;
 * редът става неизползваем за вход. Общо за самоизтриването (`/api/account/
 * delete`) и за изтриването от OWNER в админ панела — едно поведение, едно място.
 *
 * Не пипа бисквитки (това е работа на HTTP слоя при самоизтриване) и не проверява
 * права — викащият гарантира, че потребителят съществува и не е вече изтрит.
 */
export async function eraseUser(id: string): Promise<void> {
  // Отменяме живия Stripe абонамент, за да не се таксува изтрит акаунт
  // (best-effort; никога не блокира изтриването).
  const sub = await prisma.subscription.findUnique({ where: { userId: id } });
  if (sub && stripeEnabled()) {
    try {
      await getStripe().subscriptions.cancel(sub.stripeSubId);
    } catch (err) {
      logger.warn({ err, userId: id }, "stripe cancel on erasure failed");
    }
  }

  await prisma.$transaction([
    // Махаме идентификационни данни, федеративни връзки, социален граф и лично съдържание.
    prisma.oAuthAccount.deleteMany({ where: { userId: id } }),
    prisma.authToken.deleteMany({ where: { userId: id } }),
    prisma.notification.deleteMany({ where: { userId: id } }),
    prisma.friendship.deleteMany({
      where: { OR: [{ requesterId: id }, { addresseeId: id }] },
    }),
    prisma.subscription.deleteMany({ where: { userId: id } }),
    // Анонимизираме PII и спираме входа. Имейлът се пренаписва до уникален,
    // немаршрутизируем адрес заради unique ограничението.
    prisma.user.update({
      where: { id },
      data: {
        email: `deleted+${id}@deleted.invalid`,
        displayName: "Изтрит играч",
        passwordHash: null,
        emailVerified: false,
        deletedAt: new Date(),
        // Обезсилва всички refresh токени (защита в дълбочина до `deletedAt`).
        tokenVersion: { increment: 1 },
      },
    }),
  ]);

  // Живите access токени спират веднага.
  await revokeUser(id);
}
