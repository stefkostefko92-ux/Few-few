import type { Prisma } from '@prisma/client';
import { z } from 'zod';
import { ROLES } from '../auth/rbac.js';

/**
 * Филтрите на списъците (FR-22/23): САМО по изброените полета — сървърът не приема произволни
 * ключове (`.strict()`), за да не се превърне филтърът в заявка по лични данни, които UI не
 * показва. Същите схеми валидират и запазените филтри (SavedFilter.filter).
 */

const text = z.string().trim().min(1).max(80);

export const UserFilterSchema = z
  .object({
    /** Име, имейл или фирма (подниз, без значение от регистъра). */
    q: text.optional(),
    role: z.enum(ROLES).optional(),
    kind: z.enum(['INTERNAL', 'PORTAL']).optional(),
    active: z.boolean().optional(),
    mfa: z.enum(['on', 'off']).optional(),
    /** Акаунти, чийто срок изтича в следващите N дни (още не изтекли). */
    expiringWithinDays: z.number().int().min(1).max(365).optional(),
  })
  .strict();
export type UserFilter = z.infer<typeof UserFilterSchema>;

/** Параметрите на `GET /admin/users` — низове от адреса → същият филтър + курсор. */
export const UserListQuerySchema = z
  .object({
    q: text.optional(),
    role: z.enum(ROLES).optional(),
    kind: z.enum(['INTERNAL', 'PORTAL']).optional(),
    active: z
      .enum(['true', 'false'])
      .transform((v) => v === 'true')
      .optional(),
    mfa: z.enum(['on', 'off']).optional(),
    expiringWithinDays: z.coerce.number().int().min(1).max(365).optional(),
    cursor: z.string().min(1).max(40).optional(),
    limit: z.coerce.number().int().min(1).max(100).default(50),
  })
  .strict();

export const CASE_STATUSES = [
  'OPEN',
  'AI_IN_PROGRESS',
  'WAITING_TECHNICIAN',
  'IN_PROGRESS',
  'WAITING_CUSTOMER',
  'RESOLVED',
] as const;

export const CaseFilterSchema = z
  .object({
    /** Номер на случая (подниз). */
    q: text.optional(),
    status: z.array(z.enum(CASE_STATUSES)).min(1).max(CASE_STATUSES.length).optional(),
    outcome: z.enum(['RESOLVED', 'NOT_RESOLVED', 'ESCALATED']).optional(),
    portal: z.boolean().optional(),
    productModel: z.string().trim().min(1).max(80).optional(),
    errorCode: z.string().trim().min(1).max(20).optional(),
    assignedToMe: z.boolean().optional(),
  })
  .strict();

export const ConversationFilterSchema = z
  .object({
    q: text.optional(),
    type: z
      .array(z.enum(['DIRECT', 'GROUP', 'CHANNEL', 'CASE']))
      .min(1)
      .max(4)
      .optional(),
    unread: z.boolean().optional(),
    starred: z.boolean().optional(),
  })
  .strict();

export const FILTER_SCOPES = ['USERS', 'CASES', 'CONVERSATIONS'] as const;
export type FilterScope = (typeof FILTER_SCOPES)[number];

const SCHEMAS: Record<FilterScope, z.ZodType<Record<string, unknown>>> = {
  USERS: UserFilterSchema,
  CASES: CaseFilterSchema,
  CONVERSATIONS: ConversationFilterSchema,
};

/** Валидира филтъра срещу позволените полета на обхвата; празен филтър е позволен. */
export function parseFilter(
  scope: FilterScope,
  filter: unknown,
): { ok: true; filter: Record<string, unknown> } | { ok: false } {
  const parsed = SCHEMAS[scope].safeParse(filter);
  return parsed.success ? { ok: true, filter: parsed.data } : { ok: false };
}

const DAY_MS = 24 * 3600 * 1000;

/** Филтърът на директорията → условие за Prisma, винаги в рамките на клиента. */
export function userWhere(
  tenantId: string,
  f: UserFilter,
  now: Date = new Date(),
): Prisma.UserWhereInput {
  const and: Prisma.UserWhereInput[] = [{ tenantId }];
  if (f.q) {
    and.push({
      OR: [
        { name: { contains: f.q, mode: 'insensitive' } },
        { email: { contains: f.q, mode: 'insensitive' } },
        { company: { name: { contains: f.q, mode: 'insensitive' } } },
      ],
    });
  }
  if (f.role) and.push({ role: f.role });
  if (f.kind) and.push({ kind: f.kind });
  if (f.active !== undefined) and.push({ active: f.active });
  if (f.mfa) and.push({ totpEnabledAt: f.mfa === 'on' ? { not: null } : null });
  if (f.expiringWithinDays !== undefined) {
    and.push({
      expiresAt: { gt: now, lte: new Date(now.getTime() + f.expiringWithinDays * DAY_MS) },
    });
  }
  return { AND: and };
}
