import type { Prisma } from '@prisma/client';
import { prisma } from '../db.js';
import { audit } from '../audit.js';
import { buildEInvoice } from '../einvoice/index.js';
import { toCents } from '../einvoice/decimal.js';
import type { OrgAccess } from '../auth/guards.js';
import { recheckAccess } from '../documents/recheck.js';
import { IssueRejected, IssueRequestSchema, issueSettings, sellerOf } from '../documents/issue.js';
import { formatNumber } from '../documents/numbering.js';
import type { PdfLanguage } from '../documents/pdf-labels.js';
import { externalMailAllowed } from '../mail/external-quota.js';
import { ProformaError } from './link.js';

/**
 * Проформа фактура (решение на собственика, 13.11.2026): предложение за плащане, НЕ данъчен документ —
 * своя номерация „ПФ-“ + 10 цифри (броячът на фирмата, без серията на фактурите), без веригата,
 * дневниците, напомнянията и банката. Входът минава същите проверки като фактура (380) — затова
 * „Издай фактура“ от нея не се спъва. Доставчикът и номерът са от сървъра.
 */
export const ProformaRequestSchema = IssueRequestSchema.omit({ seriesId: true });
export type ProformaRequest = ReturnType<typeof ProformaRequestSchema.parse>;

export const PROFORMA_PREFIX = 'ПФ-';

export async function createProforma(
  access: OrgAccess,
  actorId: string,
  request: ProformaRequest,
  pdfLanguage: PdfLanguage,
): Promise<{ id: string; number: string }> {
  const settings = await issueSettings();
  return prisma.$transaction(async (tx) => {
    const orgs = await tx.$queryRaw<Array<{ id: string }>>`
      SELECT "id" FROM "Organization" WHERE "id" = ${access.organizationId} FOR UPDATE`;
    if (orgs.length !== 1) throw new ProformaError('notFound');
    await recheckAccess(tx, access, actorId);
    const org = await tx.organization.findUniqueOrThrow({ where: { id: access.organizationId } });
    const allocated = await tx.$queryRaw<Array<{ next: number }>>`
      UPDATE "Organization" SET "proformaNext" = "proformaNext" + 1
      WHERE "id" = ${org.id} RETURNING "proformaNext" - 1 AS "next"`;
    const digits = formatNumber(BigInt(allocated[0]!.next));
    const built = buildEInvoice(
      { ...request, typeCode: '380', number: digits, seller: sellerOf(org) },
      {
        profile: settings.profile,
        issueDeadlineDays: settings.deadlineDays,
        requireBankAccount: settings.requireBankAccount,
        signature: settings.signature || undefined,
      },
    );
    // Грешка → rollback: броячът се връща, номерата на проформите остават без пропуски.
    if (!built.ok) throw new IssueRejected(built.issues);
    const t = built.calc.totals;
    const number = `${PROFORMA_PREFIX}${digits}`;
    const proforma = await tx.proforma.create({
      data: {
        organizationId: org.id,
        number,
        issueDate: new Date(`${built.input.issueDate}T00:00:00Z`),
        validUntil: built.input.dueDate ? new Date(`${built.input.dueDate}T00:00:00Z`) : null,
        currency: built.input.currency,
        input: built.input as unknown as Prisma.InputJsonValue,
        buyerName: built.input.buyer.name,
        buyerEik: built.input.buyer.legalId ?? null,
        buyerEmail: built.input.buyer.contact?.email ?? null,
        taxExclusiveCents: toCents(t.taxExclusive),
        vatCents: toCents(t.vat),
        payableCents: toCents(t.payable),
        pdfLanguage,
        createdById: actorId,
        firmId: access.viaFirmId,
      },
      select: { id: true },
    });
    await audit(tx, {
      actorId,
      organizationId: org.id,
      action: 'proforma.created',
      targetType: 'Proforma',
      targetId: proforma.id,
      details: { number, viaFirmId: access.viaFirmId },
    });
    return { id: proforma.id, number };
  });
}

/** Отказ: само отворена проформа; фактурираната остава свързана с фактурата си. */
export async function cancelProforma(
  access: OrgAccess,
  actorId: string,
  proformaId: string,
): Promise<void> {
  await prisma.$transaction(async (tx) => {
    await recheckAccess(tx, access, actorId);
    const done = await tx.proforma.updateMany({
      where: { id: proformaId, organizationId: access.organizationId, status: 'OPEN' },
      data: { status: 'CANCELLED', cancelledAt: new Date() },
    });
    if (done.count !== 1) throw new ProformaError('notOpen');
    await audit(tx, {
      actorId,
      organizationId: access.organizationId,
      action: 'proforma.cancelled',
      targetType: 'Proforma',
      targetId: proformaId,
    });
  });
}

/**
 * Изпращане по имейл до получателя (писмо извън Фактурист — таванът на фирмата за 24 ч важи). Писмото
 * е в опашката (`proforma.sent`), отговорът отива на имейла на фирмата.
 */
export async function sendProforma(
  access: OrgAccess,
  actorId: string,
  proformaId: string,
  toEmail: string,
): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const orgs = await tx.$queryRaw<Array<{ id: string }>>`
      SELECT "id" FROM "Organization" WHERE "id" = ${access.organizationId} FOR UPDATE`;
    if (orgs.length !== 1) throw new ProformaError('notFound');
    await recheckAccess(tx, access, actorId);
    const proforma = await tx.proforma.findFirst({
      where: { id: proformaId, organizationId: access.organizationId, status: 'OPEN' },
      select: { id: true, number: true },
    });
    if (!proforma) throw new ProformaError('notOpen');
    if (!(await externalMailAllowed(tx, access.organizationId))) {
      throw new ProformaError('mailLimit');
    }
    await tx.notification.create({
      data: {
        organizationId: access.organizationId,
        kind: 'proforma.sent',
        toEmail,
        payload: { proformaId: proforma.id },
      },
    });
    await tx.proforma.update({ where: { id: proforma.id }, data: { sentAt: new Date() } });
    await audit(tx, {
      actorId,
      organizationId: access.organizationId,
      action: 'proforma.sent',
      targetType: 'Proforma',
      targetId: proforma.id,
      details: { number: proforma.number },
    });
  });
}
