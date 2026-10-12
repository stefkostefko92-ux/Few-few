import type { FeedbackRating } from '@prisma/client';
import { appendAudit } from '../../audit.js';
import { redactPii } from '../../domain/pii.js';
import type { CollabDeps } from '../collab/publish.js';
import { notifyKnowledgeOwners } from './notify.js';

/**
 * Обратна връзка → предложение за подобрение (FR-10 „Utile / non utile / segnalazione errore e
 * proposta di miglioramento“): „Non utile“ или „Errore tecnico“ С коментар става предложение в
 * опашката на отговорника за знанието. Едно отворено предложение на обратна връзка — нова
 * оценка/коментар на същия човек за същия отговор го обновява, не трупа нови. „Utile“ или празен
 * коментар не правят предложение. Коментарът е маскиран (redactPii); в одита — само id-та и оценката.
 */

export const OPEN_STATUSES = ['NEW', 'IN_REVIEW'] as const;

export interface FeedbackProposalInput {
  tenantId: string;
  actorId: string;
  caseId: string;
  messageId: string;
  feedbackId: string;
  rating: FeedbackRating;
  /** Вече маскиран коментар (или null). */
  comment: string | null;
}

export function wantsProposal(rating: FeedbackRating, comment: string | null): boolean {
  return rating !== 'USEFUL' && comment !== null && comment.trim().length > 0;
}

/** Създава/обновява предложението. Връща id-то или null (без предложение). Никога не хвърля. */
export async function recordFeedbackProposal(
  deps: CollabDeps,
  input: FeedbackProposalInput,
): Promise<string | null> {
  if (!wantsProposal(input.rating, input.comment)) return null;
  const comment = redactPii(input.comment ?? '').slice(0, 1000);
  try {
    const result = await deps.db.$transaction(async (tx) => {
      // Паралелни повторения на същата оценка → едно предложение (ключът е обратната връзка).
      const key = `proposal|feedback|${input.feedbackId}`;
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${key}, 4330))`;
      const open = await tx.knowledgeProposal.findFirst({
        where: {
          tenantId: input.tenantId,
          source: 'FEEDBACK',
          feedbackId: input.feedbackId,
          status: { in: [...OPEN_STATUSES] },
        },
        select: { id: true },
      });
      if (open) {
        await tx.knowledgeProposal.update({
          where: { id: open.id },
          data: { rating: input.rating, comment, lastSeenAt: new Date() },
        });
        return { id: open.id, created: false };
      }
      const row = await tx.knowledgeProposal.create({
        data: {
          tenantId: input.tenantId,
          source: 'FEEDBACK',
          caseId: input.caseId,
          messageId: input.messageId,
          feedbackId: input.feedbackId,
          rating: input.rating,
          comment,
          createdById: input.actorId,
        },
        select: { id: true },
      });
      await appendAudit(tx, {
        tenantId: input.tenantId,
        actorId: input.actorId,
        action: 'proposal.create',
        objectType: 'proposal',
        objectId: row.id,
        detail: {
          source: 'FEEDBACK',
          caseId: input.caseId,
          messageId: input.messageId,
          rating: input.rating,
        },
      });
      return { id: row.id, created: true };
    });
    if (result.created) {
      await notifyKnowledgeOwners(deps, {
        tenantId: input.tenantId,
        proposalId: result.id,
        source: 'FEEDBACK',
        actorId: input.actorId,
      });
    }
    return result.id;
  } catch (err) {
    // Оценката вече е записана — предложението е вторично (без съдържание в лога).
    deps.logger.warn(
      { errName: err instanceof Error ? err.name : 'unknown' },
      'предложението от обратната връзка не беше записано',
    );
    return null;
  }
}
