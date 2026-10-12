import type {
  KnowledgeProposal,
  Prisma,
  PrismaClient,
  ProposalSource,
  ProposalStatus,
} from '@prisma/client';
import { appendAudit } from '../../audit.js';
import type { Principal } from '../../auth/sessions.js';
import { redactPii } from '../../domain/pii.js';
import { fail, ok, type Result } from '../collab/result.js';
import { reasonForAudit } from '../kb-lifecycle.js';

/**
 * Опашката на отговорника за знанието (FR-10, §11.3): списък с филтри и броячи, детайл и
 * преходите NEW → IN_REVIEW → ACCEPTED (с връзка към новия документ/код) | REJECTED (с причина).
 * Само `kb:manage` (рутерът), винаги по tenantId; чуждо предложение = 404. Преходът е условен по
 * текущия статус (паралелен преход → 409, нищо не се пише); всеки — в одита (само id-та и кодове).
 */

export const PROPOSAL_STATUSES = ['NEW', 'IN_REVIEW', 'ACCEPTED', 'REJECTED'] as const;
export const PROPOSAL_SOURCES = ['FEEDBACK', 'SOLVED_CASE', 'CONFLICT'] as const;

const include = {
  case: { select: { id: true, number: true } },
  draftDocument: { select: { id: true, code: true, revision: true, status: true, type: true } },
  resultDocument: { select: { id: true, code: true, revision: true, status: true } },
  resultError: { select: { id: true, code: true, version: true, status: true } },
} satisfies Prisma.KnowledgeProposalInclude;

type Row = Prisma.KnowledgeProposalGetPayload<{ include: typeof include }>;

/** Имената на хората (вътрешна опашка — вижда я само персоналът) — само в клиента. */
async function people(db: PrismaClient, tenantId: string, rows: readonly KnowledgeProposal[]) {
  const ids = [
    ...new Set(
      rows
        .flatMap((r) => [r.createdById, r.reviewerId, r.decidedById])
        .filter((x): x is string => x !== null),
    ),
  ];
  if (ids.length === 0) return new Map<string, { id: string; name: string; role: string }>();
  const users = await db.user.findMany({
    where: { id: { in: ids }, tenantId },
    select: { id: true, name: true, role: true },
  });
  return new Map(users.map((u) => [u.id, u]));
}

function view(r: Row, who: Awaited<ReturnType<typeof people>>) {
  const person = (id: string | null) => (id ? (who.get(id) ?? { id, name: '', role: '' }) : null);
  return {
    id: r.id,
    source: r.source,
    status: r.status,
    rating: r.rating,
    comment: r.comment,
    conflict: r.conflict,
    occurrences: r.occurrences,
    lastSeenAt: r.lastSeenAt,
    case: r.case,
    messageId: r.messageId,
    draftDocument: r.draftDocument,
    resultDocument: r.resultDocument,
    resultError: r.resultError,
    createdBy: person(r.createdById),
    reviewer: person(r.reviewerId),
    decidedBy: person(r.decidedById),
    decidedAt: r.decidedAt,
    rejectReason: r.rejectReason,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  };
}

export type ProposalView = ReturnType<typeof view>;

export async function listProposals(
  db: PrismaClient,
  tenantId: string,
  filter: { status?: ProposalStatus; source?: ProposalSource },
) {
  const where: Prisma.KnowledgeProposalWhereInput = {
    tenantId,
    ...(filter.status ? { status: filter.status } : {}),
    ...(filter.source ? { source: filter.source } : {}),
  };
  const [rows, byStatus, bySource] = await Promise.all([
    db.knowledgeProposal.findMany({
      where,
      include,
      orderBy: [{ lastSeenAt: 'desc' }, { id: 'asc' }],
      take: 200,
    }),
    db.knowledgeProposal.groupBy({
      by: ['status'],
      where: { tenantId, ...(filter.source ? { source: filter.source } : {}) },
      _count: { _all: true },
    }),
    db.knowledgeProposal.groupBy({
      by: ['source'],
      where: { tenantId, status: { in: ['NEW', 'IN_REVIEW'] } },
      _count: { _all: true },
    }),
  ]);
  const who = await people(db, tenantId, rows);
  const counts = Object.fromEntries(PROPOSAL_STATUSES.map((s) => [s, 0])) as Record<
    ProposalStatus,
    number
  >;
  for (const g of byStatus) counts[g.status] = g._count._all;
  const open = Object.fromEntries(PROPOSAL_SOURCES.map((s) => [s, 0])) as Record<
    ProposalSource,
    number
  >;
  for (const g of bySource) open[g.source] = g._count._all;
  return { proposals: rows.map((r) => view(r, who)), counts, openBySource: open };
}

export async function getProposal(
  db: PrismaClient,
  tenantId: string,
  id: string,
): Promise<ProposalView | null> {
  const row = await db.knowledgeProposal.findFirst({ where: { id, tenantId }, include });
  if (!row) return null;
  return view(row, await people(db, tenantId, [row]));
}

type Action = 'review' | 'accept' | 'reject';
const FROM: Record<Action, ProposalStatus> = {
  review: 'NEW',
  accept: 'IN_REVIEW',
  reject: 'IN_REVIEW',
};

export type Transition =
  | { action: 'review' }
  | { action: 'accept'; documentId?: string; errorId?: string }
  | { action: 'reject'; reason: string };

/** Преходът на едно предложение в клиента на човека. */
export async function moveProposal(
  db: PrismaClient,
  p: Principal,
  id: string,
  t: Transition,
): Promise<Result<ProposalView>> {
  const tenantId = p.user.tenantId;
  const row = await db.knowledgeProposal.findFirst({ where: { id, tenantId } });
  if (!row) return fail(404, 'not_found');
  if (row.status !== FROM[t.action]) return fail(409, 'invalid_transition');
  const now = new Date();
  let data: Prisma.KnowledgeProposalUncheckedUpdateManyInput;
  let detail: Record<string, unknown> = { source: row.source };

  if (t.action === 'review') {
    data = { status: 'IN_REVIEW', reviewerId: p.user.id };
  } else if (t.action === 'accept') {
    // Решен случай без изрична връзка → черновата му; иначе връзката е задължителна.
    const documentId = t.documentId ?? (t.errorId ? undefined : (row.draftDocumentId ?? undefined));
    if (!documentId && !t.errorId) return fail(422, 'link_required');
    if (documentId) {
      const doc = await db.document.findFirst({ where: { id: documentId, tenantId } });
      if (!doc) return fail(422, 'unknown_document');
    }
    if (t.errorId) {
      const err = await db.errorCode.findFirst({ where: { id: t.errorId, tenantId } });
      if (!err) return fail(422, 'unknown_error');
    }
    data = {
      status: 'ACCEPTED',
      decidedById: p.user.id,
      decidedAt: now,
      resultDocumentId: documentId ?? null,
      resultErrorId: t.errorId ?? null,
    };
    detail = { ...detail, documentId: documentId ?? null, errorId: t.errorId ?? null };
  } else {
    data = {
      status: 'REJECTED',
      decidedById: p.user.id,
      decidedAt: now,
      rejectReason: redactPii(t.reason).slice(0, 500),
    };
    detail = { ...detail, reason: reasonForAudit(t.reason) };
  }

  const moved = await db.$transaction(async (tx) => {
    const res = await tx.knowledgeProposal.updateMany({
      where: { id: row.id, tenantId, status: FROM[t.action] },
      data,
    });
    if (res.count === 0) return false;
    await appendAudit(tx, {
      tenantId,
      actorId: p.user.id,
      action: `proposal.${t.action}`,
      objectType: 'proposal',
      objectId: row.id,
      detail,
    });
    return true;
  });
  if (!moved) return fail(409, 'invalid_transition');
  const fresh = await getProposal(db, tenantId, row.id);
  return fresh ? ok(fresh) : fail(404, 'not_found');
}
