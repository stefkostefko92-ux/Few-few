import type { Prisma, PrismaClient } from '@prisma/client';
import { parseStepPayload } from './locate.js';

/**
 * Изпълнените стъпки и разрешенията за обобщението на тикета и предаването (FR-09 „passi
 * eseguiti“, FR-19, AC-14) — само за AI отговорите, които авторът на обобщението вижда. Без имена:
 * обобщението се пази и се чете и от портала, и (по-късно) от helpdesk — авторът е id + роля.
 */

type Db = PrismaClient | Prisma.TransactionClient;

export async function stepsForSummary(
  db: Db,
  caseId: string,
  messages: ReadonlyArray<{ id: string; payload: Prisma.JsonValue }>,
) {
  const ids = messages.map((m) => m.id);
  if (ids.length === 0) return { executedSteps: [], approvals: [] };
  const [executions, approvals] = await Promise.all([
    db.caseStepExecution.findMany({
      where: { caseId, messageId: { in: ids } },
      orderBy: { createdAt: 'asc' },
      take: 500,
    }),
    db.stepApproval.findMany({
      where: { caseId, messageId: { in: ids } },
      orderBy: { createdAt: 'asc' },
      take: 200,
    }),
  ]);
  const checks = new Map<string, { action: string; expected: string }>();
  for (const m of messages) {
    for (const k of parseStepPayload(m.payload)?.checks ?? []) {
      checks.set(`${m.id}#${k.step}`, { action: k.action, expected: k.expected });
    }
  }
  const authorIds = [...new Set(executions.map((e) => e.authorId))];
  const roles = new Map(
    (
      await db.user.findMany({
        where: { id: { in: authorIds } },
        select: { id: true, role: true },
      })
    ).map((u) => [u.id, u.role]),
  );
  return {
    executedSteps: executions.map((e) => ({
      messageId: e.messageId,
      step: e.step,
      ...(checks.get(`${e.messageId}#${e.step}`) ?? { action: null, expected: null }),
      actionClass: e.actionClass,
      stepHash: e.stepHash,
      gateVersion: e.gateVersion,
      result: e.result,
      note: e.note,
      approvalId: e.approvalId,
      authorId: e.authorId,
      authorRole: roles.get(e.authorId) ?? null,
      at: e.createdAt,
    })),
    approvals: approvals.map((a) => ({
      id: a.id,
      messageId: a.messageId,
      step: a.step,
      stepHash: a.stepHash,
      actionClass: a.actionClass,
      gateVersion: a.gateVersion,
      level: a.level,
      status: a.status,
      sources: a.sources,
      selfAttested: a.selfAttested,
      requestedById: a.requestedById,
      requestedAt: a.createdAt,
      decidedById: a.decidedById,
      decidedRole: a.decidedRole,
      decisionReason: a.decisionReason,
      decidedAt: a.decidedAt,
      expiresAt: a.expiresAt,
    })),
  };
}
