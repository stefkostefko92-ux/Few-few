import { Prisma, type PrismaClient, type SsoConfig, type User } from '@prisma/client';
import type { ExternalLogin } from './claims.js';
import { covers, emailDomain } from './policy.js';

/**
 * Свързване на входа от доставчика с локален акаунт. Акаунти НЕ се създават. Първият вход е по
 * проверен имейл с позволен домейн → записва се (issuer, externalSubject); оттам нататък — само по
 * него (смяна на имейла при доставчика не мести входа към друг акаунт). Всеки отказ е един и същ
 * за човека (`sso_denied`) — причината е само в одита на платформения администратор.
 */

export type DenyReason =
  | 'email_unverified'
  | 'domain_not_allowed'
  | 'unknown_user'
  | 'other_tenant'
  | 'not_covered'
  | 'inactive'
  | 'link_conflict';

export type ResolveResult =
  | { ok: true; user: User; firstLink: boolean }
  | { ok: false; reason: DenyReason; userId: string | null };

function usable(
  user: User,
  cfg: SsoConfig,
  now: Date,
): { ok: true } | { ok: false; reason: DenyReason } {
  if (user.tenantId !== cfg.tenantId) return { ok: false, reason: 'other_tenant' };
  if (!covers(cfg, user)) return { ok: false, reason: 'not_covered' };
  if (!user.active || (user.expiresAt !== null && user.expiresAt <= now)) {
    return { ok: false, reason: 'inactive' };
  }
  return { ok: true };
}

export async function resolveUser(
  db: PrismaClient,
  cfg: SsoConfig,
  login: ExternalLogin,
  now = new Date(),
): Promise<ResolveResult> {
  const linked = await db.externalIdentity.findUnique({
    where: { issuer_externalSubject: { issuer: login.issuer, externalSubject: login.subject } },
    include: { user: true },
  });
  if (linked) {
    if (linked.configId !== cfg.id || linked.tenantId !== cfg.tenantId) {
      return { ok: false, reason: 'other_tenant', userId: null };
    }
    const check = usable(linked.user, cfg, now);
    if (!check.ok) return { ok: false, reason: check.reason, userId: linked.user.id };
    await db.externalIdentity.update({ where: { id: linked.id }, data: { lastLoginAt: now } });
    return { ok: true, user: linked.user, firstLink: false };
  }

  // Първи вход: само проверен имейл в позволен домейн на ТОЗИ доставчик.
  if (!login.email) return { ok: false, reason: 'email_unverified', userId: null };
  const domain = emailDomain(login.email);
  const allowed = domain
    ? await db.ssoDomain.findFirst({ where: { configId: cfg.id, domain }, select: { id: true } })
    : null;
  if (!allowed) return { ok: false, reason: 'domain_not_allowed', userId: null };
  const user = await db.user.findUnique({ where: { email: login.email } });
  if (!user) return { ok: false, reason: 'unknown_user', userId: null };
  // Чужд клиент: същият отговор като за непознат — не издава, че имейлът съществува другаде.
  if (user.tenantId !== cfg.tenantId) return { ok: false, reason: 'other_tenant', userId: null };
  const check = usable(user, cfg, now);
  if (!check.ok) return { ok: false, reason: check.reason, userId: user.id };
  try {
    await db.externalIdentity.create({
      data: {
        tenantId: cfg.tenantId,
        userId: user.id,
        configId: cfg.id,
        issuer: login.issuer,
        externalSubject: login.subject,
        lastLoginAt: now,
      },
    });
  } catch (err) {
    // Акаунтът вече е свързан с ДРУГА идентичност (или паралелен първи вход) — без тихо
    // пренасочване: администраторът развързва изрично.
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      return { ok: false, reason: 'link_conflict', userId: user.id };
    }
    throw err;
  }
  return { ok: true, user, firstLink: true };
}
