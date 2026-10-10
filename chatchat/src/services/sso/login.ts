import {
  Prisma,
  type PrismaClient,
  type SsoConfig,
  type SsoLinkMethod,
  type User,
} from '@prisma/client';
import { appendAudit } from '../../audit.js';
import type { ExternalLogin } from './claims.js';
import { covers, domainVerifiedFor, linkUsable, ownerLinkRequired } from './policy.js';

/**
 * Свързване на входа от доставчика с локален акаунт. Акаунти НЕ се създават. Първият вход е по
 * проверен имейл в ДОКАЗАН домейн на този доставчик → записва се (issuer, externalSubject) с
 * `linkMethod = EMAIL`; оттам нататък — само по него (смяна на имейла при доставчика не мести входа
 * към друг акаунт). По имейл НЕ се свързват платформеният администратор (никога през SSO) и
 * акаунтите, които се свързват само от собственика (`ownerLinkRequired` — администраторът на
 * клиента и всеки с включен локален TOTP). Всеки отказ е един и същ за човека (`sso_denied`), освен
 * `owner_link_required` — той казва на собственика как да се свърже; причината е в одита.
 */

export type DenyReason =
  | 'email_unverified'
  | 'domain_not_allowed'
  | 'unknown_user'
  | 'other_tenant'
  | 'not_covered'
  | 'inactive'
  | 'link_conflict'
  | 'platform_admin'
  | 'owner_link_required';

export type ResolveResult =
  | { ok: true; user: User; firstLink: boolean; linkMethod: SsoLinkMethod }
  | { ok: false; reason: DenyReason; userId: string | null };

function usable(
  user: User,
  cfg: SsoConfig,
  now: Date,
): { ok: true } | { ok: false; reason: DenyReason } {
  if (user.tenantId !== cfg.tenantId) return { ok: false, reason: 'other_tenant' };
  // Операторът на платформата — само с парола + TOTP (и вече свързана идентичност не помага).
  if (user.role === 'PLATFORM_ADMIN') return { ok: false, reason: 'platform_admin' };
  if (!covers(cfg, user)) return { ok: false, reason: 'not_covered' };
  if (!user.active || (user.expiresAt !== null && user.expiresAt <= now)) {
    return { ok: false, reason: 'inactive' };
  }
  return { ok: true };
}

/**
 * Връзка, която вече не може да вписва (платформен администратор, или ранг на администратор с
 * връзка, която не е направил сам) — изтрива се: следващият опит е „първо свързване“ и минава по
 * правилата. Одит без актьор (системно), само id-та.
 */
async function dropLink(
  db: PrismaClient,
  link: { id: string; tenantId: string; userId: string; configId: string },
  reason: DenyReason,
): Promise<void> {
  const gone = await db.externalIdentity.deleteMany({ where: { id: link.id } });
  if (gone.count === 0) return;
  await appendAudit(db, {
    tenantId: link.tenantId,
    actorId: null,
    action: 'sso.identity_unlinked',
    objectType: 'user',
    objectId: link.userId,
    detail: { configId: link.configId, reason },
  });
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
    if (!linkUsable(linked.user, linked.linkMethod)) {
      const reason =
        linked.user.role === 'PLATFORM_ADMIN' ? 'platform_admin' : 'owner_link_required';
      await dropLink(db, linked, reason);
      return { ok: false, reason, userId: linked.user.id };
    }
    const check = usable(linked.user, cfg, now);
    if (!check.ok) return { ok: false, reason: check.reason, userId: linked.user.id };
    await db.externalIdentity.update({ where: { id: linked.id }, data: { lastLoginAt: now } });
    return { ok: true, user: linked.user, firstLink: false, linkMethod: linked.linkMethod };
  }

  // Първи вход: само проверен имейл в ДОКАЗАН домейн на ТОЗИ доставчик.
  if (!login.email) return { ok: false, reason: 'email_unverified', userId: null };
  if (!(await domainVerifiedFor(db, cfg.id, login.email))) {
    return { ok: false, reason: 'domain_not_allowed', userId: null };
  }
  const user = await db.user.findUnique({ where: { email: login.email } });
  if (!user) return { ok: false, reason: 'unknown_user', userId: null };
  // Чужд клиент: същият отговор като за непознат — не издава, че имейлът съществува другаде.
  if (user.tenantId !== cfg.tenantId) return { ok: false, reason: 'other_tenant', userId: null };
  const check = usable(user, cfg, now);
  if (!check.ok) return { ok: false, reason: check.reason, userId: user.id };
  if (ownerLinkRequired(user)) return { ok: false, reason: 'owner_link_required', userId: user.id };
  try {
    await db.externalIdentity.create({
      data: {
        tenantId: cfg.tenantId,
        userId: user.id,
        configId: cfg.id,
        issuer: login.issuer,
        externalSubject: login.subject,
        linkMethod: 'EMAIL',
        lastLoginAt: now,
      },
    });
  } catch (err) {
    // Акаунтът вече е свързан с ДРУГА идентичност (или паралелен първи вход) — без тихо
    // пренасочване: администраторът развързва изрично (или собственикът се свързва наново сам).
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      return { ok: false, reason: 'link_conflict', userId: user.id };
    }
    throw err;
  }
  // Свързването е промяна по акаунта (не активност на човека) — вижда го и администраторът на клиента.
  await appendAudit(db, {
    tenantId: cfg.tenantId,
    actorId: user.id,
    action: 'sso.identity_linked',
    objectType: 'user',
    objectId: user.id,
    detail: { configId: cfg.id, method: 'email' },
  });
  return { ok: true, user, firstLink: true, linkMethod: 'EMAIL' };
}
