import type { Company, PrismaClient, Role, User } from '@prisma/client';
import { appendAudit } from '../audit.js';
import { hashPassword } from '../auth/password.js';
import { roleRank } from '../auth/rbac.js';
import { announceRevocation, revokeUserSessions } from '../auth/sessions.js';
import { hashToken, randomToken } from '../crypto.js';
import { tenantByPasswordReset } from '../db/discovery.js';
import { withTenant } from '../db/tenant-context.js';
import { redactPii } from '../domain/pii.js';

/**
 * Идентичност (FR-22/23/25, §12.4): изглед на директорията, линкове за задаване/нулиране на
 * парола, правилата кой кого управлява. Паролата никога не се показва и не се праща — само
 * еднократен линк, чийто токен е в `#` (не стига до сървъра, логовете и Referer).
 */

/** Линк за нулиране от администратора (спецификацията: 24 ч). */
export const RESET_TTL_HOURS = 24;
/** Линк за първа парола на нов акаунт — по-дълъг: човекът може да го види на следващия ден. */
export const INVITE_TTL_HOURS = 72;

export const ERASED_NAME = 'Utente rimosso';

export function erasedEmail(userId: string): string {
  return `erased-${userId}@invalid`;
}

export function isErased(u: Pick<User, 'id' | 'email'>): boolean {
  return u.email === erasedEmail(u.id);
}

export type DirectoryUser = User & { company: Pick<Company, 'id' | 'name'> | null };

/** Полетата на директорията (§14.1 GET /admin/users) — без хешове, тайни и сесии. */
export function directoryView(u: DirectoryUser) {
  return {
    id: u.id,
    name: u.name,
    email: u.email,
    role: u.role,
    kind: u.kind,
    company: u.company ? { id: u.company.id, name: u.company.name } : null,
    active: u.active,
    lastLoginAt: u.lastLoginAt,
    mfaEnabled: u.totpEnabledAt !== null,
    expiresAt: u.expiresAt,
    locale: u.locale,
    erased: isErased(u),
  };
}

/**
 * Може ли актьорът да пипа целта. Изричната проверка за клиента е в заявката (tenantId); тук —
 * себе си (роля/активност/срок/изтриване не се сменят сам) и рангът (не по-висок от своя).
 */
export function targetProblem(
  actor: { id: string; role: Role },
  target: { id: string; role: Role },
  opts: { allowSelf?: boolean } = {},
): 'cannot_modify_self' | 'forbidden' | null {
  if (!opts.allowSelf && actor.id === target.id) return 'cannot_modify_self';
  if (roleRank(target.role) > roleRank(actor.role)) return 'forbidden';
  return null;
}

/** HTTP статусът на проблемите с целта/ролята — един и същ навсякъде. */
export const PROBLEM_STATUS: Record<string, number> = {
  cannot_modify_self: 409,
  forbidden: 403,
  role_not_allowed: 403,
  user_erased: 409,
  company_required: 422,
  unknown_company: 422,
};

/** Причината отива в одита: маскирана от лични данни и с таван на дължината. */
export function auditReason(reason: string | undefined): string | undefined {
  return reason === undefined ? undefined : redactPii(reason).slice(0, 500);
}

/**
 * Нов еднократен линк: предишните неизползвани спират да важат (валиден е само последният).
 * В базата е HMAC на токена; токенът е само в линка, върнат ВЕДНЪЖ.
 */
export async function issuePasswordLink(
  db: PrismaClient,
  opts: { pepper: string; origin: string; userId: string; createdById: string; ttlHours: number },
): Promise<{ url: string; expiresAt: Date }> {
  const token = randomToken();
  const expiresAt = new Date(Date.now() + opts.ttlHours * 3600 * 1000);
  await db.$transaction(async (tx) => {
    await tx.passwordReset.deleteMany({ where: { userId: opts.userId, usedAt: null } });
    await tx.passwordReset.create({
      data: {
        userId: opts.userId,
        tokenHash: hashToken(token, opts.pepper),
        expiresAt,
        createdById: opts.createdById,
      },
    });
  });
  return { url: `${opts.origin}/reset#${token}`, expiresAt };
}

/** Парола, която никой не знае — за нов акаунт, преди човекът да зададе своята по линка. */
export function unusablePasswordHash(): Promise<string> {
  return hashPassword(randomToken(32));
}

/**
 * Нова парола по линк: токенът се консумира атомарно (втори опит със същия → invalid_token),
 * всички сесии падат (AC-16), `passwordChangedAt` се записва. Деактивиран, изтекъл или изтрит
 * акаунт не получава парола — първо администраторът го активира.
 */
export async function resetPasswordWithToken(
  db: PrismaClient,
  pepper: string,
  token: string,
  newPassword: string,
): Promise<boolean> {
  const tokenHash = hashToken(token, pepper);
  // Човекът не е вписан: клиентът — по тесния път (само id по HMAC на токена), после под RLS.
  const tenantId = await tenantByPasswordReset(db, tokenHash);
  if (!tenantId) return false;
  return withTenant(tenantId, () => consumeResetToken(db, tokenHash, newPassword));
}

async function consumeResetToken(
  db: PrismaClient,
  tokenHash: string,
  newPassword: string,
): Promise<boolean> {
  const row = await db.passwordReset.findUnique({
    where: { tokenHash },
    include: { user: true },
  });
  const now = new Date();
  if (
    !row ||
    row.usedAt !== null ||
    row.expiresAt <= now ||
    !row.user.active ||
    (row.user.expiresAt !== null && row.user.expiresAt <= now) ||
    isErased(row.user)
  ) {
    return false;
  }
  const passwordHash = await hashPassword(newPassword);
  const revocation = await db.$transaction(async (tx) => {
    const used = await tx.passwordReset.updateMany({
      where: { id: row.id, usedAt: null, expiresAt: { gt: new Date() } },
      data: { usedAt: new Date() },
    });
    if (used.count !== 1) return null;
    await tx.user.update({
      where: { id: row.userId },
      data: { passwordHash, passwordChangedAt: new Date() },
    });
    await tx.passwordReset.deleteMany({ where: { userId: row.userId, usedAt: null } });
    const revoked = await revokeUserSessions(tx, [row.userId], 'password_reset');
    await appendAudit(tx, {
      tenantId: row.user.tenantId,
      actorId: row.userId,
      action: 'user.password_reset',
      objectType: 'user',
      objectId: row.userId,
      detail: { revokedSessions: revoked.count },
    });
    return revoked;
  });
  if (!revocation) return false;
  await announceRevocation(revocation);
  return true;
}

export type BulkAction = 'deactivate' | 'activate' | 'revoke_sessions' | 'set_expiry';

export interface BulkTarget {
  id: string;
  email: string;
  role: Role;
  active: boolean;
  expiresAt: Date | null;
}

/**
 * Кои от избраните акаунти масовото действие наистина засяга (§12.4 „anteprima del numero“).
 * Пропуска себе си, по-високия ранг, изтритите и действията без ефект (вече деактивиран…).
 */
export function bulkPlan(
  actor: { id: string; role: Role },
  targets: readonly BulkTarget[],
  action: BulkAction,
  expiresAt: Date | null = null,
): { affected: string[]; skipped: number } {
  const affected: string[] = [];
  for (const t of targets) {
    if (targetProblem(actor, t) !== null || isErased(t)) continue;
    if (action === 'deactivate' && !t.active) continue;
    if (action === 'activate' && t.active) continue;
    if (
      action === 'set_expiry' &&
      (t.expiresAt?.getTime() ?? null) === (expiresAt?.getTime() ?? null)
    )
      continue;
    affected.push(t.id);
  }
  return { affected, skipped: targets.length - affected.length };
}
