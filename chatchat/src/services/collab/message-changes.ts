import { appendAudit } from '../../audit.js';
import { redactPii } from '../../domain/pii.js';
import { addTimeline } from '../cases.js';
import { ownsConversation, type Viewer } from './access.js';
import { purgeMessageFiles } from './files.js';
import {
  announceMessage,
  EDIT_WINDOW_MS,
  ensureMember,
  viewOf,
  type loadMessageFor,
} from './messages.js';
import type { CollabDeps } from './publish.js';
import { fail, ok, type Result } from './result.js';
import type { messageView } from './views.js';

/**
 * Промени по съществуващо съобщение (§12.1 „modifica/elimina solo secondo policy e audit“):
 * редакция от автора до 15 мин., меко триене (автор или OWNER — модерация) и реакции.
 * Изтритото съобщение губи текста и прикачените си файлове (файлът — преди реда); остава следа.
 */

type Target = NonNullable<Awaited<ReturnType<typeof loadMessageFor>>>;
type View = ReturnType<typeof messageView>;

export async function editMessage(
  deps: CollabDeps,
  viewer: Viewer,
  target: Target,
  text: string,
  now = new Date(),
): Promise<Result<View>> {
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

/** Меко триене: авторът или OWNER (модерация). Текстът и файловете се изчистват — остава следата. */
export async function deleteMessage(
  deps: CollabDeps,
  viewer: Viewer,
  target: Target,
): Promise<Result<null>> {
  const { message, loaded } = target;
  const c = loaded.conversation;
  const author = message.senderId === viewer.id;
  const moderator = ownsConversation(viewer, loaded.membership) && c.type !== 'DIRECT';
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
  // Файловете — след commit-а (свалянето вече е отказано: съобщението е изтрито); без хранилище
  // ги довършва ретенцията (класът „метаданни“).
  await purgeMessageFiles(deps, [message.id]);
  const { view } = await viewOf(deps.db, c.tenantId, message.id);
  announceMessage(deps, 'message.updated', c, viewer.id, view);
  return ok(null);
}

export async function setReaction(
  deps: CollabDeps,
  viewer: Viewer,
  target: Target,
  reaction: string,
  on: boolean,
): Promise<Result<View>> {
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
