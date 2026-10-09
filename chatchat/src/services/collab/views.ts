import type {
  Conversation,
  ConversationMember,
  ConversationMessage,
  MessageReaction,
  PrismaClient,
} from '@prisma/client';

/** Формите, които API-то и потоците връщат — едно място, за да не се разминават. */

/** Позволените реакции (§13.1: незадължителни, никога доказателство) — имена, не свободен текст. */
export const REACTIONS = [
  'like',
  'dislike',
  'done',
  'seen',
  'warning',
  'question',
  'thanks',
] as const;

const PREVIEW = 140;

export type MessageRow = ConversationMessage & { reactions?: MessageReaction[] };

export function reactionSummary(reactions: readonly MessageReaction[] = []) {
  const by = new Map<string, string[]>();
  for (const r of reactions) by.set(r.reaction, [...(by.get(r.reaction) ?? []), r.userId]);
  return [...by.entries()].map(([reaction, userIds]) => ({
    reaction,
    count: userIds.length,
    userIds: userIds.slice(0, 50),
  }));
}

export function messageView(
  m: MessageRow,
  names: ReadonlyMap<string, string>,
  extra: { replyCount?: number } = {},
) {
  const deleted = m.deletedAt !== null;
  return {
    id: m.id,
    conversationId: m.conversationId,
    kind: m.kind,
    sender: m.senderId ? { id: m.senderId, name: names.get(m.senderId) ?? null } : null,
    body: deleted ? null : m.body,
    deleted,
    replyToId: m.replyToId,
    ...(extra.replyCount !== undefined ? { replyCount: extra.replyCount } : {}),
    reactions: deleted ? [] : reactionSummary(m.reactions),
    clientMessageId: m.clientMessageId,
    editedAt: m.editedAt,
    createdAt: m.createdAt,
  };
}

export function previewOf(m: ConversationMessage | null, names: ReadonlyMap<string, string>) {
  if (!m) return null;
  const deleted = m.deletedAt !== null;
  return {
    id: m.id,
    sender: m.senderId ? { id: m.senderId, name: names.get(m.senderId) ?? null } : null,
    preview: deleted ? null : m.body.slice(0, PREVIEW),
    deleted,
    createdAt: m.createdAt,
  };
}

export interface MemberInfo {
  id: string;
  name: string;
  kind: string;
  role: 'OWNER' | 'MEMBER';
}

export function conversationView(
  c: Conversation,
  membership: ConversationMember | null,
  extra: {
    members?: MemberInfo[];
    memberCount?: number;
    unread?: number;
    lastMessage?: ReturnType<typeof previewOf>;
    lastActivityAt?: Date;
  } = {},
) {
  return {
    id: c.id,
    type: c.type,
    name: c.name,
    visibility: c.visibility,
    portal: c.portal,
    caseId: c.caseId,
    createdAt: c.createdAt,
    archivedAt: c.archivedAt,
    member: membership !== null,
    role: membership?.role ?? null,
    starred: membership?.starred ?? false,
    notificationPref: membership?.notificationPref ?? null,
    lastReadMessageId: membership?.lastReadMessageId ?? null,
    ...extra,
  };
}

/** Имената на хората (само на клиента) — за подателите и членовете. */
export async function namesOf(
  db: PrismaClient,
  tenantId: string,
  ids: Iterable<string | null>,
): Promise<Map<string, string>> {
  const unique = [...new Set([...ids].filter((id): id is string => id !== null))];
  if (unique.length === 0) return new Map();
  const users = await db.user.findMany({
    where: { id: { in: unique }, tenantId },
    select: { id: true, name: true },
  });
  return new Map(users.map((u) => [u.id, u.name]));
}

/** Членовете (до `take`) с име и вид — DIRECT показва другия човек, групата — участниците. */
export async function membersOf(
  db: PrismaClient,
  conversationId: string,
  take = 50,
): Promise<{ members: MemberInfo[]; memberCount: number }> {
  const [rows, memberCount] = await Promise.all([
    db.conversationMember.findMany({
      where: { conversationId },
      orderBy: { joinedAt: 'asc' },
      take,
      select: { role: true, user: { select: { id: true, name: true, kind: true } } },
    }),
    db.conversationMember.count({ where: { conversationId } }),
  ]);
  return {
    members: rows.map((r) => ({
      id: r.user.id,
      name: r.user.name,
      kind: r.user.kind,
      role: r.role,
    })),
    memberCount,
  };
}
