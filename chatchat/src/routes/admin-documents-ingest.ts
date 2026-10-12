import { Router, type Response } from 'express';
import { z } from 'zod';
import type { AppDeps } from '../app.js';
import {
  apiError,
  principalOf,
  requireCapability,
  requireCsrf,
  requireUser,
} from '../auth/guards.js';
import {
  AddItemBody,
  addItem,
  createBatch,
  CreateBatchBody,
  retryItem,
  type BatchError,
} from '../ingest/batches.js';
import { batchView, itemView, recentBatches } from '../ingest/views.js';

/**
 * Пакетното приемане на документи (§4.1, §7.3, NFR-06) — само kb:manage, всичко по клиент:
 *   POST /admin/ingest/batches               общите метаданни (+ манифест CSV/JSON, импорт на кодове)
 *   POST /admin/ingest/batches/:id/items     файл (CLEAN от POST /admin/attachments) → опашката
 *   GET  /admin/ingest/batches[/:id]         напредъкът по файл (polling от UI)
 *   POST /admin/ingest/items/:id/retry       провален файл — наново
 * Документите влизат като ЧЕРНОВА; жизненият цикъл е в admin-documents-lifecycle.ts.
 */

const Id = z.string().min(1).max(40);

function sendError(res: Response, error: BatchError): void {
  if ('issues' in error) {
    res.status(error.status).json({ error: error.code, code: error.code, issues: error.issues });
    return;
  }
  apiError(res, error.status, error.code);
}

export function adminDocumentsIngestRouter(deps: AppDeps): Router {
  const router = Router();
  router.use(
    '/ingest',
    requireUser,
    requireCsrf(deps.publicOrigin),
    requireCapability('kb:manage'),
    (_req, res, next) => {
      // Без хранилище на файлове няма и приемане на файлове (същото като качването).
      if (!deps.ingest || !deps.attachments) return apiError(res, 503, 'ingest_unavailable');
      next();
    },
  );

  router.post('/ingest/batches', async (req, res, next) => {
    try {
      const body = CreateBatchBody.safeParse(req.body);
      if (!body.success) {
        return res.status(400).json({
          error: 'invalid_input',
          code: 'invalid_input',
          issues: body.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
        });
      }
      const u = principalOf(req).user;
      const created = await createBatch(deps.db, { tenantId: u.tenantId, userId: u.id }, body.data);
      if (!created.ok) return sendError(res, created.error);
      res.status(201).json({ batch: await batchView(deps.db, u.tenantId, created.value.id) });
    } catch (err) {
      next(err);
    }
  });

  router.get('/ingest/batches', async (req, res, next) => {
    try {
      const u = principalOf(req).user;
      res.json({ batches: await recentBatches(deps.db, u.tenantId) });
    } catch (err) {
      next(err);
    }
  });

  router.get('/ingest/batches/:id', async (req, res, next) => {
    try {
      const id = Id.safeParse(req.params.id);
      if (!id.success) return apiError(res, 400, 'invalid_input');
      const view = await batchView(deps.db, principalOf(req).user.tenantId, id.data);
      if (!view) return apiError(res, 404, 'not_found');
      res.json({ batch: view });
    } catch (err) {
      next(err);
    }
  });

  router.post('/ingest/batches/:id/items', async (req, res, next) => {
    try {
      const id = Id.safeParse(req.params.id);
      const body = AddItemBody.safeParse(req.body);
      if (!id.success || !body.success) return apiError(res, 400, 'invalid_input');
      const u = principalOf(req).user;
      const bus = deps.ingest?.bus;
      if (!bus) return apiError(res, 503, 'ingest_unavailable');
      const added = await addItem(
        deps.db,
        bus,
        { tenantId: u.tenantId, userId: u.id },
        id.data,
        body.data,
      );
      if (!added.ok) return sendError(res, added.error);
      res.status(202).json({ item: itemView(added.value) });
    } catch (err) {
      next(err);
    }
  });

  router.post('/ingest/items/:id/retry', async (req, res, next) => {
    try {
      const id = Id.safeParse(req.params.id);
      if (!id.success) return apiError(res, 400, 'invalid_input');
      const u = principalOf(req).user;
      const bus = deps.ingest?.bus;
      if (!bus) return apiError(res, 503, 'ingest_unavailable');
      const retried = await retryItem(
        deps.db,
        bus,
        { tenantId: u.tenantId, userId: u.id },
        id.data,
      );
      if (!retried.ok) return sendError(res, retried.error);
      res.status(202).json({ item: itemView(retried.value) });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
