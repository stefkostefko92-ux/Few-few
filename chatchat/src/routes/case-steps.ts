import { Router } from 'express';
import { z } from 'zod';
import type { WiredDeps } from '../app.js';
import {
  apiError,
  principalOf,
  requireCapability,
  requireCsrf,
  requireUser,
} from '../auth/guards.js';
import { findCaseFor } from '../services/cases.js';
import { cancelApproval, decideApproval, requestApproval } from '../services/steps/approvals.js';
import { recordExecution } from '../services/steps/execute.js';
import { pendingApprovalsFor, stepStateFor } from '../services/steps/views.js';
import { sendFailure } from './collab-common.js';

/**
 * Изпълнени стъпки и човешко потвърждение (§11.2, FR-09): техникът отбелязва резултата на
 * проверка и иска разрешение за стъпка, която го изисква; ДРУГ човек от персонала разрешава или
 * отказва с причина. Всеки вход — Zod; чужд клиент/случай = 404.
 */

const Id = z.string().min(1).max(40);
const StepRef = { messageId: Id, step: z.number().int().min(1).max(50) };
const ExecuteInput = z.object({
  ...StepRef,
  result: z.enum(['OK', 'KO', 'NOT_POSSIBLE']),
  note: z.string().trim().max(1000).optional(),
});
const ApprovalInput = z.object({
  ...StepRef,
  note: z.string().trim().max(1000).optional(),
  /** SELF: изричното „прочетох документираната процедура и ще я спазя“. */
  attest: z.boolean().optional(),
});
const DecideInput = z.object({
  decision: z.enum(['GRANT', 'DENY']),
  reason: z.string().trim().min(3).max(1000),
});

export function caseStepsRouter(deps: WiredDeps): Router {
  const router = Router();
  router.use(requireUser, requireCsrf(deps.publicOrigin));

  router.get('/cases/:id/steps', async (req, res, next) => {
    try {
      const id = Id.safeParse(req.params.id);
      if (!id.success) return apiError(res, 400, 'invalid_input');
      const p = principalOf(req);
      const c = await findCaseFor(deps.db, p, id.data);
      if (!c) return apiError(res, 404, 'not_found');
      res.json(await stepStateFor(deps.db, p, c));
    } catch (err) {
      next(err);
    }
  });

  router.post('/cases/:id/steps', requireCapability('step:record'), async (req, res, next) => {
    try {
      const id = Id.safeParse(req.params.id);
      const body = ExecuteInput.safeParse(req.body);
      if (!id.success || !body.success) return apiError(res, 400, 'invalid_input');
      const p = principalOf(req);
      const c = await findCaseFor(deps.db, p, id.data);
      if (!c) return apiError(res, 404, 'not_found');
      const result = await recordExecution(deps, p, c, body.data);
      if (sendFailure(res, result)) return;
      const e = result.value;
      res.status(201).json({
        execution: {
          id: e.id,
          messageId: e.messageId,
          step: e.step,
          result: e.result,
          note: e.note,
          approvalId: e.approvalId,
          at: e.createdAt,
        },
      });
    } catch (err) {
      next(err);
    }
  });

  router.post(
    '/cases/:id/steps/approvals',
    requireCapability('step:record'),
    async (req, res, next) => {
      try {
        const id = Id.safeParse(req.params.id);
        const body = ApprovalInput.safeParse(req.body);
        if (!id.success || !body.success) return apiError(res, 400, 'invalid_input');
        const p = principalOf(req);
        const c = await findCaseFor(deps.db, p, id.data);
        if (!c) return apiError(res, 404, 'not_found');
        const result = await requestApproval(deps, p, c, body.data);
        if (sendFailure(res, result)) return;
        const a = result.value;
        res.status(a.status === 'PENDING' ? 202 : 201).json({
          approval: { id: a.id, status: a.status, level: a.level, step: a.step },
        });
      } catch (err) {
        next(err);
      }
    },
  );

  // Чакащите заявки, по които човекът може да реши (опашката на разрешаващия).
  router.get('/approvals', requireCapability('step:approve'), async (req, res, next) => {
    try {
      res.json({ approvals: await pendingApprovalsFor(deps.db, principalOf(req)) });
    } catch (err) {
      next(err);
    }
  });

  router.post(
    '/approvals/:id/decide',
    requireCapability('step:approve'),
    async (req, res, next) => {
      try {
        const id = Id.safeParse(req.params.id);
        const body = DecideInput.safeParse(req.body);
        if (!id.success || !body.success) return apiError(res, 400, 'invalid_input');
        const result = await decideApproval(deps, principalOf(req), id.data, body.data);
        if (sendFailure(res, result)) return;
        const a = result.value;
        res.json({
          approval: { id: a.id, status: a.status, decidedAt: a.decidedAt, expiresAt: a.expiresAt },
        });
      } catch (err) {
        next(err);
      }
    },
  );

  router.post('/approvals/:id/cancel', requireCapability('step:record'), async (req, res, next) => {
    try {
      const id = Id.safeParse(req.params.id);
      if (!id.success) return apiError(res, 400, 'invalid_input');
      const result = await cancelApproval(deps, principalOf(req), id.data);
      if (sendFailure(res, result)) return;
      res.json({ approval: { id: result.value.id, status: result.value.status } });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
