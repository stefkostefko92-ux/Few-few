import type { Case, CaseStepExecution, StepResult } from '@prisma/client';
import { appendAudit } from '../../audit.js';
import type { Principal } from '../../auth/sessions.js';
import { redactPii } from '../../domain/pii.js';
import { addTimeline, isParticipant } from '../cases.js';
import type { CollabDeps } from '../collab/publish.js';
import { fail, ok, type Result } from '../collab/result.js';
import { publishStepChange } from './effects.js';
import { locateStep, lockKey } from './locate.js';
import { levelsAtLeast, loadStepPolicy, stepRequirement } from './policy.js';

/**
 * Изпълнена стъпка (FR-09 „passi eseguiti“): техникът отбелязва резултата на предложена проверка —
 * OK / KO / невъзможна — с бележка. Стъпка, която иска разрешение (§11.2), НЕ се отбелязва като
 * изпълнена без ВАЛИДНО разрешение за ТОЗИ текст (хеш), за ТОЗИ човек; „невъзможна“ не е
 * изпълнение и не иска разрешение. DIRECT_COMMAND — никога. Повторното отбелязване (поправка)
 * е нов ред — историята остава; таван на стъпка срещу злоупотреба.
 */

export const MAX_EXECUTIONS_PER_STEP = 10;

export async function recordExecution(
  deps: CollabDeps,
  p: Principal,
  c: Case,
  input: { messageId: string; step: number; result: StepResult; note?: string | undefined },
): Promise<Result<CaseStepExecution>> {
  if (c.status === 'RESOLVED') return fail(409, 'case_closed');
  if (!isParticipant(p, c)) return fail(403, 'forbidden');
  const located = await locateStep(deps.db, c, p.user.role, input.messageId, input.step);
  if (!located) return fail(404, 'not_found');
  const policy = await loadStepPolicy(deps.db, c.tenantId);
  const req = stepRequirement(located.check, policy);
  if (!req.executable) return fail(422, 'step_not_executable');
  const gated = req.level !== 'NONE' && input.result !== 'NOT_POSSIBLE';
  const note = input.note ? redactPii(input.note) : null;
  const result = await deps.db.$transaction(async (tx): Promise<Result<CaseStepExecution>> => {
    await lockKey(tx, `step|${located.messageId}|${input.step}`);
    const count = await tx.caseStepExecution.count({
      where: { messageId: located.messageId, step: input.step },
    });
    if (count >= MAX_EXECUTIONS_PER_STEP) return fail(409, 'step_limit');
    let approvalId: string | null = null;
    if (gated) {
      const approval = await tx.stepApproval.findFirst({
        where: {
          tenantId: c.tenantId,
          messageId: located.messageId,
          step: input.step,
          stepHash: located.hash,
          status: 'GRANTED',
          requestedById: p.user.id,
          expiresAt: { gt: new Date() },
          // Покрива ли СЕГАШНОТО ниво (затегната политика → старото по-слабо не стига).
          level: { in: levelsAtLeast(req.level) },
        },
        orderBy: { decidedAt: 'desc' },
        select: { id: true },
      });
      if (!approval) return fail(409, 'step_approval_required');
      approvalId = approval.id;
    }
    const row = await tx.caseStepExecution.create({
      data: {
        tenantId: c.tenantId,
        caseId: c.id,
        messageId: located.messageId,
        step: input.step,
        stepHash: located.hash,
        actionClass: located.check.actionClass,
        gateVersion: located.gateVersion,
        result: input.result,
        note,
        approvalId,
        authorId: p.user.id,
      },
    });
    // Хронология и одит — без бележката (свободен текст): само id, номер, резултат и клас.
    const meta = {
      executionId: row.id,
      messageId: row.messageId,
      step: row.step,
      result: row.result,
      actionClass: row.actionClass,
      approvalId,
      withNote: note !== null,
    };
    await addTimeline(tx, c.id, 'step.executed', p.user.id, meta);
    await appendAudit(tx, {
      tenantId: c.tenantId,
      actorId: p.user.id,
      action: 'step.execute',
      objectType: 'case_step',
      objectId: row.id,
      detail: { caseId: c.id, ...meta, stepHash: row.stepHash, gateVersion: row.gateVersion },
    });
    return ok(row);
  });
  if (result.ok) {
    publishStepChange(deps, c, p.user.id, {
      messageId: result.value.messageId,
      step: result.value.step,
      kind: 'executed',
    });
  }
  return result;
}
