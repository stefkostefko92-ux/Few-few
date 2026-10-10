import type { Prisma, PrismaClient, TicketQueue, TicketStatus } from '@prisma/client';
import { can } from '../../auth/rbac.js';
import type { Principal } from '../../auth/sessions.js';
import { assigneeFor } from '../case-views.js';

/**
 * Опашката на персонала (FR-09, FR-19): неназначени, мои, всички; по статус, по опашка; по
 * възраст (най-старите първо) или по последна промяна. Само тикетите на клиента на човека.
 * Редовете — без съдържание на разговора: номер, контекст на таблото, статуси, отговорник.
 */

export interface QueueQuery {
  view: 'unassigned' | 'mine' | 'all';
  status?: TicketStatus[] | undefined;
  queue?: TicketQueue | undefined;
  sort: 'age' | 'updated';
  limit: number;
  cursor?: string | undefined;
}

const OPEN: TicketStatus[] = ['OPEN', 'ASSIGNED', 'IN_PROGRESS', 'WAITING'];

function whereFor(p: Principal, q: QueueQuery): Prisma.TicketWhereInput {
  return {
    case: { tenantId: p.user.tenantId },
    status: { in: q.status && q.status.length > 0 ? q.status : OPEN },
    ...(q.queue ? { queue: q.queue } : {}),
    ...(q.view === 'unassigned' ? { ownerId: null } : {}),
    ...(q.view === 'mine' ? { ownerId: p.user.id } : {}),
  };
}

export async function ticketQueue(db: PrismaClient, p: Principal, q: QueueQuery) {
  const orderBy: Prisma.TicketOrderByWithRelationInput[] =
    q.sort === 'age'
      ? [{ createdAt: 'asc' }, { id: 'asc' }]
      : [{ updatedAt: 'desc' }, { id: 'asc' }];
  const rows = await db.ticket.findMany({
    where: whereFor(p, q),
    orderBy,
    take: q.limit + 1,
    ...(q.cursor ? { cursor: { id: q.cursor }, skip: 1 } : {}),
    include: {
      case: {
        select: {
          id: true,
          number: true,
          status: true,
          aiPaused: true,
          portal: true,
          context: true,
          stepApprovals: { where: { status: 'PENDING' }, select: { id: true } },
        },
      },
      infoRequests: { where: { answeredAt: null }, select: { id: true }, take: 1 },
    },
  });
  const page = rows.slice(0, q.limit);
  const ownerIds = [...new Set(page.map((r) => r.ownerId).filter((x): x is string => !!x))];
  const owners = new Map(
    (
      await db.user.findMany({
        where: { id: { in: ownerIds }, tenantId: p.user.tenantId },
        select: { id: true, name: true, role: true, kind: true },
      })
    ).map((u) => [u.id, u]),
  );
  const [unassigned, mine] = await Promise.all([
    db.ticket.count({ where: whereFor(p, { ...q, view: 'unassigned', status: undefined }) }),
    db.ticket.count({ where: whereFor(p, { ...q, view: 'mine', status: undefined }) }),
  ]);
  return {
    counts: { unassigned, mine },
    nextCursor: rows.length > q.limit ? (page.at(-1)?.id ?? null) : null,
    tickets: page.map((t) => {
      const ctx = (t.case.context ?? {}) as Prisma.JsonObject;
      const owner = t.ownerId ? owners.get(t.ownerId) : undefined;
      return {
        id: t.id,
        number: t.number,
        status: t.status,
        queue: t.queue,
        owner: owner ? assigneeFor(p.user, owner) : null,
        createdAt: t.createdAt,
        updatedAt: t.updatedAt,
        waitingForData: t.status === 'WAITING' && t.infoRequests.length > 0,
        pendingApprovals: t.case.stepApprovals.length,
        case: {
          id: t.case.id,
          number: t.case.number,
          status: t.case.status,
          aiPaused: t.case.aiPaused,
          portal: t.case.portal,
          productModel: typeof ctx.productModel === 'string' ? ctx.productModel : null,
          errorCode: typeof ctx.errorCode === 'string' ? ctx.errorCode : null,
        },
      };
    }),
  };
}

/** Към кого може да се назначи: активни вътрешни хора на клиента с `case:assign`. */
export async function assignableStaff(db: PrismaClient, p: Principal, q: string) {
  const now = new Date();
  const rows = await db.user.findMany({
    where: {
      tenantId: p.user.tenantId,
      active: true,
      kind: 'INTERNAL',
      OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
      ...(q ? { name: { contains: q, mode: 'insensitive' as const } } : {}),
    },
    select: { id: true, name: true, role: true },
    orderBy: { name: 'asc' },
    take: 50,
  });
  return rows.filter((u) => can(u.role, 'case:assign'));
}
