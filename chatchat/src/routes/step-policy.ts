import { Router } from 'express';
import { z } from 'zod';
import type { WiredDeps } from '../app.js';
import { appendAudit } from '../audit.js';
import {
  apiError,
  principalOf,
  requireCapability,
  requireCsrf,
  requireUser,
} from '../auth/guards.js';
import {
  APPROVAL_LEVELS,
  DEFAULT_STEP_POLICY,
  SAFETY_LEVELS,
  loadStepPolicy,
} from '../services/steps/policy.js';
import { auditReason } from '../services/users.js';

/**
 * Политиката на клиента за човешкото потвърждение (§11.2): кой разрешава SAFETY_RELEVANT и
 * CONFIGURATIVE стъпки и колко важи разрешението. Само `policy:manage` (администраторът на
 * клиента); всяка промяна — в одита с причината (маскирана). SAFETY_RELEVANT не може да е „без
 * разрешение“ (схемата на входа не го приема); DIRECT_COMMAND не е в политиката — никога.
 */

const PolicyInput = z.object({
  safetyRelevant: z.enum(SAFETY_LEVELS),
  configurative: z.enum(APPROVAL_LEVELS),
  ttlMinutes: z.number().int().min(15).max(1440),
  reason: z.string().trim().min(3).max(500),
});

export function stepPolicyRouter(deps: WiredDeps): Router {
  const router = Router();
  router.use(requireUser, requireCsrf(deps.publicOrigin));
  const manage = requireCapability('policy:manage');

  router.get('/step-policy', manage, async (req, res, next) => {
    try {
      const p = principalOf(req);
      res.json({
        policy: await loadStepPolicy(deps.db, p.user.tenantId),
        defaults: DEFAULT_STEP_POLICY,
      });
    } catch (err) {
      next(err);
    }
  });

  router.put('/step-policy', manage, async (req, res, next) => {
    try {
      const body = PolicyInput.safeParse(req.body);
      if (!body.success) return apiError(res, 400, 'invalid_input');
      const p = principalOf(req);
      const { reason, ...values } = body.data;
      const policy = await deps.db.$transaction(async (tx) => {
        const before = await loadStepPolicy(tx, p.user.tenantId);
        await tx.stepApprovalPolicy.upsert({
          where: { tenantId: p.user.tenantId },
          create: { tenantId: p.user.tenantId, ...values, updatedById: p.user.id },
          update: { ...values, updatedById: p.user.id },
        });
        await appendAudit(tx, {
          tenantId: p.user.tenantId,
          actorId: p.user.id,
          action: 'step.policy.update',
          objectType: 'step_policy',
          objectId: p.user.tenantId,
          detail: { from: { ...before }, to: { ...values }, reason: auditReason(reason) },
        });
        return loadStepPolicy(tx, p.user.tenantId);
      });
      res.json({ policy });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
