import type { Audience, Role, StepApproval } from '@prisma/client';
import { caseAudiences, coversAudiences } from '../../auth/rbac.js';
import { assigneeFor } from '../case-views.js';
import { notify } from '../collab/notify.js';
import type { CollabDeps } from '../collab/publish.js';
import { publishCaseEvent } from '../tickets/realtime.js';
import { approverRoles } from './policy.js';

/**
 * Последиците след commit на стъпка/разрешение (§11.2): заявката стига до разрешаващите
 * (известие + SSE), решението — до заявителя. Порталът вижда РОЛЯТА на разрешилия, не името.
 * Без текста на стъпката — само номера; текстът се чете през REST с проверка на аудиторията.
 */

const MAX_APPROVERS = 200;

interface CaseRef {
  id: string;
  number: string;
  tenantId: string;
  portal: boolean;
}

/** Кой ще получи заявката: ДРУГ човек от персонала с роля по нивото, който вижда отговора. */
export async function eligibleApprovers(
  deps: CollabDeps,
  c: CaseRef,
  approval: Pick<StepApproval, 'level' | 'requestedById'>,
  messageAudiences: readonly Audience[],
): Promise<string[]> {
  const now = new Date();
  const roles = approverRoles(approval.level);
  if (roles.length === 0) return [];
  const users = await deps.db.user.findMany({
    where: {
      tenantId: c.tenantId,
      active: true,
      kind: 'INTERNAL',
      role: { in: [...roles] },
      id: { not: approval.requestedById },
      OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
    },
    select: { id: true, role: true },
    take: MAX_APPROVERS,
  });
  return users
    .filter((u) => coversAudiences(caseAudiences(u.role, c.portal), messageAudiences))
    .map((u) => u.id);
}

export function publishStepChange(
  deps: CollabDeps,
  c: CaseRef,
  actorId: string,
  change: { messageId: string; step: number; kind: string },
): void {
  publishCaseEvent(deps, 'step.updated', { caseId: c.id, tenantId: c.tenantId }, actorId, () => ({
    caseId: c.id,
    messageId: change.messageId,
    step: change.step,
    change: change.kind,
  }));
}

export async function notifyApprovalRequested(
  deps: CollabDeps,
  c: CaseRef,
  approval: StepApproval,
  messageAudiences: readonly Audience[],
): Promise<void> {
  const ids = await eligibleApprovers(deps, c, approval, messageAudiences);
  await notify(
    deps,
    ids.map((userId) => ({
      tenantId: c.tenantId,
      userId,
      eventType: 'step.approval_requested' as const,
      objectType: 'approval' as const,
      objectId: approval.id,
      payload: {
        caseId: c.id,
        number: c.number,
        approvalId: approval.id,
        step: approval.step,
        level: approval.level,
        actionClass: approval.actionClass,
      },
    })),
    approval.requestedById,
  );
}

export async function notifyApprovalDecided(
  deps: CollabDeps,
  c: CaseRef,
  approval: StepApproval,
  decider: { id: string; name: string; role: Role; kind: 'INTERNAL' | 'PORTAL' },
): Promise<void> {
  if (approval.requestedById === decider.id) return;
  const requester = await deps.db.user.findFirst({
    where: { id: approval.requestedById, tenantId: c.tenantId },
    select: { id: true, kind: true },
  });
  if (!requester) return;
  await notify(
    deps,
    [
      {
        tenantId: c.tenantId,
        userId: requester.id,
        eventType: approval.status === 'GRANTED' ? 'step.approval_granted' : 'step.approval_denied',
        objectType: 'approval',
        objectId: approval.id,
        payload: {
          caseId: c.id,
          number: c.number,
          approvalId: approval.id,
          step: approval.step,
          status: approval.status,
          // Порталът: ролята на разрешилия, не името (`assigneeFor`).
          decidedBy: assigneeFor(requester, {
            ...decider,
            role: approval.decidedRole ?? decider.role,
          }),
        },
      },
    ],
    decider.id,
  );
}
