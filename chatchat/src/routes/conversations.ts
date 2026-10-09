import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import type { WiredDeps } from '../app.js';
import {
  apiError,
  principalOf,
  requireCapability,
  requireCsrf,
  requireUser,
} from '../auth/guards.js';
import { canSelfJoin, isStaff, loadConversationFor } from '../services/collab/access.js';
import { openCaseConversation } from '../services/collab/case-conversation.js';
import { addMembers, createConversation, removeMember } from '../services/collab/conversations.js';
import {
  decodeCursor,
  listMemberConversations,
  listPublicChannels,
} from '../services/collab/list.js';
import { conversationView, membersOf } from '../services/collab/views.js';
import { findCaseFor } from '../services/cases.js';
import { Id, perUserLimit, sendFailure, viewerOf } from './collab-common.js';

/**
 * Разговори (§12.3, FR-15…FR-17, FR-24): лявата лента, нови DIRECT/GROUP/CHANNEL, членове,
 * звезда и предпочитания, вътрешната дискусия по случай. Достъпът — `services/collab/access.ts`.
 */

const Name = z.string().trim().min(1).max(80);
const CreateInput = z.discriminatedUnion('type', [
  z.object({ type: z.literal('DIRECT'), userId: Id }),
  z.object({
    type: z.literal('GROUP'),
    userIds: z.array(Id).min(1).max(49),
    name: Name.optional(),
  }),
  z.object({
    type: z.literal('CHANNEL'),
    name: Name,
    visibility: z.enum(['PUBLIC', 'PRIVATE']).optional(),
    userIds: z.array(Id).max(200).default([]),
  }),
]);
const ListQuery = z.object({
  scope: z.enum(['member', 'public']).default('member'),
  cursor: z.string().max(200).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(30),
});
const Members = z.object({ userIds: z.array(Id).min(1).max(50) });
const Star = z.object({ starred: z.boolean() });
const Preferences = z
  .object({
    starred: z.boolean().optional(),
    notificationPref: z.enum(['ALL', 'MENTIONS', 'NONE']).optional(),
  })
  .refine((p) => p.starred !== undefined || p.notificationPref !== undefined);

export function conversationsRouter(deps: WiredDeps): Router {
  const router = Router();
  router.use(requireUser, requireCsrf(deps.publicOrigin));
  const use = requireCapability('conversation:use');
  const writeLimit = perUserLimit(60 * 1000, 30);

  router.get('/conversations', use, async (req, res, next) => {
    try {
      const q = ListQuery.safeParse(req.query);
      if (!q.success) return apiError(res, 400, 'invalid_input');
      const viewer = viewerOf(req);
      if (q.data.scope === 'public') {
        return res.json({
          conversations: await listPublicChannels(deps.db, viewer),
          nextCursor: null,
        });
      }
      const cursor = q.data.cursor ? decodeCursor(q.data.cursor) : null;
      if (q.data.cursor && !cursor) return apiError(res, 400, 'invalid_input');
      res.json(await listMemberConversations(deps.db, viewer, { cursor, limit: q.data.limit }));
    } catch (err) {
      next(err);
    }
  });

  router.post('/conversations', use, writeLimit, async (req, res, next) => {
    try {
      const parsed = CreateInput.safeParse(req.body);
      if (!parsed.success) return apiError(res, 400, 'invalid_input');
      const viewer = viewerOf(req);
      const result = await createConversation(deps, viewer, parsed.data);
      if (sendFailure(res, result)) return;
      const { conversation, created } = result.value;
      const membership = await deps.db.conversationMember.findUnique({
        where: { conversationId_userId: { conversationId: conversation.id, userId: viewer.id } },
      });
      res.status(created ? 201 : 200).json({
        conversation: conversationView(
          conversation,
          membership,
          await membersOf(deps.db, conversation.id),
        ),
      });
    } catch (err) {
      next(err);
    }
  });

  router.get('/conversations/:id', use, async (req, res, next) => {
    try {
      const id = Id.safeParse(req.params.id);
      if (!id.success) return apiError(res, 400, 'invalid_input');
      const viewer = viewerOf(req);
      const loaded = await loadConversationFor(deps.db, viewer, id.data);
      if (!loaded) return apiError(res, 404, 'not_found');
      res.json({
        conversation: conversationView(loaded.conversation, loaded.membership, {
          ...(await membersOf(deps.db, loaded.conversation.id, 500)),
        }),
        canJoin: !loaded.membership && canSelfJoin(viewer, loaded.conversation),
      });
    } catch (err) {
      next(err);
    }
  });

  router.post('/conversations/:id/members', use, writeLimit, async (req, res, next) => {
    try {
      const id = Id.safeParse(req.params.id);
      const body = Members.safeParse(req.body);
      if (!id.success || !body.success) return apiError(res, 400, 'invalid_input');
      const viewer = viewerOf(req);
      const loaded = await loadConversationFor(deps.db, viewer, id.data);
      if (!loaded) return apiError(res, 404, 'not_found');
      const result = await addMembers(
        deps,
        viewer,
        loaded,
        body.data.userIds,
        canSelfJoin(viewer, loaded.conversation),
      );
      if (sendFailure(res, result)) return;
      const membership = await deps.db.conversationMember.findUnique({
        where: { conversationId_userId: { conversationId: id.data, userId: viewer.id } },
      });
      res.json({
        conversation: conversationView(result.value, membership, await membersOf(deps.db, id.data)),
      });
    } catch (err) {
      next(err);
    }
  });

  router.delete('/conversations/:id/members/:userId', use, writeLimit, async (req, res, next) => {
    try {
      const id = Id.safeParse(req.params.id);
      const userId = Id.safeParse(req.params.userId);
      if (!id.success || !userId.success) return apiError(res, 400, 'invalid_input');
      const viewer = viewerOf(req);
      const loaded = await loadConversationFor(deps.db, viewer, id.data);
      if (!loaded) return apiError(res, 404, 'not_found');
      const result = await removeMember(deps, viewer, loaded, userId.data);
      if (sendFailure(res, result)) return;
      res.status(204).end();
    } catch (err) {
      next(err);
    }
  });

  /** Звезда и известия — личните настройки на члена (FR-15, FR-18). */
  const updateMembership = async (
    req: Request,
    res: Response,
    data: {
      starred?: boolean | undefined;
      notificationPref?: 'ALL' | 'MENTIONS' | 'NONE' | undefined;
    },
  ) => {
    const id = Id.safeParse(req.params.id);
    if (!id.success) return apiError(res, 400, 'invalid_input');
    const viewer = viewerOf(req);
    const loaded = await loadConversationFor(deps.db, viewer, id.data);
    if (!loaded) return apiError(res, 404, 'not_found');
    if (!loaded.membership) return apiError(res, 403, 'forbidden');
    const membership = await deps.db.conversationMember.update({
      where: { conversationId_userId: { conversationId: id.data, userId: viewer.id } },
      data: {
        ...(data.starred !== undefined ? { starred: data.starred } : {}),
        ...(data.notificationPref !== undefined ? { notificationPref: data.notificationPref } : {}),
      },
    });
    res.json({ conversation: conversationView(loaded.conversation, membership) });
  };

  router.post('/conversations/:id/star', use, async (req, res, next) => {
    try {
      const body = Star.safeParse(req.body);
      if (!body.success) return apiError(res, 400, 'invalid_input');
      await updateMembership(req, res, { starred: body.data.starred });
    } catch (err) {
      next(err);
    }
  });

  router.patch('/conversations/:id/preferences', use, async (req, res, next) => {
    try {
      const body = Preferences.safeParse(req.body);
      if (!body.success) return apiError(res, 400, 'invalid_input');
      await updateMembership(req, res, body.data);
    } catch (err) {
      next(err);
    }
  });

  // FR-24: вътрешната дискусия на персонала по случай — CASE, portal=false; порталът не я вижда.
  router.post(
    '/cases/:id/conversation',
    use,
    requireCapability('case:readAll'),
    async (req, res, next) => {
      try {
        const id = Id.safeParse(req.params.id);
        if (!id.success) return apiError(res, 400, 'invalid_input');
        const viewer = viewerOf(req);
        if (!isStaff(viewer)) return apiError(res, 403, 'forbidden');
        const c = await findCaseFor(deps.db, principalOf(req), id.data);
        if (!c) return apiError(res, 404, 'not_found');
        const { conversation, created } = await openCaseConversation(deps, viewer, c);
        const membership = await deps.db.conversationMember.findUnique({
          where: { conversationId_userId: { conversationId: conversation.id, userId: viewer.id } },
        });
        res.status(created ? 201 : 200).json({
          conversation: conversationView(
            conversation,
            membership,
            await membersOf(deps.db, conversation.id),
          ),
        });
      } catch (err) {
        next(err);
      }
    },
  );

  return router;
}
