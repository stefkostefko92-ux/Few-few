import type { Conversation, ConversationVisibility } from '@prisma/client';
import { appendAudit } from '../../audit.js';
import { can } from '../../auth/rbac.js';
import {
  companyKey,
  defaultChannelVisibility,
  isStaff,
  memberEligible,
  portalCompanies,
  type Candidate,
  type ConversationScope,
  type Loaded,
  type Viewer,
} from './access.js';
import { publishToConversation, publishToUser, type CollabDeps } from './publish.js';
import { fail, ok, type Result } from './result.js';
import { membersOf } from './views.js';

/**
 * Създаване на разговори и членство (§12.3, FR-15…FR-17). DIRECT/GROUP — персоналът; CHANNEL —
 * само с `channel:create`; порталът никога не създава разговор, само бива поканван.
 */

export type CreateInput =
  | { type: 'DIRECT'; userId: string }
  | { type: 'GROUP'; userIds: string[]; name?: string | undefined }
  | {
      type: 'CHANNEL';
      name: string;
      visibility?: ConversationVisibility | undefined;
      userIds: string[];
    };

async function loadCandidates(
  deps: CollabDeps,
  tenantId: string,
  ids: readonly string[],
): Promise<Map<string, Candidate> | null> {
  const users = await deps.db.user.findMany({
    where: { id: { in: [...ids] }, tenantId },
    select: { id: true, tenantId: true, companyId: true, role: true, kind: true, active: true },
  });
  // Чужд клиент, несъществуващ или неактивен — един и същ отговор (не издаваме кой съществува).
  if (users.length !== ids.length || users.some((u) => !u.active)) return null;
  return new Map(users.map((u) => [u.id, u]));
}

/** Порталните участници трябва да са от една фирма; всички — допустими за вида разговор. */
function eligibleAll(
  candidates: Iterable<Candidate>,
  scope: ConversationScope,
  existing: ReadonlySet<string>,
): boolean {
  const list = [...candidates];
  const companies = new Set(existing);
  for (const u of list) if (!isStaff(u)) companies.add(companyKey(u));
  if (companies.size > 1) return false;
  return list.every((u) => memberEligible(u, scope, companies));
}

/** Събитието за промяна на разговора — без лични полета на зрителя (звезда, курсор). */
async function announce(deps: CollabDeps, c: Conversation, actorId: string): Promise<void> {
  const { members, memberCount } = await membersOf(deps.db, c.id);
  publishToConversation(deps, 'conversation.updated', c, actorId, () => ({
    conversation: {
      id: c.id,
      type: c.type,
      name: c.name,
      visibility: c.visibility,
      portal: c.portal,
      caseId: c.caseId,
    },
    members,
    memberCount,
  }));
}

export async function createConversation(
  deps: CollabDeps,
  viewer: Viewer,
  input: CreateInput,
): Promise<Result<{ conversation: Conversation; created: boolean }>> {
  const capability = input.type === 'CHANNEL' ? 'channel:create' : 'conversation:create';
  if (!isStaff(viewer) || !can(viewer.role, capability)) return fail(403, 'forbidden');
  const others = [...new Set(input.type === 'DIRECT' ? [input.userId] : input.userIds)].filter(
    (id) => id !== viewer.id,
  );
  if (input.type === 'DIRECT' && others.length !== 1) return fail(400, 'invalid_input');
  if (input.type === 'GROUP' && others.length === 0) return fail(400, 'invalid_input');
  const candidates = await loadCandidates(deps, viewer.tenantId, others);
  if (!candidates) return fail(422, 'unknown_user');
  const portal = input.type !== 'CHANNEL' && [...candidates.values()].some((u) => !isStaff(u));
  const visibility: ConversationVisibility =
    input.type === 'CHANNEL'
      ? (input.visibility ?? defaultChannelVisibility(input.name))
      : 'PRIVATE';
  const scope: ConversationScope = {
    tenantId: viewer.tenantId,
    type: input.type,
    visibility,
    portal,
  };
  if (!eligibleAll(candidates.values(), scope, new Set())) return fail(422, 'member_not_allowed');

  const name = input.type === 'DIRECT' ? null : input.name?.trim() || null;
  // DIRECT между същите двама и канал със същото име — един; заключването пази от паралелни заявки.
  const lockKey =
    input.type === 'DIRECT'
      ? `direct|${viewer.tenantId}|${[viewer.id, ...others].sort().join('|')}`
      : input.type === 'CHANNEL'
        ? `channel|${viewer.tenantId}|${(name ?? '').toLocaleLowerCase()}`
        : null;
  const result = await deps.db.$transaction(async (tx) => {
    if (lockKey)
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${lockKey}, 4330))`;
    if (input.type === 'DIRECT') {
      const existing = await tx.conversation.findFirst({
        where: {
          tenantId: viewer.tenantId,
          type: 'DIRECT',
          AND: [viewer.id, ...others].map((userId) => ({ members: { some: { userId } } })),
        },
      });
      if (existing) return { conversation: existing, created: false };
    }
    if (input.type === 'CHANNEL') {
      const clash = await tx.conversation.findFirst({
        where: {
          tenantId: viewer.tenantId,
          type: 'CHANNEL',
          archivedAt: null,
          name: { equals: name ?? '', mode: 'insensitive' },
        },
      });
      if (clash) return null;
    }
    const conversation = await tx.conversation.create({
      data: {
        tenantId: viewer.tenantId,
        type: input.type,
        name,
        visibility,
        portal,
        createdById: viewer.id,
        members: {
          // В DIRECT няма модератор — никой от двамата не трие чужди съобщения.
          create: [
            { userId: viewer.id, role: input.type === 'DIRECT' ? 'MEMBER' : 'OWNER' },
            ...others.map((userId) => ({ userId, role: 'MEMBER' as const })),
          ],
        },
      },
    });
    await appendAudit(tx, {
      tenantId: viewer.tenantId,
      actorId: viewer.id,
      action: 'conversation.create',
      objectType: 'conversation',
      objectId: conversation.id,
      detail: { type: input.type, visibility, portal, members: others.length + 1 },
    });
    return { conversation, created: true };
  });
  if (!result) return fail(409, 'duplicate');
  if (result.created) await announce(deps, result.conversation, viewer.id);
  return ok(result);
}

/**
 * Добавяне на членове: OWNER добавя други; всеки с достъп влиза сам в PUBLIC канал или в
 * дискусията по случай. Портален потребител — само в портален разговор и от същата фирма.
 */
export async function addMembers(
  deps: CollabDeps,
  viewer: Viewer,
  loaded: Loaded,
  userIds: readonly string[],
  selfJoinAllowed: boolean,
): Promise<Result<Conversation>> {
  const c = loaded.conversation;
  if (c.type === 'DIRECT') return fail(409, 'not_allowed_for_type');
  const ids = [...new Set(userIds)];
  const selfOnly = ids.length === 1 && ids[0] === viewer.id;
  if (selfOnly && loaded.membership) return ok(c);
  if (selfOnly ? !selfJoinAllowed : loaded.membership?.role !== 'OWNER') {
    return fail(403, 'forbidden');
  }
  const candidates = await loadCandidates(deps, viewer.tenantId, ids);
  if (!candidates) return fail(422, 'unknown_user');
  // Проверката за фирмата и записът — под заключване на разговора: две паралелни покани от
  // различни фирми не минават и двете.
  const added = await deps.db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`members|${c.id}`}, 4330))`;
    const existing = c.portal ? await portalCompanies(tx, c.id) : new Set<string>();
    if (!eligibleAll(candidates.values(), c, existing)) return null;
    return tx.conversationMember.createMany({
      data: ids.map((userId) => ({ conversationId: c.id, userId, role: 'MEMBER' as const })),
      skipDuplicates: true,
    });
  });
  if (!added) return fail(422, 'member_not_allowed');
  if (!selfOnly && added.count > 0) {
    await appendAudit(deps.db, {
      tenantId: viewer.tenantId,
      actorId: viewer.id,
      action: 'conversation.member_add',
      objectType: 'conversation',
      objectId: c.id,
      detail: { userIds: ids, added: added.count },
    });
  }
  if (added.count > 0) await announce(deps, c, viewer.id);
  return ok(c);
}

/** Махане: OWNER маха другите, всеки може да излезе сам. Без OWNER остава най-старият член. */
export async function removeMember(
  deps: CollabDeps,
  viewer: Viewer,
  loaded: Loaded,
  userId: string,
): Promise<Result<null>> {
  const c = loaded.conversation;
  if (c.type === 'DIRECT') return fail(409, 'not_allowed_for_type');
  const self = userId === viewer.id;
  if (!self && loaded.membership?.role !== 'OWNER') return fail(403, 'forbidden');
  const removed = await deps.db.$transaction(async (tx) => {
    const gone = await tx.conversationMember.deleteMany({
      where: { conversationId: c.id, userId },
    });
    if (gone.count === 0) return false;
    const owners = await tx.conversationMember.count({
      where: { conversationId: c.id, role: 'OWNER' },
    });
    if (owners === 0) {
      const next = await tx.conversationMember.findFirst({
        where: { conversationId: c.id },
        orderBy: { joinedAt: 'asc' },
      });
      if (next) {
        await tx.conversationMember.update({
          where: { conversationId_userId: { conversationId: c.id, userId: next.userId } },
          data: { role: 'OWNER' },
        });
      }
    }
    return true;
  });
  if (!removed) return fail(404, 'not_found');
  if (!self) {
    await appendAudit(deps.db, {
      tenantId: viewer.tenantId,
      actorId: viewer.id,
      action: 'conversation.member_remove',
      objectType: 'conversation',
      objectId: c.id,
      detail: { userId },
    });
  }
  await announce(deps, c, viewer.id);
  // Махнатият научава само идентификатора — вече няма право на нищо друго.
  publishToUser(
    deps,
    'conversation.updated',
    { tenantId: c.tenantId, userId, conversationId: c.id },
    viewer.id,
    { conversation: { id: c.id }, removed: true },
  );
  return ok(null);
}
