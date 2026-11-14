import { prisma } from '../db.js';
import { audit } from '../audit.js';
import type { OrgAccess } from '../auth/guards.js';
import { sofiaToday } from '../time.js';
import { IncomingRegisterError } from './register.js';

/**
 * Входящата фактура в дневника за покупките: правото на данъчен кредит (пълно — по подразбиране, частично,
 * без право) и месецът, в който се включва. Месецът е от месеца на издаване до края на срока по чл. 72 ЗДДС
 * и никога в бъдещ месец. Решава счетоводителят (`accounting.manage`); записът е в одита.
 */
export type VatCreditRight = 'FULL' | 'PARTIAL' | 'NONE';
export const VAT_CREDIT_RIGHTS: readonly VatCreditRight[] = ['FULL', 'PARTIAL', 'NONE'];

/**
 * Чл. 72, ал. 1 ЗДДС: правото се упражнява „за данъчния период, през който е възникнало това право, или в
 * един от следващите 12 данъчни периода“ — до 12 месеца след месеца на издаване (възникването е при
 * изискуемостта, чл. 68, ал. 2; по-ранното е за консултанта).
 */
export const CREDIT_WINDOW_MONTHS = 12;

const PERIOD = /^\d{4}-(0[1-9]|1[0-2])$/;

export const monthOf = (date: Date | null): string | null =>
  date ? date.toISOString().slice(0, 7) : null;

export function addMonths(period: string, months: number): string {
  const [year, month] = period.split('-').map(Number) as [number, number];
  const index = year * 12 + (month - 1) + months;
  return `${Math.floor(index / 12)}-${String((index % 12) + 1).padStart(2, '0')}`;
}

/** Месеците, в които фактурата може да влезе в дневника; null — без дата на издаване. */
export function allowedPeriods(
  issueDate: Date | null,
  today: string = sofiaToday(),
): { from: string; to: string } | null {
  const from = monthOf(issueDate);
  if (!from) return null;
  const last = addMonths(from, CREDIT_WINDOW_MONTHS);
  const current = today.slice(0, 7);
  return { from, to: last < current ? last : current };
}

/** Месецът в дневника: избраният или месецът на издаване. */
export const journalPeriodOf = (entry: {
  journalPeriod: string | null;
  issueDate: Date | null;
}): string | null => entry.journalPeriod ?? monthOf(entry.issueDate);

/** Проверява избора спрямо датата на издаване; връща записа или хвърля `state`/`date`. */
function validated(
  input: { credit: unknown; period: unknown },
  issueDate: Date | null,
): { vatCredit: VatCreditRight; journalPeriod: string | null; period: string } {
  const credit = input.credit;
  if (typeof credit !== 'string' || !VAT_CREDIT_RIGHTS.includes(credit as VatCreditRight)) {
    throw new IncomingRegisterError('state');
  }
  const window = allowedPeriods(issueDate);
  const period = input.period;
  if (
    !window ||
    typeof period !== 'string' ||
    !PERIOD.test(period) ||
    period < window.from ||
    period > window.to
  ) {
    throw new IncomingRegisterError('date');
  }
  // Месецът на издаване не се пише — той е по подразбиране и следва датата.
  return {
    vatCredit: credit as VatCreditRight,
    journalPeriod: period === window.from ? null : period,
    period,
  };
}

/** Качена/получена входяща фактура (`IncomingInvoice`). */
export async function setIncomingVatCredit(
  access: OrgAccess,
  actorId: string,
  id: string,
  input: { credit: unknown; period: unknown },
): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const entry = await tx.incomingInvoice.findFirst({
      where: { id, organizationId: access.organizationId },
      select: { issueDate: true },
    });
    if (!entry) throw new IncomingRegisterError('notFound');
    const { vatCredit, journalPeriod, period } = validated(input, entry.issueDate);
    await tx.incomingInvoice.updateMany({
      where: { id, organizationId: access.organizationId },
      data: { vatCredit, journalPeriod },
    });
    await audit(tx, {
      actorId,
      organizationId: access.organizationId,
      action: 'incoming.vatCredit',
      targetType: 'IncomingInvoice',
      targetId: id,
      details: { credit: vatCredit, period },
    });
  });
}

/** Документ от шкафчето (`InboxEntry`) — датата е на документа на изпращача. */
export async function setInboxVatCredit(
  access: OrgAccess,
  actorId: string,
  id: string,
  input: { credit: unknown; period: unknown },
): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const entry = await tx.inboxEntry.findFirst({
      where: { id, recipientOrgId: access.organizationId },
      select: { document: { select: { issueDate: true } } },
    });
    if (!entry) throw new IncomingRegisterError('notFound');
    const { vatCredit, journalPeriod, period } = validated(input, entry.document.issueDate);
    await tx.inboxEntry.updateMany({
      where: { id, recipientOrgId: access.organizationId },
      data: { vatCredit, journalPeriod },
    });
    await audit(tx, {
      actorId,
      organizationId: access.organizationId,
      action: 'inbox.vatCredit',
      targetType: 'InboxEntry',
      targetId: id,
      details: { credit: vatCredit, period },
    });
  });
}
