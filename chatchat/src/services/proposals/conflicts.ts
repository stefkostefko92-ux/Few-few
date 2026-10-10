import type { Prisma } from '@prisma/client';
import { appendAudit } from '../../audit.js';
import { sha256 } from '../../crypto.js';
import type { EvidenceItem, RetrievalResult } from '../../retrieval/types.js';
import type { CollabDeps } from '../collab/publish.js';
import { notifyKnowledgeOwners } from './notify.js';

/**
 * §11.3 „Conflitto tra fonti → flag per owner della knowledge“: конфликт, отчетен от СИСТЕМАТА в
 * AI отговор (две съвместими ревизии на документ, код за грешка с две значения — `findConflicts`),
 * става предложение „конфликт между X и Y“ в опашката на отговорника за знанието. Конфликтите на
 * модела (свободен текст) не правят предложения — само детерминистичните.
 *
 * Дедупликация по подпис (вид + код + източниците — `dedupeKey`): отворено предложение (NEW /
 * IN_REVIEW) или отхвърлено (решението на отговорника се уважава) само увеличава `occurrences`, без
 * ново известие; прието, но конфликтът се е върнал → ново предложение. В предложението са само
 * кодове, ревизии и id-та — никакъв текст от документите.
 */

const SYSTEM_CONFLICT = /^(revision|error):(.{1,80})$/;
const DEDUPE_STATUSES = ['NEW', 'IN_REVIEW', 'REJECTED'] as const;

export interface ConflictItem {
  kind: 'document' | 'error';
  documentId: string;
  documentCode: string;
  documentTitle: string;
  revision: string;
  errorId: string | null;
  errorCode: string | null;
}

export interface ConflictPayload {
  kind: 'revision' | 'error';
  code: string;
  items: ConflictItem[];
}

/** Конфликтът като данни за опашката + подписът му; null — не е системен или няма източници. */
export function conflictPayload(
  conflict: RetrievalResult['conflicts'][number],
  evidence: readonly EvidenceItem[],
): { payload: ConflictPayload; dedupeKey: string } | null {
  const m = SYSTEM_CONFLICT.exec(conflict.description);
  if (!m) return null;
  const byRef = new Map((Array.isArray(evidence) ? evidence : []).map((e) => [e.ref, e]));
  const seen = new Set<string>();
  const items: ConflictItem[] = [];
  for (const ref of conflict.refs) {
    const e = byRef.get(ref);
    if (!e) continue;
    const id = e.errorId ?? e.documentId;
    if (seen.has(id)) continue;
    seen.add(id);
    items.push({
      kind: e.kind,
      documentId: e.documentId,
      documentCode: e.documentCode,
      documentTitle: e.documentTitle,
      revision: e.revision,
      errorId: e.errorId,
      errorCode: e.errorCode,
    });
  }
  if (items.length < 2) return null;
  items.sort((a, b) => {
    const ka = `${a.documentCode}|${a.revision}|${a.errorId ?? ''}`;
    const kb = `${b.documentCode}|${b.revision}|${b.errorId ?? ''}`;
    return ka < kb ? -1 : ka > kb ? 1 : 0;
  });
  const kind = m[1] === 'error' ? 'error' : 'revision';
  const code = m[2] ?? '';
  const signature = [kind, code, ...items.map((i) => i.errorId ?? i.documentId)].join('|');
  return { payload: { kind, code, items }, dedupeKey: sha256(signature) };
}

export interface ConflictProposalInput {
  tenantId: string;
  caseId: string;
  messageId: string;
  conflicts: RetrievalResult['conflicts'];
  evidence: readonly EvidenceItem[];
}

/** Предложенията за конфликтите на един AI отговор. Връща id-тата на НОВИТЕ. Никога не хвърля. */
export async function proposeConflicts(
  deps: CollabDeps,
  input: ConflictProposalInput,
): Promise<string[]> {
  const created: string[] = [];
  // Диагностика без системни конфликти (напр. заместител в тестовете) — нищо за предлагане.
  for (const conflict of Array.isArray(input.conflicts) ? input.conflicts : []) {
    const found = conflictPayload(conflict, input.evidence);
    if (!found) continue;
    try {
      const id = await upsertConflict(deps, input, found.payload, found.dedupeKey);
      if (id) created.push(id);
    } catch (err) {
      deps.logger.warn(
        { errName: err instanceof Error ? err.name : 'unknown' },
        'предложението за конфликт не беше записано',
      );
    }
  }
  for (const proposalId of created) {
    await notifyKnowledgeOwners(deps, {
      tenantId: input.tenantId,
      proposalId,
      source: 'CONFLICT',
      actorId: null,
    });
  }
  return created;
}

async function upsertConflict(
  deps: CollabDeps,
  input: ConflictProposalInput,
  payload: ConflictPayload,
  dedupeKey: string,
): Promise<string | null> {
  return deps.db.$transaction(async (tx) => {
    // Два паралелни отговора със същия конфликт → едно предложение.
    const lock = `proposal|conflict|${input.tenantId}|${dedupeKey}`;
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${lock}, 4330))`;
    const existing = await tx.knowledgeProposal.findFirst({
      where: {
        tenantId: input.tenantId,
        source: 'CONFLICT',
        dedupeKey,
        status: { in: [...DEDUPE_STATUSES] },
      },
      orderBy: { createdAt: 'desc' },
      select: { id: true },
    });
    if (existing) {
      await tx.knowledgeProposal.update({
        where: { id: existing.id },
        data: { occurrences: { increment: 1 }, lastSeenAt: new Date() },
      });
      return null;
    }
    const row = await tx.knowledgeProposal.create({
      data: {
        tenantId: input.tenantId,
        source: 'CONFLICT',
        caseId: input.caseId,
        messageId: input.messageId,
        dedupeKey,
        conflict: payload as unknown as Prisma.InputJsonValue,
      },
      select: { id: true },
    });
    await appendAudit(tx, {
      tenantId: input.tenantId,
      actorId: null,
      action: 'proposal.create',
      objectType: 'proposal',
      objectId: row.id,
      detail: {
        source: 'CONFLICT',
        caseId: input.caseId,
        messageId: input.messageId,
        kind: payload.kind,
        code: payload.code,
        documents: payload.items.map((i) => i.documentId),
        errors: payload.items.map((i) => i.errorId).filter((x): x is string => x !== null),
      },
    });
    return row.id;
  });
}
