import type { Case, CaseMessage, Prisma, PrismaClient } from '@prisma/client';
import type { DiagnoseOutput } from '../ai/orchestrator.js';
import { appendAudit } from '../audit.js';
import type { Audience } from '../retrieval/types.js';
import { addTimeline } from './cases.js';

/**
 * Записът на AI отговора (§14.1, FR-12, AC-09): съобщение + доказателства + статус + хронология
 * в една транзакция, после одит. Проследимост на входа: в отговора (`modelInputs`), в хронологията
 * и в одита са САМО id и вид на изпратените файлове — никога съдържание, име или base64.
 */
export async function saveAiAnswer(
  db: PrismaClient,
  args: {
    c: Pick<Case, 'id' | 'status' | 'outcome'>;
    tenantId: string;
    actorId: string;
    audiences: readonly Audience[];
    result: DiagnoseOutput;
  },
): Promise<CaseMessage> {
  const { c, result } = args;
  const answer = result.answer;
  // Поет от оператор → остава при него; ескалиран с тикет → чака оператора, каквото и да
  // каже AI; иначе по отговора.
  const status =
    c.status === 'IN_PROGRESS'
      ? 'IN_PROGRESS'
      : c.outcome === 'ESCALATED' ||
          answer.escalation.recommended ||
          answer.status === 'undetermined'
        ? 'WAITING_TECHNICIAN'
        : 'OPEN';
  const sent = answer.modelInputs.attachments.map((a) => ({ id: a.id, kind: a.kind }));
  const notSent = answer.modelInputs.notSent.map((n) => ({ id: n.id, reason: n.reason }));
  const aiMessage = await db.$transaction(async (tx) => {
    const created = await tx.caseMessage.create({
      data: {
        caseId: c.id,
        kind: 'AI',
        body: answer.summary,
        payload: answer as unknown as Prisma.InputJsonValue,
        knowledgeSnapshotId: answer.knowledgeSnapshotId,
        promptVersion: answer.promptVersion,
        audiences: [...args.audiences],
      },
    });
    if (answer.evidence.length > 0) {
      await tx.caseEvidence.createMany({
        data: answer.evidence.map((e) => ({
          caseId: c.id,
          messageId: created.id,
          documentId: e.documentId,
          chunkId: e.chunkId,
          errorId: e.errorId,
          page: e.page,
          quote: e.quote,
        })),
      });
    }
    await tx.case.update({ where: { id: c.id }, data: { status } });
    await addTimeline(tx, c.id, 'ai.answer', null, {
      messageId: created.id,
      status: answer.status,
      confidence: answer.confidence,
      evidenceLevel: answer.gate.evidenceLevel,
      decisions: answer.gate.decisions,
      ...(sent.length > 0 ? { attachmentsSent: sent } : {}),
    });
    return created;
  });
  // FR-12: retrieval, извиквания на инструменти, версия на знанието и решенията на Gate.
  await appendAudit(db, {
    tenantId: args.tenantId,
    actorId: args.actorId,
    action: 'ai.answer',
    objectType: 'case_message',
    objectId: aiMessage.id,
    detail: {
      caseId: c.id,
      modelCalled: result.modelCalled,
      evidenceLevel: answer.gate.evidenceLevel,
      evidenceRefs: result.evidence.map((e) => e.chunkId ?? e.errorId),
      citations: answer.evidence.length,
      removedSteps: answer.gate.removedSteps,
      droppedCitations: answer.gate.droppedCitations,
      decisions: answer.gate.decisions,
      safety: answer.safety.level,
      escalation: answer.escalation.recommended,
      knowledgeSnapshotId: answer.knowledgeSnapshotId,
      promptVersion: answer.promptVersion,
      attachmentsSent: sent,
      attachmentsNotSent: notSent,
      usage: result.usage,
    },
  });
  return aiMessage;
}
