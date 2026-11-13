import { Prisma } from '@prisma/client';
import { prisma } from '../db.js';
import { audit } from '../audit.js';
import { errorMessage, logger } from '../logger.js';
import { HttpError, type OrgAccess } from '../auth/guards.js';
import type { MemberRole } from '../auth/roles.js';
import { orgHasFeature } from '../billing/entitlements.js';
import { InvoiceInputSchema } from '../einvoice/index.js';
import {
  issueInTx,
  issueSettings,
  IssueRejected,
  IssueRequestSchema,
  SeriesExhausted,
  type IssueRequest,
} from '../documents/issue.js';
import { sofiaToday } from '../time.js';
import { addDays, fillPeriod, nextAfter, periodKey, periodLabel } from './schedule.js';

/**
 * Работникът на повтарящите се фактури (SPEC 51): шаблоните с настъпила дата → по един документ за
 * период. Шаблонът се заключва (FOR UPDATE SKIP LOCKED — два работника не взимат един и същ), периодът
 * е уникален в Document (recurringId, recurringPeriod), издаването е в същата транзакция. Правото се
 * проверява наново (`issueInTx` → recheckAccess): създателят, който вече не може да издава, спира
 * шаблона. След 3 поредни грешки шаблонът е на пауза. Пропуснати периоди (работникът е бил спрян) не се
 * наваксват — графикът продължава от днес.
 */
export const MAX_FAILURES = 3;

type Template = Prisma.RecurringInvoiceGetPayload<object>;

/** Достъпът на създателя към момента: пряк член или кантора с действащо пълномощно. */
async function accessOf(tx: Prisma.TransactionClient, template: Template): Promise<OrgAccess> {
  if (!template.createdById) throw new HttpError(404);
  if (!template.viaFirmId) {
    const member = await tx.membership.findUnique({
      where: {
        userId_organizationId: {
          userId: template.createdById,
          organizationId: template.organizationId,
        },
      },
      select: { role: true },
    });
    if (!member) throw new HttpError(404);
    return {
      organizationId: template.organizationId,
      role: member.role as MemberRole,
      viaFirmId: null,
      mandateId: null,
    };
  }
  const mandate = await tx.clientMandate.findFirst({
    where: { firmId: template.viaFirmId, clientId: template.organizationId, status: 'ACTIVE' },
    orderBy: { validFrom: 'desc' },
    select: { id: true },
  });
  if (!mandate) throw new HttpError(404);
  return {
    organizationId: template.organizationId,
    role: 'ACCOUNTANT',
    viaFirmId: template.viaFirmId,
    mandateId: mandate.id,
  };
}

/** Заявката за издаване: шаблонът + серията + днешната дата + падеж + `{период}` в текстовете. */
export function requestFor(template: Template, today: string): IssueRequest {
  const run = template.nextRunOn.toISOString().slice(0, 10);
  const label = periodLabel(run, template.frequency, 'bg');
  const input = InvoiceInputSchema.omit({ number: true, seller: true, issueDate: true })
    .passthrough()
    .parse(template.template);
  return IssueRequestSchema.parse({
    ...input,
    seriesId: template.seriesId,
    issueDate: today,
    dueDate: template.dueDays !== null ? addDays(today, template.dueDays) : undefined,
    notes: input.notes.map((note) => fillPeriod(note, label)),
    lines: input.lines.map((line) => ({
      ...line,
      name: fillPeriod(line.name, label),
      ...(line.description ? { description: fillPeriod(line.description, label) } : {}),
    })),
  });
}

type Outcome = 'issued' | 'skipped' | 'ended' | 'failed';

function failureCode(error: unknown): string {
  if (error instanceof IssueRejected) return 'rejected';
  if (error instanceof SeriesExhausted) return 'seriesExhausted';
  if (error instanceof HttpError) return 'access';
  if (error instanceof Error && error.message === 'feature') return 'feature';
  return 'error';
}

async function runOne(id: string, today: string): Promise<Outcome> {
  const settings = await issueSettings();
  try {
    return await prisma.$transaction(
      async (tx) => {
        const locked = await tx.$queryRaw<Array<{ id: string }>>`
          SELECT "id" FROM "RecurringInvoice"
          WHERE "id" = ${id} AND "status" = 'ACTIVE' AND "nextRunOn" <= ${today}::date
          FOR UPDATE SKIP LOCKED`;
        if (locked.length !== 1) return 'skipped';
        const template = await tx.recurringInvoice.findUniqueOrThrow({ where: { id } });
        const run = template.nextRunOn.toISOString().slice(0, 10);
        if (template.endOn && run > template.endOn.toISOString().slice(0, 10)) {
          await tx.recurringInvoice.update({ where: { id }, data: { status: 'ENDED' } });
          return 'ended';
        }
        const allowed = await orgHasFeature(template.organizationId, 'recurring', {
          viaFirmId: template.viaFirmId,
          db: tx,
        });
        if (!allowed) throw new Error('feature');
        const access = await accessOf(tx, template);
        const period = periodKey(run, template.frequency);
        const issued = await issueInTx(
          tx,
          access,
          template.createdById!,
          requestFor(template, today),
          { recurring: { id, period } },
          settings,
        );
        const next = nextAfter(run, template.frequency, template.anchorDay, today);
        const ended = template.endOn !== null && next > template.endOn.toISOString().slice(0, 10);
        await tx.recurringInvoice.update({
          where: { id },
          data: {
            nextRunOn: new Date(`${next}T00:00:00Z`),
            lastIssuedOn: new Date(`${today}T00:00:00Z`),
            failures: 0,
            lastError: null,
            ...(ended ? { status: 'ENDED' } : {}),
          },
        });
        if (template.sendTo) {
          await tx.notification.create({
            data: {
              organizationId: template.organizationId,
              kind: 'document.sent',
              toEmail: template.sendTo,
              payload: { documentId: issued.id },
            },
          });
        }
        await audit(tx, {
          actorId: template.createdById,
          organizationId: template.organizationId,
          action: 'recurring.issued',
          targetType: 'RecurringInvoice',
          targetId: id,
          details: { documentId: issued.id, period },
        });
        return 'issued';
      },
      { timeout: 30_000 },
    );
  } catch (error) {
    // Документ за този период вече има (двоен работник, ръчно пипане) — само графикът напред.
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      await advancePastToday(id, today);
      return 'skipped';
    }
    await recordFailure(id, failureCode(error), error);
    return 'failed';
  }
}

async function advancePastToday(id: string, today: string): Promise<void> {
  const template = await prisma.recurringInvoice.findUniqueOrThrow({ where: { id } });
  const run = template.nextRunOn.toISOString().slice(0, 10);
  const next = nextAfter(run, template.frequency, template.anchorDay, today);
  await prisma.recurringInvoice.updateMany({
    where: { id, nextRunOn: template.nextRunOn },
    data: { nextRunOn: new Date(`${next}T00:00:00Z`) },
  });
}

async function recordFailure(id: string, code: string, error: unknown): Promise<void> {
  logger.warn(
    { recurringId: id, code, err: errorMessage(error) },
    'повтаряща се фактура не излезе',
  );
  await prisma.$transaction(async (tx) => {
    const template = await tx.recurringInvoice.update({
      where: { id },
      data: { failures: { increment: 1 }, lastError: code },
    });
    // Без право или без план — няма смисъл да опитва пак; иначе — до 3 пъти.
    const stop = code === 'access' || code === 'feature' || template.failures >= MAX_FAILURES;
    if (stop && template.status === 'ACTIVE') {
      await tx.recurringInvoice.update({ where: { id }, data: { status: 'PAUSED' } });
      await audit(tx, {
        actorId: null,
        organizationId: template.organizationId,
        action: 'recurring.paused',
        targetType: 'RecurringInvoice',
        targetId: id,
        details: { reason: code },
      });
    }
  });
}

/** Всички настъпили шаблони; връща колко документа са издадени. */
export async function runDueRecurring(now = new Date()): Promise<number> {
  const today = sofiaToday(now);
  const due = await prisma.recurringInvoice.findMany({
    where: { status: 'ACTIVE', nextRunOn: { lte: new Date(`${today}T00:00:00Z`) } },
    orderBy: { nextRunOn: 'asc' },
    select: { id: true },
    take: 100,
  });
  let issued = 0;
  for (const { id } of due) {
    if ((await runOne(id, today)) === 'issued') issued += 1;
  }
  return issued;
}
