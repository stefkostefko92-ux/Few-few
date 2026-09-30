import 'server-only';
import type { Prisma } from '@prisma/client';
import { prisma } from './db';
import { log } from './log';

export type AuditAction =
  | 'LOGIN' | 'LOGIN_FAILED' | 'LOGOUT' | 'PASSWORD_CHANGED'
  | 'PROJECT_CREATED' | 'PROJECT_UPDATED' | 'PROJECT_ARCHIVED' | 'PROJECT_RESTORED'
  | 'CALCULATION_SAVED' | 'CALCULATION_REVIEWED' | 'REPORT_DOWNLOADED'
  | 'SHAFT_DESIGN_SAVED' | 'DXF_DOWNLOADED' | 'LIFT_DESIGN_SAVED'
  | 'PLANT_UPDATED' | 'LOGO_UPLOADED' | 'LOGO_REMOVED' | 'DRAWING_SET_ISSUED' | 'DRAWING_SET_REVISED' | 'DRAWING_SET_DOWNLOADED'
  | 'USER_CREATED' | 'USER_UPDATED' | 'USER_PASSWORD_RESET'
  | 'COMPANY_CREATED' | 'COMPANY_UPDATED';

interface AuditInput {
  companyId: string | null;
  userId: string | null;
  action: AuditAction;
  entity: string;
  entityId?: string | null;
  meta?: Prisma.InputJsonValue;
}

// Records who did what. Never throws: the audit must not break the action itself.
export async function audit(input: AuditInput): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: { companyId: input.companyId, userId: input.userId, action: input.action, entity: input.entity, entityId: input.entityId ?? null, meta: input.meta },
    });
  } catch (err) {
    log.error({ err, action: input.action }, 'audit write failed');
  }
}
