import type {
  AccountKind,
  Conversation,
  ConversationMember,
  ConversationType,
  ConversationVisibility,
  Prisma,
  PrismaClient,
  Role,
} from '@prisma/client';
import { can } from '../../auth/rbac.js';

/**
 * Правилата за достъп до работното пространство (§12.3, §12.4, AC-18) — едно място за REST и
 * за филтъра на потоците в реално време. Всичко е по клиент (tenant); чужд разговор = 404.
 *
 * - член вижда разговора си; PUBLIC канал виждат и ВЪТРЕШНИТЕ хора на клиента;
 * - CASE разговор (вътрешната дискусия по случай) — само персонал с `case:readAll`;
 * - ПОРТАЛЕН потребител (kind PORTAL) — само DIRECT/GROUP, в които е изрично поканен и които
 *   са `portal=true`; никога канали и никога вътрешни дискусии;
 * - в портален разговор порталните членове са от ЕДНА фирма — вътрешен член не може да
 *   добави портален потребител от друга фирма (историята е на първата).
 */

export interface Viewer {
  id: string;
  tenantId: string;
  companyId: string | null;
  role: Role;
  kind: AccountKind;
}

export interface ConversationScope {
  tenantId: string;
  type: ConversationType;
  visibility: ConversationVisibility;
  portal: boolean;
}

export const isStaff = (v: Pick<Viewer, 'kind'>): boolean => v.kind === 'INTERNAL';

/** Каналите за инженеринг и спешни случаи са PRIVATE по подразбиране (§12.3); останалите — PUBLIC. */
const SENSITIVE_CHANNEL = /engineer|ingegner|urgen|emergen|спешн|инженер|escalat|ескалац/i;

export function defaultChannelVisibility(name: string): ConversationVisibility {
  return SENSITIVE_CHANNEL.test(name) ? 'PRIVATE' : 'PUBLIC';
}

/** Фирмата на порталния човек; без фирма — отделна „фирма“ само за него. */
export const companyKey = (u: Pick<Viewer, 'id' | 'companyId'>): string =>
  u.companyId ?? `user:${u.id}`;

export function canAccessConversation(v: Viewer, c: ConversationScope, member: boolean): boolean {
  if (c.tenantId !== v.tenantId || !can(v.role, 'conversation:use')) return false;
  if (!isStaff(v)) {
    return member && c.portal && (c.type === 'DIRECT' || c.type === 'GROUP');
  }
  if (c.type === 'CASE') return can(v.role, 'case:readAll');
  if (member) return true;
  return c.type === 'CHANNEL' && c.visibility === 'PUBLIC' && !c.portal;
}

/** Сам може да влезе (без OWNER) само в PUBLIC канал или във вътрешната дискусия по случай. */
export function canSelfJoin(v: Viewer, c: ConversationScope): boolean {
  return (c.type === 'CHANNEL' || c.type === 'CASE') && canAccessConversation(v, c, false);
}

export interface Candidate extends Viewer {
  active: boolean;
}

/**
 * Може ли човекът да стане член. `portalCompanies` — фирмите на порталните хора, били в
 * разговора (членове или автори); празно → още няма портална страна.
 */
export function memberEligible(
  u: Candidate,
  c: ConversationScope,
  portalCompanies: ReadonlySet<string>,
): boolean {
  if (u.tenantId !== c.tenantId || !u.active || !can(u.role, 'conversation:use')) return false;
  if (isStaff(u)) return c.type !== 'CASE' || can(u.role, 'case:readAll');
  if (!c.portal || (c.type !== 'DIRECT' && c.type !== 'GROUP')) return false;
  return portalCompanies.size === 0 || portalCompanies.has(companyKey(u));
}

/**
 * Разговорите, в които зрителят е член И до които още има достъп — огледалото на
 * `canAccessConversation(…, member = true)` като Prisma филтър (списъци, присъствие).
 */
export function memberConversationWhere(v: Viewer): Prisma.ConversationWhereInput {
  const base: Prisma.ConversationWhereInput = {
    tenantId: v.tenantId,
    members: { some: { userId: v.id } },
  };
  if (!isStaff(v)) return { ...base, portal: true, type: { in: ['DIRECT', 'GROUP'] } };
  if (!can(v.role, 'case:readAll')) return { ...base, type: { not: 'CASE' } };
  return base;
}

export interface Loaded {
  conversation: Conversation;
  membership: ConversationMember | null;
}

/** Разговорът, ако зрителят има достъп; иначе null (→ 404, без да издаваме, че съществува). */
export async function loadConversationFor(
  db: PrismaClient | Prisma.TransactionClient,
  v: Viewer,
  conversationId: string,
): Promise<Loaded | null> {
  const conversation = await db.conversation.findFirst({
    where: { id: conversationId, tenantId: v.tenantId },
  });
  if (!conversation) return null;
  const membership = await db.conversationMember.findUnique({
    where: { conversationId_userId: { conversationId, userId: v.id } },
  });
  if (!canAccessConversation(v, conversation, membership !== null)) return null;
  return { conversation, membership };
}

/** Фирмите на порталните хора, били в разговора — членове сега или автори на съобщения. */
export async function portalCompanies(
  db: PrismaClient | Prisma.TransactionClient,
  conversationId: string,
): Promise<Set<string>> {
  const members = await db.conversationMember.findMany({
    where: { conversationId, user: { kind: 'PORTAL' } },
    select: { user: { select: { id: true, companyId: true } } },
  });
  const senders = await db.conversationMessage.findMany({
    where: { conversationId, senderId: { not: null } },
    distinct: ['senderId'],
    select: { senderId: true },
  });
  const senderIds = senders.map((s) => s.senderId).filter((id): id is string => id !== null);
  const portalSenders =
    senderIds.length === 0
      ? []
      : await db.user.findMany({
          where: { id: { in: senderIds }, kind: 'PORTAL' },
          select: { id: true, companyId: true },
        });
  return new Set([...members.map((m) => companyKey(m.user)), ...portalSenders.map(companyKey)]);
}

/** Текущите права на човека (за потоците — правата се четат наново при всяко изпращане). */
export async function loadViewers(
  db: PrismaClient,
  userIds: readonly string[],
  tenantId: string,
): Promise<Map<string, Viewer>> {
  const now = new Date();
  const users = await db.user.findMany({
    where: {
      id: { in: [...userIds] },
      tenantId,
      active: true,
      OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
    },
    select: { id: true, tenantId: true, companyId: true, role: true, kind: true },
  });
  return new Map(users.map((u) => [u.id, u]));
}
