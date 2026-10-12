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
import { OPEN_STATUSES } from '../services/proposals/feedback.js';
import { proposeSolvedCase, SolvedCaseInput } from '../services/proposals/solved-case.js';
import { perUserLimit, sendFailure } from './collab-common.js';

/**
 * „Решен случай → знание“ (§11.3, FR-10) — за персонала (`proposal:create`: поддръжка,
 * инженеринг, отговорник за знанието). Порталът няма тази способност, а опашката с предложенията е
 * само в административната конзола (`routes/proposals-admin.ts`, kb:manage).
 */

const Id = z.string().min(1).max(40);

export function proposalsRouter(deps: WiredDeps): Router {
  const router = Router();
  const limiter = perUserLimit(60 * 1000, 20, 'proposals');
  router.use('/proposals', requireUser, requireCsrf(deps.publicOrigin));

  router.post(
    '/proposals/solved-case',
    limiter,
    requireCapability('proposal:create'),
    async (req, res, next) => {
      try {
        const parsed = SolvedCaseInput.safeParse(req.body);
        if (!parsed.success) return apiError(res, 400, 'invalid_input');
        const result = await proposeSolvedCase(deps, principalOf(req), parsed.data);
        if (sendFailure(res, result)) return;
        res.status(201).json({ proposal: result.value });
      } catch (err) {
        next(err);
      }
    },
  );

  // Има ли отворено предложение за този случай (бутонът в панела на случая).
  router.get(
    '/proposals/solved-case/:caseId',
    requireCapability('proposal:create'),
    async (req, res, next) => {
      try {
        const caseId = Id.safeParse(req.params.caseId);
        if (!caseId.success) return apiError(res, 400, 'invalid_input');
        const p = principalOf(req);
        const c = await findCaseFor(deps.db, p, caseId.data);
        if (!c) return apiError(res, 404, 'not_found');
        const row = await deps.db.knowledgeProposal.findFirst({
          where: { tenantId: p.user.tenantId, caseId: c.id, source: 'SOLVED_CASE' },
          orderBy: { createdAt: 'desc' },
          select: {
            id: true,
            status: true,
            createdAt: true,
            draftDocument: { select: { id: true, code: true, revision: true, status: true } },
          },
        });
        res.json({
          proposal: row,
          open: row !== null && (OPEN_STATUSES as readonly string[]).includes(row.status),
        });
      } catch (err) {
        next(err);
      }
    },
  );

  return router;
}
