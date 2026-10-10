import { randomUUID } from 'node:crypto';
import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import type { AppDeps } from '../app.js';
import { appendAudit } from '../audit.js';
import { apiError, principalOf } from '../auth/guards.js';
import type { TotpReplayGuard } from '../auth/mfa.js';
import { announceRevocation, revokeUserSessions } from '../auth/sessions.js';
import {
  auditReason,
  bulkPlan,
  isErased,
  issuePasswordLink,
  PROBLEM_STATUS,
  RESET_TTL_HOURS,
  targetProblem,
} from '../services/users.js';
import { Reason, usersGuard } from './admin-users.js';

/**
 * Действия на администратора върху акаунти (FR-22/25, AC-16): линк за нова парола, отнемане на
 * сесиите, нулиране на втория фактор, масови действия с предварителен преглед на броя.
 */

const Id = z.string().min(1).max(40);
const isoDate = z.iso.datetime({ offset: true }).transform((v) => new Date(v));
const WithReason = z.object({ reason: Reason }).strict();
const OptionalReason = z.object({ reason: Reason.optional() }).strict();

const Bulk = z
  .object({
    ids: z.array(Id).min(1).max(500),
    action: z.enum(['deactivate', 'activate', 'revoke_sessions', 'set_expiry']),
    /** Само за set_expiry; null = без срок. */
    expiresAt: isoDate.nullable().optional(),
    reason: Reason,
    /** По подразбиране само преглед — промяна иска изрично `dryRun: false`. */
    dryRun: z.boolean().default(true),
  })
  .strict()
  .refine((b) => (b.action === 'set_expiry') === (b.expiresAt !== undefined));

export function adminUserActionsRouter(deps: AppDeps, replay: TotpReplayGuard): Router {
  const router = Router();
  const guard = usersGuard(deps);

  /** Целевият акаунт в клиента на администратора + проверките за себе си и ранга. */
  const loadTarget = async (req: Request, res: Response, opts: { allowSelf?: boolean } = {}) => {
    const id = Id.safeParse(req.params.id);
    if (!id.success) return void apiError(res, 400, 'invalid_input');
    const p = principalOf(req);
    const target = await deps.db.user.findFirst({
      where: { id: id.data, tenantId: p.user.tenantId },
    });
    if (!target) return void apiError(res, 404, 'not_found');
    const problem =
      targetProblem(p.user, target, opts) ?? (isErased(target) ? 'user_erased' : null);
    if (problem) return void apiError(res, PROBLEM_STATUS[problem] ?? 403, problem);
    return { p, target };
  };

  // FR-25: еднократен линк (24 ч), върнат ВЕДНЪЖ. Паролата не се вижда и не се праща от никого.
  router.post('/admin/users/:id/reset-password', ...guard, async (req, res, next) => {
    try {
      const body = OptionalReason.safeParse(req.body);
      if (!body.success) return apiError(res, 400, 'invalid_input');
      const loaded = await loadTarget(req, res, { allowSelf: true });
      if (!loaded) return;
      const { p, target } = loaded;
      const link = await issuePasswordLink(deps.db, {
        pepper: deps.sessions.pepper,
        origin: deps.publicOrigin,
        userId: target.id,
        createdById: p.user.id,
        ttlHours: RESET_TTL_HOURS,
      });
      await appendAudit(deps.db, {
        tenantId: p.user.tenantId,
        actorId: p.user.id,
        action: 'user.reset_link',
        objectType: 'user',
        objectId: target.id,
        detail: { reason: auditReason(body.data.reason), expiresAt: link.expiresAt.toISOString() },
      });
      res.json({ url: link.url, expiresAt: link.expiresAt });
    } catch (err) {
      next(err);
    }
  });

  router.post('/admin/users/:id/revoke-sessions', ...guard, async (req, res, next) => {
    try {
      const body = WithReason.safeParse(req.body);
      if (!body.success) return apiError(res, 400, 'invalid_input');
      const loaded = await loadTarget(req, res);
      if (!loaded) return;
      const { p, target } = loaded;
      const revocation = await revokeUserSessions(deps.db, [target.id], 'admin_revoke');
      await appendAudit(deps.db, {
        tenantId: p.user.tenantId,
        actorId: p.user.id,
        action: 'user.revoke_sessions',
        objectType: 'user',
        objectId: target.id,
        detail: { reason: auditReason(body.data.reason), revokedSessions: revocation.count },
      });
      res.json({ revoked: revocation.count });
    } catch (err) {
      next(err);
    }
  });

  // Изгубено устройство: вторият фактор се изтрива, сесиите падат; при следващия вход човекът го
  // настройва отново (персоналът — задължително).
  router.post('/admin/users/:id/reset-mfa', ...guard, async (req, res, next) => {
    try {
      const body = WithReason.safeParse(req.body);
      if (!body.success) return apiError(res, 400, 'invalid_input');
      const loaded = await loadTarget(req, res);
      if (!loaded) return;
      const { p, target } = loaded;
      const revocation = await deps.db.$transaction(async (tx) => {
        await tx.user.update({
          where: { id: target.id },
          data: { totpSecretEnc: null, totpEnabledAt: null },
        });
        const revoked = await revokeUserSessions(tx, [target.id], 'mfa_reset');
        await appendAudit(tx, {
          tenantId: p.user.tenantId,
          actorId: p.user.id,
          action: 'user.mfa_reset',
          objectType: 'user',
          objectId: target.id,
          detail: { reason: auditReason(body.data.reason), revokedSessions: revoked.count },
        });
        return revoked;
      });
      replay.forget(target.id);
      await announceRevocation(revocation);
      res.json({ revoked: revocation.count });
    } catch (err) {
      next(err);
    }
  });

  // Масови действия (§12.4): dryRun връща колко акаунта ще бъдат засегнати, без да пипа нищо.
  router.post('/admin/users/bulk', ...guard, async (req, res, next) => {
    try {
      const parsed = Bulk.safeParse(req.body);
      if (!parsed.success) return apiError(res, 400, 'invalid_input');
      const p = principalOf(req);
      const { ids, action, reason, dryRun } = parsed.data;
      const expiresAt = parsed.data.expiresAt ?? null;
      const requested = [...new Set(ids)];
      const targets = await deps.db.user.findMany({
        where: { id: { in: requested }, tenantId: p.user.tenantId },
        select: { id: true, email: true, role: true, active: true, expiresAt: true },
      });
      const plan = bulkPlan(p.user, targets, action, expiresAt);
      const skipped = requested.length - plan.affected.length;
      if (dryRun || plan.affected.length === 0) {
        return res.json({
          dryRun,
          action,
          requested: requested.length,
          affected: plan.affected.length,
          skipped,
        });
      }
      const now = new Date();
      const batch = randomUUID();
      const revokes =
        action === 'deactivate' ||
        action === 'revoke_sessions' ||
        (action === 'set_expiry' && expiresAt !== null && expiresAt <= now);
      const revocation = await deps.db.$transaction(async (tx) => {
        const where = { id: { in: plan.affected }, tenantId: p.user.tenantId };
        if (action === 'deactivate') {
          await tx.user.updateMany({ where, data: { active: false, deactivatedAt: now } });
        } else if (action === 'activate') {
          await tx.user.updateMany({ where, data: { active: true, deactivatedAt: null } });
        } else if (action === 'set_expiry') {
          await tx.user.updateMany({ where, data: { expiresAt } });
        }
        const revoked = revokes
          ? await revokeUserSessions(
              tx,
              plan.affected,
              action === 'deactivate'
                ? 'deactivated'
                : action === 'set_expiry'
                  ? 'expired'
                  : 'admin_revoke',
            )
          : null;
        for (const id of plan.affected) {
          await appendAudit(tx, {
            tenantId: p.user.tenantId,
            actorId: p.user.id,
            action: `user.bulk.${action}`,
            objectType: 'user',
            objectId: id,
            detail: {
              batch,
              reason: auditReason(reason),
              ...(action === 'set_expiry' ? { expiresAt: expiresAt?.toISOString() ?? null } : {}),
            },
          });
        }
        return revoked;
      });
      if (revocation) await announceRevocation(revocation);
      res.json({
        dryRun: false,
        action,
        requested: requested.length,
        affected: plan.affected.length,
        skipped,
        revokedSessions: revocation?.count ?? 0,
      });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
