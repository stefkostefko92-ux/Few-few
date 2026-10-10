import { Router } from 'express';
import type { AppDeps } from '../app.js';
import { apiError, principalOf, requireUser } from '../auth/guards.js';
import { DocSearchQuery, searchDocuments } from '../services/doc-search.js';
import { perUserLimit, sendFailure } from './collab-common.js';

/**
 * FR-03 — самостоятелното търсене на документи от техника (§12.1, извън чата): същите филтри като
 * AI (`store/scope.ts`) + валидност, по продукт/табло/тип/език/текст. Само четене; лимит по човек
 * (изброяването на знанието не е безплатно). В одита не влиза (не е действие по данни и не носи
 * съдържание извън вече видимото във визуализатора).
 */
export function docSearchRouter(deps: AppDeps): Router {
  const router = Router();
  const limiter = perUserLimit(60 * 1000, 60);

  router.get('/documents/search', requireUser, limiter, async (req, res, next) => {
    try {
      const parsed = DocSearchQuery.safeParse(req.query);
      if (!parsed.success) return apiError(res, 400, 'invalid_input');
      const result = await searchDocuments(deps.db, principalOf(req), parsed.data);
      if (sendFailure(res, result)) return;
      res.json(result.value);
    } catch (err) {
      next(err);
    }
  });

  return router;
}
