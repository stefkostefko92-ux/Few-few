import type { Case, Prisma, PrismaClient, Role } from '@prisma/client';
import { caseAudiences, coversAudiences } from '../../auth/rbac.js';
import type { Principal } from '../../auth/sessions.js';
import { assigneeFor, type MessageAuthor } from '../case-views.js';
import { parseStepPayload } from './locate.js';
import { levelsApprovableBy } from './policy.js';

/**
 * Изгледите на стъпките за читателя: изпълненията и разрешенията САМО за AI отговорите, които
 * той вижда (аудитории, AC-18). Хората — по правилото на `assigneeFor`: порталният техник вижда
 * РОЛЯТА на служителя (и на разрешилия — ролята към момента на решението), не името.
 */

type Reader = Principal['user'];

async function peopleMap(db: PrismaClient, tenantId: string, ids: Iterable<string>) {
  const list = [...new Set(ids)];
  if (list.length === 0) return new Map<string, MessageAuthor>();
  const rows = await db.user.findMany({
    where: { id: { in: list }, tenantId },
    select: { id: true, name: true, role: true, kind: true },
  });
  return new Map(rows.map((u) => [u.id, u]));
}

function personFor(
  reader: Reader,
  people: Map<string, MessageAuthor>,
  id: string | null,
  roleAtTheTime?: Role | null,
) {
  const u = id ? people.get(id) : undefined;
  if (!u) return null;
  return assigneeFor(reader, roleAtTheTime ? { ...u, role: roleAtTheTime } : u);
}

export async function stepStateFor(db: PrismaClient, p: Principal, c: Case) {
  const reader = caseAudiences(p.user.role, c.portal);
  const messages = await db.caseMessage.findMany({
    where: { caseId: c.id, kind: 'AI' },
    select: { id: true, audiences: true },
  });
  const ids = messages.filter((m) => coversAudiences(reader, m.audiences)).map((m) => m.id);
  if (ids.length === 0) return { executions: [], approvals: [] };
  const [executions, approvals] = await Promise.all([
    db.caseStepExecution.findMany({
      where: { caseId: c.id, messageId: { in: ids } },
      orderBy: { createdAt: 'asc' },
      take: 1000,
    }),
    db.stepApproval.findMany({
      where: { caseId: c.id, messageId: { in: ids } },
      orderBy: { createdAt: 'asc' },
      take: 500,
    }),
  ]);
  const people = await peopleMap(db, c.tenantId, [
    ...executions.map((e) => e.authorId),
    ...approvals.map((a) => a.requestedById),
    ...approvals.flatMap((a) => (a.decidedById ? [a.decidedById] : [])),
  ]);
  const now = Date.now();
  return {
    executions: executions.map((e) => ({
      id: e.id,
      messageId: e.messageId,
      step: e.step,
      stepHash: e.stepHash,
      actionClass: e.actionClass,
      result: e.result,
      note: e.note,
      approvalId: e.approvalId,
      at: e.createdAt,
      by: personFor(p.user, people, e.authorId),
    })),
    approvals: approvals.map((a) => ({
      id: a.id,
      messageId: a.messageId,
      step: a.step,
      stepHash: a.stepHash,
      actionClass: a.actionClass,
      level: a.level,
      status: a.status,
      sources: a.sources,
      selfAttested: a.selfAttested,
      requestNote: a.requestNote,
      requestedAt: a.createdAt,
      requestedBy: personFor(p.user, people, a.requestedById),
      decidedAt: a.decidedAt,
      decidedBy: personFor(p.user, people, a.decidedById, a.decidedRole),
      decisionReason: a.decisionReason,
      expiresAt: a.expiresAt,
      valid: a.status === 'GRANTED' && a.expiresAt !== null && a.expiresAt.getTime() > now,
    })),
  };
}

/** Чакащите заявки, по които човекът МОЖЕ да реши (роля по нивото, не своите, вижда отговора). */
export async function pendingApprovalsFor(db: PrismaClient, p: Principal) {
  const levels = levelsApprovableBy(p.user.role);
  if (levels.length === 0 || p.user.kind !== 'INTERNAL') return [];
  const rows = await db.stepApproval.findMany({
    where: {
      tenantId: p.user.tenantId,
      status: 'PENDING',
      level: { in: levels },
      requestedById: { not: p.user.id },
    },
    orderBy: { createdAt: 'asc' },
    take: 100,
    include: {
      case: { select: { id: true, number: true, portal: true, context: true } },
      message: { select: { audiences: true, payload: true } },
    },
  });
  const visible = rows.filter((r) =>
    coversAudiences(caseAudiences(p.user.role, r.case.portal), r.message.audiences),
  );
  const people = await peopleMap(
    db,
    p.user.tenantId,
    visible.map((r) => r.requestedById),
  );
  return visible.map((r) => {
    const check = parseStepPayload(r.message.payload)?.checks.find((k) => k.step === r.step);
    const ctx = r.case.context as Prisma.JsonObject | null;
    return {
      id: r.id,
      caseId: r.case.id,
      caseNumber: r.case.number,
      productModel: typeof ctx?.productModel === 'string' ? ctx.productModel : null,
      messageId: r.messageId,
      step: r.step,
      action: check?.action ?? null,
      expected: check?.expected ?? null,
      actionClass: r.actionClass,
      level: r.level,
      requestNote: r.requestNote,
      requestedAt: r.createdAt,
      requestedBy: personFor(p.user, people, r.requestedById),
    };
  });
}
