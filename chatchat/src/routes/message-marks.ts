import { Router } from 'express';
import { z } from 'zod';
import type { WiredDeps } from '../app.js';
import { apiError, requireCapability, requireCsrf, requireUser } from '../auth/guards.js';
import { loadConversationFor } from '../services/collab/access.js';
import { markUnread } from '../services/collab/history.js';
import { listMarked, MARK_KINDS, setMark } from '../services/collab/marks.js';
import { loadMessageFor } from '../services/collab/messages.js';
import { searchMessages } from '../services/collab/search.js';
import { Id, perUserLimit, sendFailure, viewerOf } from './collab-common.js';

/**
 * Действията по съобщение от §12.1 и търсенето (FR-16):
 * - POST /messages/:id/unread — курсорът „прочетено“ точно преди съобщението;
 * - PUT/DELETE /messages/:id/marks/:kind — лично „da fare“ (TODO) / „preferito“ (STARRED);
 * - GET /messages/marked?kind=… — списъкът (само до каквото зрителят още има достъп);
 * - GET /search/messages?q=… — разговори + случаи, по правилата за достъп, курсор, откъс.
 * Всичко минава през access.ts (`loadConversationFor` / `conversationAccessSql`); чуждо = 404.
 */

const Kind = z.enum(['todo', 'starred']).transform((k) => (k === 'todo' ? 'TODO' : 'STARRED'));
const MarkedQuery = z.object({
  kind: z.enum(MARK_KINDS),
  cursor: z.string().max(200).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(30),
});
const SearchQuery = z.object({
  q: z.string().trim().min(2).max(200),
  cursor: z.string().max(200).optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

export function messageMarksRouter(deps: WiredDeps): Router {
  const router = Router();
  router.use(requireUser, requireCsrf(deps.publicOrigin));
  const use = requireCapability('conversation:use');
  const markLimit = perUserLimit(60 * 1000, 120);
  // Търсенето е скъпо (GIN + сортиране) — таван по човек (§15.1), не по IP.
  const searchLimit = perUserLimit(60 * 1000, 60);

  const target = (req: Parameters<typeof viewerOf>[0], id: string) => {
    const viewer = viewerOf(req);
    return loadMessageFor(deps, viewer, id, (cid) => loadConversationFor(deps.db, viewer, cid));
  };

  router.post('/messages/:id/unread', use, markLimit, async (req, res, next) => {
    try {
      const id = Id.safeParse(req.params.id);
      if (!id.success) return apiError(res, 400, 'invalid_input');
      const found = await target(req, id.data);
      if (!found) return apiError(res, 404, 'not_found');
      const result = await markUnread(deps, viewerOf(req), found.loaded, found.message.id);
      if (sendFailure(res, result)) return;
      res.json(result.value);
    } catch (err) {
      next(err);
    }
  });

  for (const method of ['put', 'delete'] as const) {
    router[method]('/messages/:id/marks/:kind', use, markLimit, async (req, res, next) => {
      try {
        const id = Id.safeParse(req.params.id);
        const kind = Kind.safeParse(req.params.kind);
        if (!id.success || !kind.success) return apiError(res, 400, 'invalid_input');
        const found = await target(req, id.data);
        if (!found) return apiError(res, 404, 'not_found');
        const result = await setMark(deps.db, viewerOf(req), found, kind.data, method === 'put');
        if (sendFailure(res, result)) return;
        res.json({ messageId: found.message.id, ...result.value });
      } catch (err) {
        next(err);
      }
    });
  }

  router.get('/messages/marked', use, async (req, res, next) => {
    try {
      const q = MarkedQuery.safeParse(req.query);
      if (!q.success) return apiError(res, 400, 'invalid_input');
      const result = await listMarked(deps.db, viewerOf(req), {
        kind: q.data.kind,
        cursor: q.data.cursor ?? null,
        limit: q.data.limit,
      });
      if (sendFailure(res, result)) return;
      res.json(result.value);
    } catch (err) {
      next(err);
    }
  });

  router.get('/search/messages', use, searchLimit, async (req, res, next) => {
    try {
      const q = SearchQuery.safeParse(req.query);
      if (!q.success) return apiError(res, 400, 'invalid_input');
      const result = await searchMessages(deps.db, viewerOf(req), {
        q: q.data.q,
        cursor: q.data.cursor ?? null,
        limit: q.data.limit,
      });
      if (!result.ok) {
        return apiError(
          res,
          400,
          result.code === 'invalid_cursor' ? 'invalid_cursor' : 'invalid_input',
        );
      }
      res.json(result.value);
    } catch (err) {
      next(err);
    }
  });

  return router;
}
