import { z } from 'zod';
import type { Prisma } from '@prisma/client';
import { prisma } from '../db.js';
import { audit } from '../audit.js';
import type { OrgAccess } from '../auth/guards.js';
import { orgHasFeature } from '../billing/entitlements.js';
import { InvoiceInputSchema } from '../einvoice/index.js';
import { sofiaToday } from '../time.js';
import { addDays, nextAfter } from './schedule.js';

/**
 * Повтарящи се фактури (SPEC 51): шаблонът се прави от издадена фактура (380) — получателят, редовете,
 * бележките и плащането ѝ; номерът, датите и доставчикът се слагат при всяко издаване. Само с плана
 * (`recurring`), само с правото да издава. Работникът е в `run.ts`.
 */
export class RecurringError extends Error {
  constructor(readonly code: 'feature' | 'notInvoice' | 'notFound' | 'invalid' | 'state') {
    super(code);
  }
}

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const optional = <T extends z.ZodType>(schema: T) =>
  z.union([z.literal('').transform(() => undefined), schema]).optional();

export const RecurringFormSchema = z.object({
  name: z.string().trim().min(1).max(120),
  frequency: z.enum(['MONTHLY', 'QUARTERLY', 'YEARLY']),
  nextRunOn: isoDate,
  endOn: optional(isoDate),
  dueDays: optional(z.coerce.number().int().min(0).max(365)),
  sendTo: optional(z.string().trim().toLowerCase().email().max(200)),
  // Текстът на всеки ред (за „{период}“); броят и редът на редовете са от документа.
  lineName: z
    .union([z.string(), z.array(z.string())])
    .optional()
    .transform((value) =>
      value === undefined ? undefined : Array.isArray(value) ? value : [value],
    )
    .pipe(z.array(z.string().trim().min(1).max(500)).max(200).optional()),
});
export type RecurringForm = z.infer<typeof RecurringFormSchema>;

/** Проверка на датите спрямо днес: първото издаване не е в миналото, краят е след него. */
function checkDates(form: RecurringForm, today: string): void {
  if (Number.isNaN(Date.parse(form.nextRunOn)) || form.nextRunOn < today) {
    throw new RecurringError('invalid');
  }
  if (form.endOn && (Number.isNaN(Date.parse(form.endOn)) || form.endOn < form.nextRunOn)) {
    throw new RecurringError('invalid');
  }
}

/** Входът на фактурата без номер, дати, доставчик и предплатено — шаблонът. */
export function templateOf(input: unknown): Prisma.InputJsonValue {
  const parsed = InvoiceInputSchema.parse(input);
  const {
    number: _number,
    seller: _seller,
    issueDate: _issue,
    taxPointDate: _taxPoint,
    dueDate: _due,
    prepaidAmount: _prepaid,
    ...rest
  } = parsed;
  return { ...rest, precedingInvoices: [] } as unknown as Prisma.InputJsonValue;
}

/** Редовете на шаблона за формата. */
export function templateLines(template: unknown): Array<{ name: string; quantity: string }> {
  const lines = (template as { lines?: unknown }).lines;
  if (!Array.isArray(lines)) return [];
  return lines.map((line: unknown) => {
    const l = line as { name?: unknown; quantity?: unknown };
    return {
      name: typeof l.name === 'string' ? l.name : '',
      quantity: typeof l.quantity === 'string' ? l.quantity : '',
    };
  });
}

/** Новият текст на редовете — само ако са толкова, колкото в шаблона. */
function withLineNames(template: Prisma.InputJsonValue, names: string[] | undefined) {
  if (!names) return template;
  const value = template as { lines?: Array<Record<string, unknown>> };
  if (!Array.isArray(value.lines) || value.lines.length !== names.length) {
    throw new RecurringError('invalid');
  }
  return {
    ...value,
    lines: value.lines.map((line, i) => ({ ...line, name: names[i] })),
  } as Prisma.InputJsonValue;
}

export async function createRecurring(
  access: OrgAccess,
  actorId: string,
  documentId: string,
  form: RecurringForm,
  today = sofiaToday(),
): Promise<string> {
  if (!(await orgHasFeature(access.organizationId, 'recurring', { viaFirmId: access.viaFirmId }))) {
    throw new RecurringError('feature');
  }
  checkDates(form, today);
  const doc = await prisma.document.findFirst({
    where: {
      id: documentId,
      organizationId: access.organizationId,
      status: 'ISSUED',
      cancelledAt: null,
      typeCode: '380',
      seriesId: { not: null },
    },
    select: { id: true, input: true, seriesId: true, number: true },
  });
  if (!doc?.seriesId) throw new RecurringError('notInvoice');
  return prisma.$transaction(async (tx) => {
    const created = await tx.recurringInvoice.create({
      data: {
        organizationId: access.organizationId,
        seriesId: doc.seriesId!,
        sourceDocumentId: doc.id,
        name: form.name,
        template: withLineNames(templateOf(doc.input), form.lineName),
        frequency: form.frequency,
        anchorDay: Number(form.nextRunOn.slice(8, 10)),
        nextRunOn: new Date(`${form.nextRunOn}T00:00:00Z`),
        endOn: form.endOn ? new Date(`${form.endOn}T00:00:00Z`) : null,
        dueDays: form.dueDays ?? null,
        sendTo: form.sendTo ?? null,
        createdById: actorId,
        viaFirmId: access.viaFirmId,
      },
      select: { id: true },
    });
    await audit(tx, {
      actorId,
      organizationId: access.organizationId,
      action: 'recurring.created',
      targetType: 'RecurringInvoice',
      targetId: created.id,
      details: { frequency: form.frequency, from: doc.number, viaFirmId: access.viaFirmId },
    });
    return created.id;
  });
}

/** Шаблонът на фирмата (и по пълномощно — само създадените от същата кантора). */
export async function findRecurring(access: OrgAccess, id: string) {
  const found = await prisma.recurringInvoice.findFirst({
    where: {
      id,
      organizationId: access.organizationId,
      ...(access.viaFirmId ? { viaFirmId: access.viaFirmId } : {}),
    },
  });
  if (!found) throw new RecurringError('notFound');
  return found;
}

export async function updateRecurring(
  access: OrgAccess,
  actorId: string,
  id: string,
  form: RecurringForm,
  today = sofiaToday(),
): Promise<void> {
  const current = await findRecurring(access, id);
  if (current.status === 'ENDED') throw new RecurringError('state');
  checkDates(form, today);
  await prisma.$transaction(async (tx) => {
    await tx.recurringInvoice.update({
      where: { id: current.id },
      data: {
        name: form.name,
        template: withLineNames(current.template as Prisma.InputJsonValue, form.lineName),
        frequency: form.frequency,
        anchorDay: Number(form.nextRunOn.slice(8, 10)),
        nextRunOn: new Date(`${form.nextRunOn}T00:00:00Z`),
        endOn: form.endOn ? new Date(`${form.endOn}T00:00:00Z`) : null,
        dueDays: form.dueDays ?? null,
        sendTo: form.sendTo ?? null,
      },
    });
    await audit(tx, {
      actorId,
      organizationId: access.organizationId,
      action: 'recurring.updated',
      targetType: 'RecurringInvoice',
      targetId: current.id,
      details: { frequency: form.frequency },
    });
  });
}

const TRANSITIONS = {
  pause: { from: ['ACTIVE'], to: 'PAUSED' },
  resume: { from: ['PAUSED'], to: 'ACTIVE' },
  end: { from: ['ACTIVE', 'PAUSED'], to: 'ENDED' },
} as const;
export type RecurringAction = keyof typeof TRANSITIONS;

export function isRecurringAction(value: unknown): value is RecurringAction {
  return typeof value === 'string' && Object.hasOwn(TRANSITIONS, value);
}

/** Пауза, продължаване (с грешките нулирани), край — условен запис срещу работника. */
export async function changeRecurring(
  access: OrgAccess,
  actorId: string,
  id: string,
  action: RecurringAction,
  today = sofiaToday(),
): Promise<void> {
  const current = await findRecurring(access, id);
  const step = TRANSITIONS[action];
  // След пауза пропуснатите периоди не се издават със закъснение — графикът продължава от днес нататък.
  const next = current.nextRunOn.toISOString().slice(0, 10);
  const resumeOn =
    action === 'resume' && next < today
      ? nextAfter(next, current.frequency, current.anchorDay, addDays(today, -1))
      : null;
  await prisma.$transaction(async (tx) => {
    const updated = await tx.recurringInvoice.updateMany({
      where: { id: current.id, status: { in: [...step.from] } },
      data: {
        status: step.to,
        ...(action === 'resume' ? { failures: 0, lastError: null } : {}),
        ...(resumeOn ? { nextRunOn: new Date(`${resumeOn}T00:00:00Z`) } : {}),
      },
    });
    if (updated.count !== 1) throw new RecurringError('state');
    await audit(tx, {
      actorId,
      organizationId: access.organizationId,
      action: `recurring.${action}`,
      targetType: 'RecurringInvoice',
      targetId: current.id,
    });
  });
}
