import { Router } from 'express';
import { z } from 'zod';
import type { WiredDeps } from '../app.js';
import { apiError, requireCapability, requireCsrf, requireUser } from '../auth/guards.js';
import { loadConversationFor } from '../services/collab/access.js';
import { MAX_FILES_PER_MESSAGE } from '../services/collab/files.js';
import { listMessages, markRead } from '../services/collab/history.js';
import { deleteMessage, editMessage, setReaction } from '../services/collab/message-changes.js';
import { loadMessageFor, postMessage } from '../services/collab/messages.js';
import { REACTIONS } from '../services/collab/views.js';
import { Id, perUserLimit, sendFailure, viewerOf } from './collab-common.js';

/**
 * Съобщения в разговор (FR-16, NFR-12): страници и нишки, идемпотентно изпращане (с прикачени
 * файлове — §14.1 „allegato“), редакция от автора до 15 мин., меко триене (автор или OWNER),
 * реакции и курсор „прочетено“. `around` — страница около съобщение (отваряне от търсенето).
 */

const Text = z.string().trim().min(1).max(4000);
const PostInput = z
  .object({
    // Само файл, без текст, е съобщение (снимка на табелката) — но поне едно от двете.
    text: z.string().trim().max(4000).default(''),
    clientMessageId: z.uuid().optional(),
    replyToId: Id.optional(),
    attachmentIds: z.array(Id).max(MAX_FILES_PER_MESSAGE).default([]),
  })
  .refine((b) => b.text.length > 0 || b.attachmentIds.length > 0);
const PageQuery = z
  .object({
    before: Id.optional(),
    after: Id.optional(),
    around: Id.optional(),
    threadId: Id.optional(),
    limit: z.coerce.number().int().min(1).max(100).default(50),
  })
  .refine((q) => [q.before, q.after, q.around].filter(Boolean).length <= 1)
  .refine((q) => !(q.around && q.threadId));
const Reaction = z.object({ reaction: z.enum(REACTIONS) });
const Read = z.object({ messageId: Id });

export function messagesRouter(deps: WiredDeps): Router {
  const router = Router();
  router.use(requireUser, requireCsrf(deps.publicOrigin));
  const use = requireCapability('conversation:use');
  // Лимит на изпращанията на човек (§15.1) — разговорът не е канал за наводняване.
  const sendLimit = perUserLimit(60 * 1000, 30);
  const reactLimit = perUserLimit(60 * 1000, 60);

  const load = (req: Parameters<typeof viewerOf>[0]) => (conversationId: string) =>
    loadConversationFor(deps.db, viewerOf(req), conversationId);

  router.get('/conversations/:id/messages', use, async (req, res, next) => {
    try {
      const id = Id.safeParse(req.params.id);
      const q = PageQuery.safeParse(req.query);
      if (!id.success || !q.success) return apiError(res, 400, 'invalid_input');
      const loaded = await load(req)(id.data);
      if (!loaded) return apiError(res, 404, 'not_found');
      const result = await listMessages(deps.db, loaded, q.data, viewerOf(req).id);
      if (sendFailure(res, result)) return;
      res.json(result.value);
    } catch (err) {
      next(err);
    }
  });

  router.post('/conversations/:id/messages', use, sendLimit, async (req, res, next) => {
    try {
      const id = Id.safeParse(req.params.id);
      const body = PostInput.safeParse(req.body);
      if (!id.success || !body.success) return apiError(res, 400, 'invalid_input');
      const loaded = await load(req)(id.data);
      if (!loaded) return apiError(res, 404, 'not_found');
      const result = await postMessage(deps, viewerOf(req), loaded, body.data);
      if (sendFailure(res, result)) return;
      res.status(result.value.status).json({ message: result.value.message });
    } catch (err) {
      next(err);
    }
  });

  router.post('/conversations/:id/read', use, async (req, res, next) => {
    try {
      const id = Id.safeParse(req.params.id);
      const body = Read.safeParse(req.body);
      if (!id.success || !body.success) return apiError(res, 400, 'invalid_input');
      const loaded = await load(req)(id.data);
      if (!loaded) return apiError(res, 404, 'not_found');
      const result = await markRead(deps, viewerOf(req), loaded, body.data.messageId);
      if (sendFailure(res, result)) return;
      res.json(result.value);
    } catch (err) {
      next(err);
    }
  });

  router.patch('/messages/:id', use, sendLimit, async (req, res, next) => {
    try {
      const id = Id.safeParse(req.params.id);
      const body = z.object({ text: Text }).safeParse(req.body);
      if (!id.success || !body.success) return apiError(res, 400, 'invalid_input');
      const viewer = viewerOf(req);
      const target = await loadMessageFor(deps, viewer, id.data, load(req));
      if (!target) return apiError(res, 404, 'not_found');
      const result = await editMessage(deps, viewer, target, body.data.text);
      if (sendFailure(res, result)) return;
      res.json({ message: result.value });
    } catch (err) {
      next(err);
    }
  });

  router.delete('/messages/:id', use, async (req, res, next) => {
    try {
      const id = Id.safeParse(req.params.id);
      if (!id.success) return apiError(res, 400, 'invalid_input');
      const viewer = viewerOf(req);
      const target = await loadMessageFor(deps, viewer, id.data, load(req));
      if (!target) return apiError(res, 404, 'not_found');
      const result = await deleteMessage(deps, viewer, target);
      if (sendFailure(res, result)) return;
      res.status(204).end();
    } catch (err) {
      next(err);
    }
  });

  // Реакцията е в тялото (POST) или в тялото/заявката (DELETE) — едно име от позволените.
  for (const method of ['post', 'delete'] as const) {
    router[method]('/messages/:id/reactions', use, reactLimit, async (req, res, next) => {
      try {
        const id = Id.safeParse(req.params.id);
        const body = Reaction.safeParse(
          method === 'delete' && req.query.reaction !== undefined ? req.query : req.body,
        );
        if (!id.success || !body.success) return apiError(res, 400, 'invalid_input');
        const viewer = viewerOf(req);
        const target = await loadMessageFor(deps, viewer, id.data, load(req));
        if (!target) return apiError(res, 404, 'not_found');
        const result = await setReaction(
          deps,
          viewer,
          target,
          body.data.reaction,
          method === 'post',
        );
        if (sendFailure(res, result)) return;
        res.json({ message: result.value });
      } catch (err) {
        next(err);
      }
    });
  }

  return router;
}
