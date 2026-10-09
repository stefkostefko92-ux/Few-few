import { Prisma, type Role } from '@prisma/client';
import { Router } from 'express';
import { z } from 'zod';
import type { AppDeps } from '../app.js';
import { appendAudit } from '../audit.js';
import {
  apiError,
  principalOf,
  requireCapability,
  requireCsrf,
  requireUser,
} from '../auth/guards.js';
import { kindForRole, ROLES, roleRank } from '../auth/rbac.js';
import { announceRevocation, revokeUserSessions, type RevocationReason } from '../auth/sessions.js';
import { UserListQuerySchema, userWhere } from '../services/filters.js';
import {
  auditReason,
  directoryView,
  INVITE_TTL_HOURS,
  isErased,
  issuePasswordLink,
  PROBLEM_STATUS,
  targetProblem,
  unusablePasswordHash,
} from '../services/users.js';

/**
 * Директорията на потребителите (FR-22, §14.1 GET /admin/users, PATCH /users/{id}/admin). Всичко е
 * в клиента на администратора (tenantId във всяка заявка — чужд акаунт е 404), с одит (кой, защо)
 * и без пароли: нов акаунт получава еднократен линк за задаване, не парола.
 */

const Id = z.string().min(1).max(40);
export const Reason = z.string().trim().min(3).max(500);
const isoDate = z.iso.datetime({ offset: true }).transform((v) => new Date(v));

const CreateUser = z
  .object({
    email: z.string().trim().toLowerCase().email().max(254),
    name: z.string().trim().min(2).max(120),
    role: z.enum(ROLES),
    companyId: Id.nullable().optional(),
    expiresAt: isoDate.nullable().optional(),
    locale: z.enum(['it', 'en', 'bg']).default('it'),
    reason: Reason.optional(),
  })
  .strict();

const AdminPatch = z
  .object({
    role: z.enum(ROLES).optional(),
    active: z.boolean().optional(),
    expiresAt: isoDate.nullable().optional(),
    companyId: Id.nullable().optional(),
    reason: Reason,
  })
  .strict();

export function usersGuard(deps: AppDeps) {
  return [requireUser, requireCsrf(deps.publicOrigin), requireCapability('users:manage')];
}

const withCompany = { company: { select: { id: true, name: true } } } as const;

export function adminUsersRouter(deps: AppDeps): Router {
  const router = Router();
  const guard = usersGuard(deps);

  router.get('/admin/users', ...guard, async (req, res, next) => {
    try {
      const parsed = UserListQuerySchema.safeParse(req.query);
      if (!parsed.success) return apiError(res, 400, 'invalid_input');
      const { cursor, limit, ...filter } = parsed.data;
      const { tenantId } = principalOf(req).user;
      const where = userWhere(tenantId, filter);
      // Курсор по (име, id): последният ред от предната страница, само от този клиент.
      if (cursor) {
        const last = await deps.db.user.findFirst({
          where: { id: cursor, tenantId },
          select: { id: true, name: true },
        });
        if (!last) return apiError(res, 400, 'invalid_cursor');
        (where.AND as Prisma.UserWhereInput[]).push({
          OR: [{ name: { gt: last.name } }, { name: last.name, id: { gt: last.id } }],
        });
      }
      const rows = await deps.db.user.findMany({
        where,
        include: withCompany,
        orderBy: [{ name: 'asc' }, { id: 'asc' }],
        take: limit + 1,
      });
      const page = rows.slice(0, limit);
      res.json({
        users: page.map(directoryView),
        next: rows.length > limit ? (page.at(-1)?.id ?? null) : null,
      });
    } catch (err) {
      next(err);
    }
  });

  router.post('/admin/users', ...guard, async (req, res, next) => {
    try {
      const parsed = CreateUser.safeParse(req.body);
      if (!parsed.success) return apiError(res, 400, 'invalid_input');
      const p = principalOf(req);
      const input = parsed.data;
      if (roleRank(input.role) > roleRank(p.user.role))
        return apiError(res, 403, 'role_not_allowed');
      if (input.expiresAt && input.expiresAt <= new Date()) {
        return apiError(res, 400, 'invalid_input');
      }
      const kind = kindForRole(input.role);
      const companyId = input.companyId ?? null;
      if (kind === 'PORTAL' && companyId === null) return apiError(res, 422, 'company_required');
      if (companyId !== null && !(await companyInTenant(deps, p.user.tenantId, companyId))) {
        return apiError(res, 422, 'unknown_company');
      }
      let user;
      try {
        user = await deps.db.user.create({
          data: {
            tenantId: p.user.tenantId,
            companyId,
            email: input.email,
            name: input.name,
            role: input.role,
            kind,
            locale: input.locale,
            expiresAt: input.expiresAt ?? null,
            passwordHash: await unusablePasswordHash(),
          },
          include: withCompany,
        });
      } catch (err) {
        if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
          return apiError(res, 409, 'email_taken');
        }
        throw err;
      }
      const link = await issuePasswordLink(deps.db, {
        pepper: deps.sessions.pepper,
        origin: deps.publicOrigin,
        userId: user.id,
        createdById: p.user.id,
        ttlHours: INVITE_TTL_HOURS,
      });
      await appendAudit(deps.db, {
        tenantId: p.user.tenantId,
        actorId: p.user.id,
        action: 'user.create',
        objectType: 'user',
        objectId: user.id,
        detail: { role: user.role, kind: user.kind, reason: auditReason(input.reason) },
      });
      res.status(201).json({
        user: directoryView(user),
        setPasswordUrl: link.url,
        setPasswordExpiresAt: link.expiresAt,
      });
    } catch (err) {
      next(err);
    }
  });

  // §14.1 PATCH /users/{id}/admin: роля, активност, срок, фирма — със задължителна причина.
  router.patch('/users/:id/admin', ...guard, async (req, res, next) => {
    try {
      const id = Id.safeParse(req.params.id);
      const parsed = AdminPatch.safeParse(req.body);
      if (!id.success || !parsed.success) return apiError(res, 400, 'invalid_input');
      const p = principalOf(req);
      const input = parsed.data;
      const target = await deps.db.user.findFirst({
        where: { id: id.data, tenantId: p.user.tenantId },
        include: withCompany,
      });
      if (!target) return apiError(res, 404, 'not_found');
      const problem =
        targetProblem(p.user, target) ??
        (isErased(target) ? 'user_erased' : null) ??
        (input.role && roleRank(input.role) > roleRank(p.user.role) ? 'role_not_allowed' : null);
      if (problem) return apiError(res, PROBLEM_STATUS[problem] ?? 403, problem);

      const role: Role = input.role ?? target.role;
      const kind = kindForRole(role);
      const companyId = input.companyId === undefined ? target.companyId : input.companyId;
      if (kind === 'PORTAL' && companyId === null) return apiError(res, 422, 'company_required');
      if (
        companyId !== null &&
        companyId !== target.companyId &&
        !(await companyInTenant(deps, p.user.tenantId, companyId))
      ) {
        return apiError(res, 422, 'unknown_company');
      }
      const active = input.active ?? target.active;
      const expiresAt = input.expiresAt === undefined ? target.expiresAt : input.expiresAt;
      const now = new Date();

      const changes: Record<string, { from: unknown; to: unknown }> = {};
      if (role !== target.role) changes.role = { from: target.role, to: role };
      if (kind !== target.kind) changes.kind = { from: target.kind, to: kind };
      if (active !== target.active) changes.active = { from: target.active, to: active };
      if (companyId !== target.companyId)
        changes.companyId = { from: target.companyId, to: companyId };
      if ((expiresAt?.getTime() ?? null) !== (target.expiresAt?.getTime() ?? null)) {
        changes.expiresAt = { from: target.expiresAt, to: expiresAt };
      }
      if (Object.keys(changes).length === 0) return res.json({ user: directoryView(target) });

      const revoke = revocationFor(changes, active, expiresAt, now);
      const { updated, revocation } = await deps.db.$transaction(async (tx) => {
        const updated = await tx.user.update({
          where: { id: target.id },
          data: {
            role,
            kind,
            companyId,
            active,
            expiresAt,
            ...(changes.active ? { deactivatedAt: active ? null : now } : {}),
          },
          include: withCompany,
        });
        const revocation = revoke ? await revokeUserSessions(tx, [target.id], revoke) : null;
        await appendAudit(tx, {
          tenantId: p.user.tenantId,
          actorId: p.user.id,
          action: 'user.admin_update',
          objectType: 'user',
          objectId: target.id,
          detail: {
            reason: auditReason(input.reason),
            changes: JSON.parse(JSON.stringify(changes)) as Record<string, unknown>,
            revokedSessions: revocation?.count ?? 0,
          },
        });
        return { updated, revocation };
      });
      if (revocation) await announceRevocation(revocation);
      res.json({ user: directoryView(updated), revokedSessions: revocation?.count ?? 0 });
    } catch (err) {
      next(err);
    }
  });

  return router;
}

/** AC-16: деактивиране, роля/вид/фирма (обхватът на достъпа) и изтекъл срок → всички сесии падат. */
function revocationFor(
  changes: Record<string, unknown>,
  active: boolean,
  expiresAt: Date | null,
  now: Date,
): RevocationReason | null {
  if (changes.active && !active) return 'deactivated';
  if (changes.role || changes.kind) return 'role_changed';
  if (changes.companyId) return 'scope_changed';
  if (changes.expiresAt && expiresAt !== null && expiresAt <= now) return 'expired';
  return null;
}

async function companyInTenant(deps: AppDeps, tenantId: string, companyId: string) {
  return (await deps.db.company.count({ where: { id: companyId, tenantId } })) === 1;
}
