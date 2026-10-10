import type { Case, Prisma, StepApproval } from '@prisma/client';
import { appendAudit } from '../../audit.js';
import { caseAudiences, coversAudiences } from '../../auth/rbac.js';
import type { Principal } from '../../auth/sessions.js';
import { redactPii } from '../../domain/pii.js';
import { addTimeline, findCaseFor, isParticipant } from '../cases.js';
import type { CollabDeps } from '../collab/publish.js';
import { fail, ok, type Result } from '../collab/result.js';
import { auditReason } from '../users.js';
import { notifyApprovalDecided, notifyApprovalRequested, publishStepChange } from './effects.js';
import { locateStep, lockKey, sourcesOf } from './locate.js';
import { approverRoles, loadStepPolicy, stepRequirement } from './policy.js';

/**
 * Човешкото потвърждение (§11.2 Human-in-the-loop): заявка за разрешение на стъпка, решение
 * (разрешено/отказано с причина) и отказ на заявката. Правилата:
 *  - заявява участник в случая (създател/поел), за стъпка, която ИСКА разрешение по политиката;
 *  - SELF: самият техник, само с изрично потвърждение, че е прочел процедурата;
 *  - SUPPORT/ENGINEERING: ДРУГ човек от персонала с роля по нивото — никога заявителят; той
 *    трябва да вижда отговора (аудиториите му), иначе не знае какво разрешава;
 *  - DIRECT_COMMAND — никога. Записва се КОЙ, кога, за коя стъпка (хеш + източници).
 */

type R = Promise<Result<StepApproval>>;

const MINUTE = 60_000;

export async function requestApproval(
  deps: CollabDeps,
  p: Principal,
  c: Case,
  input: { messageId: string; step: number; note?: string | undefined; attest?: boolean },
): R {
  if (c.status === 'RESOLVED') return fail(409, 'case_closed');
  if (!isParticipant(p, c)) return fail(403, 'forbidden');
  const located = await locateStep(deps.db, c, p.user.role, input.messageId, input.step);
  if (!located) return fail(404, 'not_found');
  const policy = await loadStepPolicy(deps.db, c.tenantId);
  const req = stepRequirement(located.check, policy);
  if (!req.executable) return fail(422, 'step_not_executable');
  if (req.level === 'NONE') return fail(422, 'approval_not_required');
  if (req.level === 'SELF' && input.attest !== true) return fail(422, 'attestation_required');
  const self = req.level === 'SELF';
  const now = new Date();
  type Out = Result<{ row: StepApproval; fresh: boolean }>;
  const result = await deps.db.$transaction(async (tx): Promise<Out> => {
    await lockKey(tx, `step|${located.messageId}|${input.step}`);
    const open = await tx.stepApproval.findFirst({
      where: {
        messageId: located.messageId,
        step: input.step,
        OR: [
          { status: 'PENDING' },
          { status: 'GRANTED', requestedById: p.user.id, expiresAt: { gt: now } },
        ],
      },
      orderBy: { createdAt: 'desc' },
    });
    if (open) {
      // Повтор (двоен клик) връща същата заявка; чужда чакаща — конфликт.
      return open.requestedById === p.user.id
        ? ok({ row: open, fresh: false })
        : fail(409, 'approval_pending');
    }
    const sources = sourcesOf(located.payload, located.check);
    const row = await tx.stepApproval.create({
      data: {
        tenantId: c.tenantId,
        caseId: c.id,
        messageId: located.messageId,
        step: input.step,
        stepHash: located.hash,
        actionClass: located.check.actionClass,
        gateVersion: located.gateVersion,
        level: req.level,
        sources: sources as unknown as Prisma.InputJsonValue,
        requestedById: p.user.id,
        requestNote: input.note ? redactPii(input.note) : null,
        ...(self
          ? {
              status: 'GRANTED' as const,
              selfAttested: true,
              decidedById: p.user.id,
              decidedRole: p.user.role,
              decidedAt: now,
              expiresAt: new Date(now.getTime() + policy.ttlMinutes * MINUTE),
            }
          : {}),
      },
    });
    const meta = {
      approvalId: row.id,
      messageId: row.messageId,
      step: row.step,
      level: row.level,
      actionClass: row.actionClass,
    };
    await addTimeline(
      tx,
      c.id,
      self ? 'step.approval_granted' : 'step.approval_requested',
      p.user.id,
      self ? { ...meta, selfAttested: true, decidedRole: p.user.role } : meta,
    );
    await appendAudit(tx, {
      tenantId: c.tenantId,
      actorId: p.user.id,
      action: self ? 'step.approval.self' : 'step.approval.request',
      objectType: 'step_approval',
      objectId: row.id,
      detail: {
        caseId: c.id,
        ...meta,
        stepHash: row.stepHash,
        gateVersion: row.gateVersion,
        sources: sources.map(
          (s) => `${s.documentCode}@${s.revision}${s.page ? `#p${s.page}` : ''}`,
        ),
      },
    });
    return ok({ row, fresh: true });
  });
  if (!result.ok) return result;
  const { row, fresh } = result.value;
  if (fresh) {
    publishStepChange(deps, c, p.user.id, {
      messageId: row.messageId,
      step: row.step,
      kind: self ? 'approval_granted' : 'approval_requested',
    });
    if (!self) await notifyApprovalRequested(deps, c, row, located.audiences);
  }
  return ok(row);
}

/** Решение по заявка: разрешава/отказва ДРУГ човек с роля по нивото; причината е задължителна. */
export async function decideApproval(
  deps: CollabDeps,
  p: Principal,
  approvalId: string,
  input: { decision: 'GRANT' | 'DENY'; reason: string },
): R {
  const approval = await deps.db.stepApproval.findFirst({
    where: { id: approvalId, tenantId: p.user.tenantId },
  });
  const c = approval ? await findCaseFor(deps.db, p, approval.caseId) : null;
  if (!approval || !c) return fail(404, 'not_found');
  if (p.user.kind !== 'INTERNAL' || !approverRoles(approval.level).includes(p.user.role)) {
    return fail(403, 'approver_role');
  }
  if (approval.requestedById === p.user.id) return fail(403, 'approver_is_requester');
  // Разрешаващият трябва да вижда стъпката, която разрешава (аудиториите на отговора).
  const message = await deps.db.caseMessage.findFirst({
    where: { id: approval.messageId, caseId: c.id },
    select: { audiences: true },
  });
  if (!message || !coversAudiences(caseAudiences(p.user.role, c.portal), message.audiences)) {
    return fail(403, 'approver_cannot_view');
  }
  if (c.status === 'RESOLVED') return fail(409, 'case_closed');
  const policy = await loadStepPolicy(deps.db, c.tenantId);
  const granted = input.decision === 'GRANT';
  const result = await deps.db.$transaction(async (tx): Promise<Result<StepApproval>> => {
    await lockKey(tx, `step|${approval.messageId}|${approval.step}`);
    const now = new Date();
    const updated = await tx.stepApproval.updateMany({
      where: { id: approval.id, status: 'PENDING' },
      data: {
        status: granted ? 'GRANTED' : 'DENIED',
        decidedById: p.user.id,
        decidedRole: p.user.role,
        decisionReason: redactPii(input.reason),
        decidedAt: now,
        expiresAt: granted ? new Date(now.getTime() + policy.ttlMinutes * MINUTE) : null,
      },
    });
    if (updated.count !== 1) return fail(409, 'approval_not_pending');
    const row = await tx.stepApproval.findUniqueOrThrow({ where: { id: approval.id } });
    const meta = {
      approvalId: row.id,
      messageId: row.messageId,
      step: row.step,
      level: row.level,
      actionClass: row.actionClass,
      decidedRole: p.user.role,
    };
    await addTimeline(
      tx,
      c.id,
      granted ? 'step.approval_granted' : 'step.approval_denied',
      p.user.id,
      meta,
    );
    await appendAudit(tx, {
      tenantId: c.tenantId,
      actorId: p.user.id,
      action: 'step.approval.decide',
      objectType: 'step_approval',
      objectId: row.id,
      detail: {
        caseId: c.id,
        ...meta,
        decision: row.status,
        requestedById: row.requestedById,
        stepHash: row.stepHash,
        gateVersion: row.gateVersion,
        sources: row.sources,
        reason: auditReason(input.reason),
      },
    });
    return ok(row);
  });
  if (result.ok) {
    publishStepChange(deps, c, p.user.id, {
      messageId: result.value.messageId,
      step: result.value.step,
      kind: granted ? 'approval_granted' : 'approval_denied',
    });
    await notifyApprovalDecided(deps, c, result.value, p.user);
  }
  return result;
}

/** Заявителят се отказва от чакаща заявка (напр. стъпката вече не е нужна). */
export async function cancelApproval(deps: CollabDeps, p: Principal, approvalId: string): R {
  const approval = await deps.db.stepApproval.findFirst({
    where: { id: approvalId, tenantId: p.user.tenantId },
  });
  const c = approval ? await findCaseFor(deps.db, p, approval.caseId) : null;
  if (!approval || !c) return fail(404, 'not_found');
  if (approval.requestedById !== p.user.id) return fail(403, 'forbidden');
  const result = await deps.db.$transaction(async (tx): Promise<Result<StepApproval>> => {
    const updated = await tx.stepApproval.updateMany({
      where: { id: approval.id, status: 'PENDING' },
      data: { status: 'CANCELLED', decidedAt: new Date() },
    });
    if (updated.count !== 1) return fail(409, 'approval_not_pending');
    const meta = { approvalId: approval.id, messageId: approval.messageId, step: approval.step };
    await addTimeline(tx, c.id, 'step.approval_cancelled', p.user.id, meta);
    await appendAudit(tx, {
      tenantId: c.tenantId,
      actorId: p.user.id,
      action: 'step.approval.cancel',
      objectType: 'step_approval',
      objectId: approval.id,
      detail: { caseId: c.id, ...meta },
    });
    return ok(await tx.stepApproval.findUniqueOrThrow({ where: { id: approval.id } }));
  });
  if (result.ok) {
    publishStepChange(deps, c, p.user.id, {
      messageId: approval.messageId,
      step: approval.step,
      kind: 'approval_cancelled',
    });
  }
  return result;
}
