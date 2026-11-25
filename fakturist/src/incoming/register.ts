import { createHash } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { prisma } from '../db.js';
import { audit } from '../audit.js';
import type { OrgAccess } from '../auth/guards.js';
import type { Issue } from '../einvoice/index.js';
import { dec, isDecimalText, round, toCents } from '../einvoice/decimal.js';
import { isIsoDate } from '../recurring/schedule.js';
import { sofiaToday } from '../time.js';
import { checkIncoming, IncomingError } from './check.js';

/**
 * Регистърът на входящите е-фактури (SPEC 55): качен UBL/CII файл → проверка → запис с разчетените
 * полета (доставчик, номер, суми, падеж) и резултата от проверката. Файлът се записва и с грешки — той
 * е получен; грешките се показват. Същият файл втори път — „вече е в регистъра“. Получател, различен
 * от фирмата, е предупреждение.
 */
export class IncomingRegisterError extends Error {
  constructor(readonly code: 'duplicate' | 'encoding' | 'notFound' | 'state' | 'date') {
    super(code);
  }
}

function str(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function cents(value: string | undefined): bigint {
  return value && isDecimalText(value) ? toCents(round(dec(value), 2)) : 0n;
}

function date(value: string | undefined): Date | null {
  return value && isIsoDate(value) ? new Date(`${value}T00:00:00Z`) : null;
}

export async function uploadIncoming(
  access: OrgAccess,
  actorId: string,
  file: { name: string | null; buffer: Buffer },
): Promise<{ id: string; valid: boolean; issues: Issue[] }> {
  return registerIncoming({
    organizationId: access.organizationId,
    actorId,
    fileName: file.name,
    buffer: file.buffer,
    source: 'UPLOAD',
  });
}

/**
 * Записът в регистъра — общ за качения файл и за полученото през Peppol (SPEC 59): същите проверки,
 * същият отпечатък (повторен документ — `duplicate`). `actorId` е null, когато го е получила системата.
 */
export async function registerIncoming(input: {
  organizationId: string;
  actorId: string | null;
  fileName: string | null;
  buffer: Buffer;
  /** INBOX — копие на документ от шкафчето, когато изпращачът е изтрит след прекратяване. */
  source: 'UPLOAD' | 'PEPPOL' | 'INBOX';
  /** Решенията на получателя върху записа от шкафчето — копието ги запазва (отказан, кредит, месец). */
  carry?: {
    status: 'RECEIVED' | 'REJECTED';
    vatCredit: 'FULL' | 'PARTIAL' | 'NONE';
    journalPeriod: string | null;
  };
}): Promise<{ id: string; valid: boolean; issues: Issue[] }> {
  const { buffer } = input;
  let xml: string;
  try {
    xml = new TextDecoder('utf-8', { fatal: true }).decode(buffer);
  } catch {
    throw new IncomingRegisterError('encoding');
  }
  // 0x00 минава UTF-8 декодера, но PostgreSQL го отказва в TEXT (22021) — грешка на файла, не 500.
  if (xml.includes('\u0000')) throw new IncomingRegisterError('encoding');
  const check = checkIncoming(xml, input.source === 'INBOX' ? Infinity : undefined);
  const raw = check.input;
  const seller = (raw['seller'] ?? {}) as Record<string, unknown>;
  const buyer = (raw['buyer'] ?? {}) as Record<string, unknown>;
  const number = str(raw['number']);
  const supplierName = str(seller['name']);
  if (!number || !supplierName) throw new IncomingError('notInvoice');

  const org = await prisma.organization.findUniqueOrThrow({
    where: { id: input.organizationId },
    select: { eik: true, vatNumber: true },
  });
  const issues = [...check.issues];
  const buyerIds = [str(buyer['legalId']), str(buyer['vatId']), str(buyer['identifier'])];
  const ours = [org.eik, org.vatNumber].filter((v): v is string => Boolean(v));
  if (ours.length && !buyerIds.some((id) => id && ours.some((o) => id.includes(o)))) {
    issues.push({
      rule: 'BUYER',
      severity: 'warning',
      path: 'buyer',
      message: {
        bg: 'Получателят във фактурата не е тази фирма (ЕИК и ДДС номер не съвпадат).',
        en: 'The buyer on the invoice is not this company (EIK and VAT number do not match).',
      },
    });
  }
  const valid = check.parsed !== null && !check.issues.some((i) => i.severity === 'fatal');
  const sha256 = createHash('sha256').update(buffer).digest('hex');
  try {
    return await prisma.$transaction(async (tx) => {
      const created = await tx.incomingInvoice.create({
        data: {
          organizationId: input.organizationId,
          format: check.format,
          fileName: input.fileName?.slice(0, 200) ?? null,
          xml,
          sha256,
          supplierName: supplierName.slice(0, 200),
          supplierEik: str(seller['legalId'])?.slice(0, 50) ?? null,
          supplierVat: str(seller['vatId'])?.slice(0, 30) ?? null,
          number: number.slice(0, 50),
          typeCode: str(raw['typeCode'])?.slice(0, 5) ?? '380',
          issueDate: date(str(raw['issueDate'])),
          dueDate: date(str(raw['dueDate'])),
          currency: str(raw['currency'])?.slice(0, 3) ?? 'EUR',
          payableCents: cents(check.declared.payable),
          vatCents: cents(check.declared.vat),
          issues: issues.map((i) => ({
            rule: i.rule,
            severity: i.severity,
            path: i.path,
            message: i.message,
          })) as unknown as Prisma.InputJsonValue,
          valid,
          source: input.source,
          createdById: input.actorId,
          ...(input.carry ?? {}),
        },
        select: { id: true },
      });
      await audit(tx, {
        actorId: input.actorId,
        organizationId: input.organizationId,
        action:
          input.source === 'PEPPOL'
            ? 'incoming.peppol'
            : input.source === 'INBOX'
              ? 'incoming.archived'
              : 'incoming.uploaded',
        targetType: 'IncomingInvoice',
        targetId: created.id,
        details: { format: check.format, valid },
      });
      return { id: created.id, valid, issues };
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      throw new IncomingRegisterError('duplicate');
    }
    throw error;
  }
}

/** Платена (с дата), отказана или пак получена. */
export async function setIncomingStatus(
  access: OrgAccess,
  actorId: string,
  id: string,
  status: 'RECEIVED' | 'PAID' | 'REJECTED',
  paidOn?: string,
): Promise<void> {
  if (status === 'PAID' && (!paidOn || !isIsoDate(paidOn) || paidOn > sofiaToday())) {
    throw new IncomingRegisterError('date');
  }
  await prisma.$transaction(async (tx) => {
    const updated = await tx.incomingInvoice.updateMany({
      where: { id, organizationId: access.organizationId },
      data: {
        status,
        paidAt: status === 'PAID' ? new Date(`${paidOn}T00:00:00Z`) : null,
      },
    });
    if (updated.count !== 1) throw new IncomingRegisterError('notFound');
    await audit(tx, {
      actorId,
      organizationId: access.organizationId,
      action: 'incoming.status',
      targetType: 'IncomingInvoice',
      targetId: id,
      details: { status },
    });
  });
}
