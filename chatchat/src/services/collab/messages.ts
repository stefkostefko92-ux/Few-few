import type { ConversationMember, Prisma, PrismaClient } from '@prisma/client';
import { appendAudit } from '../../audit.js';
import { redactPii } from '../../domain/pii.js';
import { addTimeline, isUniqueOn } from '../cases.js';
import { canSelfJoin, type Loaded, type Viewer } from './access.js';
import { mentionedUserIds, messageRecipients, notify } from './notify.js';
import { publishToConversation, type CollabDeps } from './publish.js';
import { fail, ok, type Result } from './result.js';
import { messageView, namesOf } from './views.js';

/**
 * Съобщенията в разговор (FR-16, NFR-12): идемпотентно изпращане по `clientMessageId` (паралелен
 * повтор връща записаното, не 500), лични данни маскирани преди запис, нишки с един корен.
 * Съобщенията във вътрешната дискусия по случай влизат в хронологията му (FR-24, AC-19) — само
 * като идентификатори, без текст.
 */

export const EDIT_WINDOW_MS = 15 * 60 * 1000;

export interface PostInput {
  text: string;
  clientMessageId?: string | undefined;
  replyToId?: string | undefined;
}

type Db = PrismaClient | Prisma.TransactionClient;

/** Член ли е; в PUBLIC канал и в дискусия по случай — влиза автоматично при първо действие. */
export async function ensureMember(
  db: Db,
  viewer: Viewer,
  loaded: Loaded,
): Promise<ConversationMember | null> {
  if (loaded.membership) return loaded.membership;
  if (!canSelfJoin(viewer, loaded.conversation)) return null;
  await db.conversationMember.createMany({
    data: [{ conversationId: loaded.conversation.id, userId: viewer.id }],
    skipDuplicates: true,
  });
  return db.conversationMember.findUnique({
    where: {
      conversationId_userId: { conversationId: loaded.conversation.id, userId: viewer.id },
    },
  });
}

async function viewOf(db: PrismaClient, tenantId: string, id: string) {
  const row = await db.conversationMessage.findUniqueOrThrow({
    where: { id },
    include: { reactions: true },
  });
  return { row, view: messageView(row, await namesOf(db, tenantId, [row.senderId])) };
}

/** Новото/промененото съобщение до членовете, които и сега имат достъп. */
export function announceMessage(
  deps: CollabDeps,
  type: 'message.created' | 'message.updated',
  conversation: { id: string; tenantId: string },
  actorId: string,
  view: ReturnType<typeof messageView>,
): void {
  publishToConversation(deps, type, conversation, actorId, () => ({ message: view }));
}

export async function postMessage(
  deps: CollabDeps,
  viewer: Viewer & { name: string },
  loaded: Loaded,
  input: PostInput,
): Promise<Result<{ status: 200 | 201; message: ReturnType<typeof messageView> }>> {
  const c = loaded.conversation;
  const membership = await ensureMember(deps.db, viewer, loaded);
  if (!membership) return fail(403, 'forbidden');

  /** Повтор: вече записаното — само ако е на същия подател (чужд clientMessageId не изтича). */
  const replay = async (id: string) => {
    const prior = await deps.db.conversationMessage.findUnique({
      where: { conversationId_clientMessageId: { conversationId: c.id, clientMessageId: id } },
    });
    if (!prior) return null;
    if (prior.senderId !== viewer.id) return fail<never>(409, 'duplicate');
    return ok({
      status: 200 as const,
      message: (await viewOf(deps.db, c.tenantId, prior.id)).view,
    });
  };
  if (input.clientMessageId) {
    const prior = await replay(input.clientMessageId);
    if (prior) return prior;
  }

  let replyToId: string | null = null;
  if (input.replyToId) {
    const parent = await deps.db.conversationMessage.findFirst({
      where: { id: input.replyToId, conversationId: c.id },
    });
    if (!parent) return fail(400, 'invalid_input');
    // Нишките са на едно ниво: отговор на отговор отива към корена.
    replyToId = parent.replyToId ?? parent.id;
  }

  const text = redactPii(input.text);
  let created;
  try {
    created = await deps.db.$transaction(async (tx) => {
      const row = await tx.conversationMessage.create({
        data: {
          conversationId: c.id,
          senderId: viewer.id,
          kind: 'HUMAN',
          body: text,
          replyToId,
          clientMessageId: input.clientMessageId ?? null,
        },
      });
      if (c.caseId) {
        await addTimeline(tx, c.caseId, 'internal.message', viewer.id, {
          conversationId: c.id,
          messageId: row.id,
        });
      }
      return row;
    });
  } catch (err) {
    // Паралелен повтор със същия clientMessageId — първият печели, другите получават него.
    if (input.clientMessageId && isUniqueOn(err, 'clientMessageId')) {
      const prior = await replay(input.clientMessageId);
      if (prior) return prior;
    }
    throw err;
  }

  const { view } = await viewOf(deps.db, c.tenantId, created.id);
  announceMessage(deps, 'message.created', c, viewer.id, view);

  const members = await deps.db.conversationMember.findMany({
    where: { conversationId: c.id },
    select: { userId: true, notificationPref: true, user: { select: { id: true, name: true } } },
  });
  const mentioned = mentionedUserIds(
    text,
    members.map((m) => m.user),
  );
  await notify(
    deps,
    messageRecipients(members, viewer.id, mentioned).map((r) => ({
      tenantId: c.tenantId,
      userId: r.userId,
      eventType: r.eventType,
      objectType: 'conversation' as const,
      objectId: c.id,
      payload: {
        conversationId: c.id,
        conversationType: c.type,
        conversationName: c.name,
        messageId: created.id,
        actor: { id: viewer.id, name: viewer.name },
      },
    })),
    viewer.id,
  );
  return ok({ status: 201, message: view });
}

/** Достъпното съобщение (през разговора); чуждо = null → 404. */
export async function loadMessageFor(
  deps: CollabDeps,
  viewer: Viewer,
  messageId: string,
  load: (conversationId: string) => Promise<Loaded | null>,
) {
  const message = await deps.db.conversationMessage.findUnique({ where: { id: messageId } });
  if (!message) return null;
  const loaded = await load(message.conversationId);
  return loaded ? { message, loaded } : null;
}

export async function editMessage(
  deps: CollabDeps,
  viewer: Viewer,
  target: NonNullable<Awaited<ReturnType<typeof loadMessageFor>>>,
  text: string,
  now = new Date(),
): Promise<Result<ReturnType<typeof messageView>>> {
  const { message, loaded } = target;
  if (message.senderId !== viewer.id || message.kind !== 'HUMAN') return fail(403, 'forbidden');
  if (message.deletedAt) return fail(409, 'message_deleted');
  if (now.getTime() - message.createdAt.getTime() > EDIT_WINDOW_MS) {
    return fail(409, 'edit_window_expired');
  }
  const c = loaded.conversation;
  await deps.db.$transaction(async (tx) => {
    await tx.conversationMessage.update({
      where: { id: message.id },
      data: { body: redactPii(text), editedAt: now },
    });
    if (c.caseId) {
      await addTimeline(tx, c.caseId, 'internal.message_edited', viewer.id, {
        conversationId: c.id,
        messageId: message.id,
      });
    }
    await appendAudit(tx, {
      tenantId: c.tenantId,
      actorId: viewer.id,
      action: 'message.edit',
      objectType: 'conversation_message',
      objectId: message.id,
      detail: { conversationId: c.id },
    });
  });
  const { view } = await viewOf(deps.db, c.tenantId, message.id);
  announceMessage(deps, 'message.updated', c, viewer.id, view);
  return ok(view);
}

/** Меко триене: авторът или OWNER (модерация). Текстът се изчиства — остава само следата. */
export async function deleteMessage(
  deps: CollabDeps,
  viewer: Viewer,
  target: NonNullable<Awaited<ReturnType<typeof loadMessageFor>>>,
): Promise<Result<null>> {
  const { message, loaded } = target;
  const c = loaded.conversation;
  const author = message.senderId === viewer.id;
  const moderator = loaded.membership?.role === 'OWNER' && c.type !== 'DIRECT';
  if (!author && !moderator) return fail(403, 'forbidden');
  if (message.deletedAt) return ok(null);
  await deps.db.$transaction(async (tx) => {
    await tx.conversationMessage.update({
      where: { id: message.id },
      data: { deletedAt: new Date(), body: '' },
    });
    if (c.caseId) {
      await addTimeline(tx, c.caseId, 'internal.message_deleted', viewer.id, {
        conversationId: c.id,
        messageId: message.id,
      });
    }
    await appendAudit(tx, {
      tenantId: c.tenantId,
      actorId: viewer.id,
      action: 'message.delete',
      objectType: 'conversation_message',
      objectId: message.id,
      detail: { conversationId: c.id, moderated: !author },
    });
  });
  const { view } = await viewOf(deps.db, c.tenantId, message.id);
  announceMessage(deps, 'message.updated', c, viewer.id, view);
  return ok(null);
}

export async function setReaction(
  deps: CollabDeps,
  viewer: Viewer,
  target: NonNullable<Awaited<ReturnType<typeof loadMessageFor>>>,
  reaction: string,
  on: boolean,
): Promise<Result<ReturnType<typeof messageView>>> {
  const { message, loaded } = target;
  if (!(await ensureMember(deps.db, viewer, loaded))) return fail(403, 'forbidden');
  if (message.deletedAt) return fail(409, 'message_deleted');
  if (on) {
    await deps.db.messageReaction.createMany({
      data: [{ messageId: message.id, userId: viewer.id, reaction }],
      skipDuplicates: true,
    });
  } else {
    await deps.db.messageReaction.deleteMany({
      where: { messageId: message.id, userId: viewer.id, reaction },
    });
  }
  const { view } = await viewOf(deps.db, loaded.conversation.tenantId, message.id);
  announceMessage(deps, 'message.updated', loaded.conversation, viewer.id, view);
  return ok(view);
}
