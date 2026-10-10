import type { UpgradeRequest } from '@prisma/client';
import { prisma } from '../db.js';
import { hwidLabel } from '../auth/device.js';
import { accountLocale, translatorFor } from '../i18n.js';
import { LABEL } from '../labels.js';
import { orderNo } from '../plans/order-number.js';
import { ORDER_RETENTION_YEARS, ordersKeptText } from '../retention.js';
import { ORDER_FIELDS_KEPT } from './order-retention.js';

/*
 * Износът на данните на човека (чл. 15 и 20 ОРЗД) — отделен от останалите действия върху собствения
 * акаунт (services/account-self.ts).
 */

/**
 * Таваните на входовете и одита в износа (памет на процеса). Взимат се НАЙ-НОВИТЕ записи — при акаунт под
 * атака скорошните са тези, които човекът търси; `truncated` казва, че по-старите са изпуснати.
 */
const EXPORT_MAX_LOGINS = 5000;
const EXPORT_MAX_AUDIT = 20_000;

/** Кой е затворил поръчката — като в историята на плана: „екипът“, без името на служителя. */
function closedBy(r: UpgradeRequest, userId: string): 'you' | 'team' | 'system' | null {
  if (r.handledById) return r.handledById === userId ? 'you' : 'team';
  if (r.handledByLabel === LABEL.cancelledByCustomer) return 'you';
  return r.handledAt ? 'system' : null;
}

/** Редовете идват най-новите първи и с един в повече: връща най-новите `max` по реда на времето. */
function newestInOrder<T>(rows: T[], max: number): { rows: T[]; truncated: boolean } {
  return { rows: rows.slice(0, max).reverse(), truncated: rows.length > max };
}

/**
 * Всичко, което пазим за човека, в машинно четим вид (чл. 15 и 20 GDPR). Без хешове, тайни и токени.
 */
export async function exportOwnData(userId: string): Promise<Record<string, unknown>> {
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    include: {
      projects: { orderBy: { createdAt: 'asc' } },
      planChanges: { orderBy: { createdAt: 'asc' } },
      bans: { orderBy: { createdAt: 'asc' } },
      upgradeRequests: { orderBy: { createdAt: 'asc' } },
      devices: { orderBy: { firstSeenAt: 'asc' } },
      logins: { orderBy: { createdAt: 'desc' }, take: EXPORT_MAX_LOGINS + 1 },
      sessions: true,
      // поисканият нов имейл е лични данни, докато връзката се пази; самият токен — не
      emailTokens: {
        where: { newEmail: { not: null } },
        orderBy: { createdAt: 'asc' },
        select: { newEmail: true, createdAt: true, expiresAt: true, usedAt: true },
      },
    },
  });
  const logins = newestInOrder(user.logins, EXPORT_MAX_LOGINS);
  const t = translatorFor(accountLocale(user));
  const own = [
    user.id,
    ...user.upgradeRequests.map((r) => r.id),
    ...user.projects.map((p) => p.id),
  ];
  const auditEntries = newestInOrder(
    await prisma.auditLog.findMany({
      where: { OR: [{ actorId: user.id }, { targetId: { in: own } }] },
      orderBy: { id: 'desc' },
      take: EXPORT_MAX_AUDIT + 1,
    }),
    EXPORT_MAX_AUDIT,
  );
  return {
    generatedAt: new Date().toISOString(),
    truncated: { logins: logins.truncated, auditLog: auditEntries.truncated },
    // какво остава от поръчките, ако човекът изтрие акаунта, и до кога (решение на собственика)
    retention: {
      ordersAfterAccountDeletion: {
        kept: [...ORDER_FIELDS_KEPT],
        deletedAfterYears: ORDER_RETENTION_YEARS,
        note: t('data.ordersKept', { kept: ordersKeptText(t) }),
      },
    },
    account: {
      id: user.id,
      email: user.email,
      name: user.name,
      locale: user.locale,
      role: user.role,
      createdAt: user.createdAt,
      emailVerifiedAt: user.emailVerifiedAt,
      plan: user.plan,
      planExpiresAt: user.planExpiresAt,
      twoFactorEnabledAt: user.totpEnabledAt,
      lastLoginAt: user.lastLoginAt,
      lastLoginIp: user.lastLoginIp,
      lastLoginCountry: user.lastLoginCountry,
      signupIp: user.signupIp,
      signupCountry: user.signupCountry,
      signupHwid: user.signupFingerprint ? hwidLabel(user.signupFingerprint) : null,
      // съгласието за отпечатъка: кога и на коя версия на текста (null — не е дадено или оттеглено)
      deviceConsent: user.deviceConsentAt
        ? { givenAt: user.deviceConsentAt, textVersion: user.deviceConsentVersion }
        : null,
      bannedAt: user.bannedAt,
      banReason: user.banReason,
    },
    emailChangeRequests: user.emailTokens.map((t) => ({
      newEmail: t.newEmail,
      requestedAt: t.createdAt,
      expiresAt: t.expiresAt,
      usedAt: t.usedAt,
    })),
    projects: user.projects.map((p) => ({
      id: p.id,
      name: p.name,
      type: p.type,
      spec: p.spec,
      createdAt: p.createdAt,
      updatedAt: p.updatedAt,
    })),
    // Кой: както в одита по-долу — името и имейлът на служителя не са данни на този човек.
    planHistory: user.planChanges.map((c) => ({
      at: c.createdAt,
      from: c.fromPlan,
      fromUntil: c.fromExpiresAt,
      to: c.toPlan,
      until: c.toExpiresAt,
      months: c.months,
      priceWithoutVatCents: c.listPriceCents,
      by: c.actorId === user.id ? 'you' : c.actorId ? 'team' : 'system',
      note: c.note,
    })),
    // `mistake` — вдигнато като грешка: основата за удължаването на плана (общите условия, „Блокиране“)
    bans: user.bans.map((b) => ({
      at: b.createdAt,
      reason: b.reason,
      liftedAt: b.liftedAt,
      mistake: b.mistake,
    })),
    orders: user.upgradeRequests.map((r) => ({
      id: r.id,
      number: orderNo(r),
      at: r.createdAt,
      option: r.option,
      months: r.months,
      priceWithoutVatCents: r.listPriceCents,
      buyer: r.buyerType,
      earlyStartRequestedAt: r.earlyStartRequestedAt,
      termsVersion: r.termsVersion,
      message: r.message,
      status: r.status,
      closedAt: r.handledAt,
      closedBy: closedBy(r, user.id),
      supersededBy: r.supersededById,
      confirmationSentAt: r.confirmationSentAt,
      withdrawnAt: r.withdrawnAt,
      withdrawalAckSentAt: r.withdrawalAckSentAt,
      withdrawalOutcome: r.withdrawalOutcome,
    })),
    devices: user.devices.map((d) => ({
      hwid: hwidLabel(d.fingerprintHash),
      summary: d.summary,
      firstSeenAt: d.firstSeenAt,
      lastSeenAt: d.lastSeenAt,
      lastIp: d.lastIp,
      lastCountry: d.lastCountry,
      userAgent: d.userAgent,
    })),
    logins: logins.rows.map((l) => ({
      at: l.createdAt,
      outcome: l.outcome,
      ip: l.ip,
      country: l.country,
      userAgent: l.userAgent,
    })),
    activeSessions: user.sessions.map((s) => ({
      createdAt: s.createdAt,
      lastSeenAt: s.lastSeenAt,
      ip: s.ip,
      country: s.country,
      userAgent: s.userAgent,
    })),
    // Одитът за човека: неговите действия и действията на екипа върху акаунта, поръчките и проектите
    // му. Името и IP адресът на служителя не са негови данни — остава само „екипът“.
    auditLog: auditEntries.rows.map((a) => {
      // Действие на служител върху чужд акаунт: подробностите (причина за бан, хеш на имейл) са за
      // другия човек, не за този (чл. 15, пар. 4 ОРЗД) — остава само какво и кога.
      const aboutOthers = a.actorId === user.id && a.targetId !== null && !own.includes(a.targetId);
      return {
        at: a.at,
        action: a.action,
        by: a.actorId === user.id ? 'you' : a.actorType === 'SYSTEM' ? 'system' : 'team',
        target: aboutOthers ? null : a.targetType,
        detail: aboutOthers ? null : a.detail,
        ip: a.actorId === user.id ? a.ip : null,
      };
    }),
  };
}
