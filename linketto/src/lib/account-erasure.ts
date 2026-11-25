import 'server-only';
import { randomBytes } from 'node:crypto';
import { Prisma } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { prisma } from '@/lib/db';
import { removeUnusedMedia } from '@/lib/media';
import { parseStyle } from '@/lib/style';
import { mediaFileName } from '@/lib/image-process';

// Изтриване на акаунт, което пази фискалните записи (одит 2026-10-09).
//
// Покупките (OSS/Н-18: ДДС, държава, непрекъсната номерация) се пазят 10 г.
// по ЗСч/ЗДДС (чл. 17(3)(б) ОРЗД позволява задържането им). Затова:
//  · няма покупки → истинско каскадно изтриване;
//  · има покупки/поръчки на план → АНОНИМИЗИРАНЕ: личните данни и
//    съдържанието се махат, профилите се свалят, а счетоводните записи
//    остават (FK-овете са Restrict).

export type ErasureResult = 'deleted' | 'anonymized';

export async function eraseUser(userId: string): Promise<ErasureResult> {
  // Пазят се и покупките (OSS/Н-18), и платеният достъп на купувачите
  // (членствата са Entitlement БЕЗ Purchase) — и двата FK са Restrict.
  // Изплатените/заявени реферални бонуси са разход в счетоводството (10 г.) —
  // ReferralPayout е Cascade към User, затова при тях акаунтът се анонимизира.
  // Поръчките на планове (Revolut) са счетоводни записи с ДДС (10 г.) —
  // PlanOrder е Restrict към User, затова акаунт с поръчки се анонимизира.
  const [purchases, entitlements, payouts, planOrders] = await Promise.all([
    prisma.purchase.count({ where: { product: { profile: { userId } } } }),
    prisma.entitlement.count({ where: { product: { profile: { userId } } } }),
    prisma.referralPayout.count({ where: { userId } }),
    prisma.planOrder.count({ where: { userId } }),
  ]);
  if (purchases + entitlements + payouts + planOrders === 0) {
    const owned = await prisma.profile.findMany({ where: { userId }, select: { style: true } });
    await prisma.user.delete({ where: { id: userId } });
    // Качените снимки са лични данни — и при пълно изтриване (каскадата не пипа диска).
    for (const url of mediaUrls(owned)) await removeUnusedMedia(url);
    return 'deleted';
  }

  const profiles = await prisma.profile.findMany({
    where: { userId },
    select: { id: true, style: true },
  });
  const profileIds = profiles.map((p) => p.id);
  const ofProfiles = { profileId: { in: profileIds } };
  // Качените снимки (аватар/фон) са лични данни — махаме и файловете.
  const uploads = mediaUrls(profiles);
  // Случайна парола, която никой не знае — цената на хеша е без значение.
  const passwordHash = await bcrypt.hash(randomBytes(32).toString('hex'), 10);

  await prisma.$transaction([
    prisma.session.deleteMany({ where: { userId } }),
    prisma.loginEvent.deleteMany({ where: { userId } }),
    prisma.referralPayout.deleteMany({ where: { userId } }),
    // Съдържание и данни на посетители на профилите
    prisma.clickEvent.deleteMany({ where: ofProfiles }),
    prisma.link.deleteMany({ where: ofProfiles }),
    prisma.profileTranslation.deleteMany({ where: ofProfiles }),
    prisma.contactMessage.deleteMany({ where: ofProfiles }),
    prisma.report.deleteMany({ where: ofProfiles }),
    prisma.coupon.deleteMany({ where: ofProfiles }),
    prisma.subscriber.deleteMany({ where: ofProfiles }),
    prisma.booking.deleteMany({ where: ofProfiles }),
    prisma.shortLink.deleteMany({ where: ofProfiles }),
    // Продуктите се скриват (пазят се за покупките и платения достъп).
    prisma.product.updateMany({
      where: ofProfiles,
      data: { active: false },
    }),
    // Профилите изчезват публично и освобождават slug/домейна.
    ...profileIds.map((id) =>
      prisma.profile.update({
        where: { id },
        data: {
          published: false,
          customDomain: null,
          slug: `deleted-${id}`,
          accent: null,
          style: Prisma.DbNull,
        },
      }),
    ),
    prisma.user.update({
      where: { id: userId },
      data: {
        email: `deleted-${userId}@deleted.invalid`,
        name: null,
        passwordHash,
        referralCode: null,
        referredById: null,
        referralCreditCents: 0,
        stripeCustomerId: null,
        stripeChargesEnabled: false,
        digestOptOut: true,
        // Платеният план не се пренася върху анонимен акаунт.
        plan: 'FREE',
        planExpiresAt: null,
        planReminded: null,
      },
    }),
  ]);
  // Файловете след транзакцията — провал при изтриване не бива да връща
  // анонимизирането (нереференцирани файлове са безобидни).
  // Само файл, който никой друг профил не сочи (иначе чужд стил би изтрил файла на жертвата — Н4).
  for (const url of uploads) await removeUnusedMedia(url);
  return 'anonymized';
}

/** Нашите качени файлове в стиловете на профилите. */
function mediaUrls(profiles: readonly { style: Prisma.JsonValue }[]): string[] {
  return profiles.flatMap((p) => {
    const style = parseStyle(p.style);
    return [style.avatarUrl, style.bgImageUrl].filter((u): u is string => mediaFileName(u) !== null);
  });
}
