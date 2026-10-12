import type { PrismaClient } from '@prisma/client';
import type { Logger } from 'pino';
import { can } from '../../auth/rbac.js';
import type { Authorizer, RealtimeEventType, RealtimeHub } from '../../realtime/hub.js';
import type { AttachmentStore } from '../../storage/attachments.js';
import { assigneeFor, type MessageAuthor } from '../case-views.js';
import type { MailPolicy } from '../email/enqueue.js';
import { canAccessConversation, loadViewers, type Viewer } from './access.js';

/**
 * Свързва събитията на работното пространство с хъба. Получателите се изчисляват при
 * публикуване, но правото се проверява ОТНОВО в момента на изпращане (authorize) — по текущата
 * роля, активност и членство (§13.3). Грешка тук не чупи заявката — само се логва; клиентът
 * така или иначе презарежда по REST при reconnect.
 */

export interface CollabDeps {
  db: PrismaClient;
  hub: RealtimeHub;
  logger: Logger;
  /** Хранилището на файловете (null → прикачването е изключено; файловете чистят ретенцията). */
  attachments?: { store: AttachmentStore } | null;
  /** Имейл известията (null/липсва → изключени: Brevo не е конфигуриран, без outbox). */
  mail?: MailPolicy | null;
}

type Data = Record<string, unknown>;

function fireAndLog(deps: CollabDeps, type: RealtimeEventType, run: Promise<number>): void {
  run.catch((err: unknown) =>
    deps.logger.warn(
      { type, errName: err instanceof Error ? err.name : 'unknown' },
      'събитие в реално време не беше изпратено',
    ),
  );
}

/** Само членовете, които и сега имат достъп до разговора, получават `build(зрител)`. */
export function conversationAuthorizer(
  db: PrismaClient,
  conversationId: string,
  build: (viewer: Viewer) => Data | null,
): Authorizer {
  return async (userIds) => {
    const out = new Map<string, Data>();
    const conversation = await db.conversation.findUnique({ where: { id: conversationId } });
    if (!conversation) return out;
    const viewers = await loadViewers(db, userIds, conversation.tenantId);
    const members = new Set(
      (
        await db.conversationMember.findMany({
          where: { conversationId, userId: { in: [...viewers.keys()] } },
          select: { userId: true },
        })
      ).map((m) => m.userId),
    );
    for (const [id, viewer] of viewers) {
      if (!canAccessConversation(viewer, conversation, members.has(id))) continue;
      const data = build(viewer);
      if (data) out.set(id, data);
    }
    return out;
  };
}

/** Събитие до членовете на разговора (съобщение, редакция, реакция, промяна на членове). */
export function publishToConversation(
  deps: CollabDeps,
  type: RealtimeEventType,
  conversation: { id: string; tenantId: string },
  actorId: string | null,
  build: (viewer: Viewer) => Data | null,
): void {
  if (deps.hub.size() === 0) return;
  const members = async () =>
    (
      await deps.db.conversationMember.findMany({
        where: { conversationId: conversation.id },
        select: { userId: true },
      })
    ).map((m) => m.userId);
  fireAndLog(
    deps,
    type,
    deps.hub.publish(
      { type, tenantId: conversation.tenantId, conversationId: conversation.id, actorId },
      members,
      conversationAuthorizer(deps.db, conversation.id, build),
    ),
  );
}

/** Лично събитие (известие, собствен курсор) — само ако човекът още е активен в клиента. */
export function publishToUser(
  deps: CollabDeps,
  type: RealtimeEventType,
  target: { tenantId: string; userId: string; conversationId?: string },
  actorId: string | null,
  data: Data,
): void {
  if (deps.hub.size(target.userId) === 0) return;
  const authorize: Authorizer = async (userIds) => {
    const viewers = await loadViewers(deps.db, userIds, target.tenantId);
    const viewer = viewers.get(target.userId);
    return new Map(viewer && can(viewer.role, 'conversation:use') ? [[viewer.id, data]] : []);
  };
  fireAndLog(
    deps,
    type,
    deps.hub.publish(
      { type, tenantId: target.tenantId, conversationId: target.conversationId ?? null, actorId },
      [target.userId],
      authorize,
    ),
  );
}

/** Поемане на случай (FR-19): само хората, които и сега виждат случая (създател/поел/триаж). */
export function publishCaseAssigned(
  deps: CollabDeps,
  c: { id: string; number: string; tenantId: string; createdById: string; assignedToId: string },
  actor: MessageAuthor,
): void {
  const recipients = [c.createdById, c.assignedToId];
  if (recipients.every((id) => deps.hub.size(id) === 0)) return;
  const authorize: Authorizer = async (userIds) => {
    const viewers = await loadViewers(deps.db, userIds, c.tenantId);
    const out = new Map<string, Data>();
    for (const [id, v] of viewers) {
      const sees = can(v.role, 'case:readAll') || v.id === c.createdById || v.id === c.assignedToId;
      if (!sees || !can(v.role, 'conversation:use')) continue;
      out.set(id, {
        caseId: c.id,
        number: c.number,
        assignedTo: assigneeFor(v, actor),
      });
    }
    return out;
  };
  fireAndLog(
    deps,
    'case.assigned',
    deps.hub.publish(
      { type: 'case.assigned', tenantId: c.tenantId, actorId: actor.id },
      recipients,
      authorize,
    ),
  );
}
