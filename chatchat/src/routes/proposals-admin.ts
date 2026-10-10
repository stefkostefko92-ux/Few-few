import { Router } from 'express';
import { z } from 'zod';
import type { AppDeps } from '../app.js';
import {
  apiError,
  principalOf,
  requireCapability,
  requireCsrf,
  requireUser,
} from '../auth/guards.js';
import { Reason } from '../services/kb-lifecycle.js';
import {
  getProposal,
  listProposals,
  moveProposal,
  PROPOSAL_SOURCES,
  PROPOSAL_STATUSES,
} from '../services/proposals/queue.js';
import { sendFailure } from './collab-common.js';

/**
 * Опашката с предложенията за знанието (FR-10, §11.3) в административната конзола — САМО
 * `kb:manage` (отговорникът за знанието). Порталът и другите роли получават 403; чуждо
 * предложение — 404. Всички заявки са по tenantId; преходите — в одита.
 */

const Id = z.string().min(1).max(40);
const ListQuery = z.object({
  status: z.enum(PROPOSAL_STATUSES).optional(),
  source: z.enum(PROPOSAL_SOURCES).optional(),
});
const AcceptBody = z.object({ documentId: Id.optional(), errorId: Id.optional() }).strict();
const RejectBody = z.object({ reason: Reason }).strict();

export function adminProposalsRouter(deps: AppDeps): Router {
  const router = Router();
  router.use(
    '/proposals',
    requireUser,
    requireCsrf(deps.publicOrigin),
    requireCapability('kb:manage'),
  );

  router.get('/proposals', async (req, res, next) => {
    try {
      const q = ListQuery.safeParse(req.query);
      if (!q.success) return apiError(res, 400, 'invalid_input');
      res.json(await listProposals(deps.db, principalOf(req).user.tenantId, q.data));
    } catch (err) {
      next(err);
    }
  });

  router.get('/proposals/:id', async (req, res, next) => {
    try {
      const id = Id.safeParse(req.params.id);
      if (!id.success) return apiError(res, 400, 'invalid_input');
      const proposal = await getProposal(deps.db, principalOf(req).user.tenantId, id.data);
      if (!proposal) return apiError(res, 404, 'not_found');
      res.json({ proposal });
    } catch (err) {
      next(err);
    }
  });

  router.post('/proposals/:id/review', async (req, res, next) => {
    try {
      const id = Id.safeParse(req.params.id);
      if (!id.success) return apiError(res, 400, 'invalid_input');
      const result = await moveProposal(deps.db, principalOf(req), id.data, { action: 'review' });
      if (sendFailure(res, result)) return;
      res.json({ proposal: result.value });
    } catch (err) {
      next(err);
    }
  });

  router.post('/proposals/:id/accept', async (req, res, next) => {
    try {
      const id = Id.safeParse(req.params.id);
      const body = AcceptBody.safeParse(req.body ?? {});
      if (!id.success || !body.success) return apiError(res, 400, 'invalid_input');
      const result = await moveProposal(deps.db, principalOf(req), id.data, {
        action: 'accept',
        ...body.data,
      });
      if (sendFailure(res, result)) return;
      res.json({ proposal: result.value });
    } catch (err) {
      next(err);
    }
  });

  router.post('/proposals/:id/reject', async (req, res, next) => {
    try {
      const id = Id.safeParse(req.params.id);
      const body = RejectBody.safeParse(req.body ?? {});
      if (!id.success || !body.success) return apiError(res, 400, 'invalid_input');
      const result = await moveProposal(deps.db, principalOf(req), id.data, {
        action: 'reject',
        reason: body.data.reason,
      });
      if (sendFailure(res, result)) return;
      res.json({ proposal: result.value });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
