import type { UpgradeRequest, User } from '@prisma/client';
import { audit, SYSTEM_ACTOR } from '../audit.js';
import { prisma } from '../db.js';
import { describeUserAgent, hwidLabel } from '../auth/device.js';
import { accountLocale, isLocale } from '../i18n.js';
import { LABEL } from '../labels.js';
import type { RequestMeta } from '../http/meta.js';
import { greetingName, mailAccountDeleted } from '../mail/templates.js';
import { customerActor, nameSchema } from './auth-common.js';
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
  const deleted = await prisma.$transaction(async (tx) => {
    if (user.role === 'OWNER') {
      const owners = await tx.$queryRaw<Array<{ id: string }>>`
        SELECT "id" FROM "User" WHERE "role" = 'OWNER' FOR UPDATE`;
      if (owners.length <= 1) return false;
    }
    await tx.user.delete({ where: { id: user.id } });
    return true;
  });
  if (!deleted) return { ok: false, key: 'account.delete.lastOwner' };
  const locale = accountLocale(user);
  await audit(
    { ...SYSTEM_ACTOR, ip: meta.ip },
    { action: 'account.deleted.self', targetType: 'user', targetId: user.id },
  );
  void mailAccountDeleted(user.email, locale, greetingName(user));
  return { ok: true };
}

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
    bans: user.bans.map((b) => ({ at: b.createdAt, reason: b.reason, liftedAt: b.liftedAt })),
    orders: user.upgradeRequests.map((r) => ({
      id: r.id,
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
