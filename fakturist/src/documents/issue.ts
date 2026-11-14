import { z } from 'zod';
import type { Prisma } from '@prisma/client';
import { prisma } from '../db.js';
import { audit } from '../audit.js';
import { annulInTx, type AnnulReason } from './annul.js';
import { sealHmac } from '../auth/keys.js';
import { setting } from '../admin/settings.js';
import { buildEInvoice, InvoiceInputSchema, type Issue } from '../einvoice/index.js';
import { toCents } from '../einvoice/decimal.js';
import { entryHash, GENESIS, inputHash, sha256 } from '../ledger/chain.js';
import { formatNumber } from './numbering.js';
import { deliverToInbox, type Delivery } from '../inbox/deliver.js';
import type { OrgAccess } from '../auth/guards.js';
import { recheckAccess } from './recheck.js';
import type { PdfLanguage } from './pdf-labels.js';
import { linkProformaInvoice } from '../proforma/link.js';
import { partyIdFromAddress } from '../peppol/ids.js';
import { queueTransmission } from '../peppol/transmissions.js';
import {
  IssueRejected,
  normalizePreceding,
  notIssuable,
  noteWithoutReason,
  precedingDocument,
  PEPPOL_NO_RECEIVER,
  SeriesExhausted,
  sellerOf,
} from './issue-parts.js';
import { ID } from '../ids.js';

/**
 * Това, което издаващият подава: всичко без номера и без доставчика. Доставчикът идва от данните на
 * фирмата в базата (никога от формата), номерът — от серията в транзакцията.
 */
export const IssueRequestSchema = InvoiceInputSchema.omit({ number: true, seller: true }).extend({
  seriesId: z.string().regex(ID),
});
export type IssueRequest = z.infer<typeof IssueRequestSchema>;

/** „Анулирай и издай нов“ (SPEC 47) и издаване от повтаряща се фактура за даден период (SPEC 51). */
export interface IssueOptions {
  replaces?: { documentId: string; reason: AnnulReason };
  recurring?: { id: string; period: string };
  /** Езикът на PDF копието (src/documents/pdf-labels.ts) — по подразбиране български. */
  pdfLanguage?: PdfLanguage;
  /** „Издай фактура“ от проформа: проформата става INVOICED в същата транзакция (src/proforma/link.ts). */
  fromProforma?: string;
  /**
   * „Изпрати през Peppol“ (SPEC 58): документът се издава в профил Peppol BIS 3 (изисква електронните
   * адреси) и предаването се записва в същата транзакция — без активна регистрация на фирмата е отказ.
   */
  peppol?: boolean;
  /**
   * Получателят е известен със сигурност (фактурата за плана — до фирмата, която е поръчала и платила):
   * шкафчето доставя до нея и когато още не е потвърдена от мастъра.
   */
  knownRecipientOrgId?: string;
  /** Еднократният ключ на формата (src/documents/submission.ts) — записва се в транзакцията. */
  submission?: { userId: string; token: string };
}

export { IssueRejected, SeriesExhausted, sellerOf };

/**
 * Издава документ в една транзакция:
 * 1. заключва фирмата (веригата е по фирма — един издаващ наведнъж);
 * 2. взема следващия номер от серията (UPDATE … RETURNING — rollback го връща, пропуск няма);
 * 3. строи е-фактурата през ядрото (EN 16931 + ЗДДС); с фатална грешка — rollback;
 * 4. добавя звено във веригата (отпечатък + печат) и записва документа и одита.
 */
export interface IssueSettings {
  deadlineDays: number;
  requireBankAccount: boolean;
  profile: 'en16931' | 'peppol';
  signature: string;
}

/** Настройките на издаването от мастър панела — четат се преди транзакцията. */
export async function issueSettings(): Promise<IssueSettings> {
  const [deadlineDays, requireBankAccount, profile, signature] = await Promise.all([
    setting('issue.deadlineDays'),
    setting('issue.requireBankAccount'),
    setting('issue.profile'),
    setting('documents.signature'),
  ]);
  return { deadlineDays, requireBankAccount, profile, signature };
}

export type IssueResult = {
  id: string;
  number: string;
  warnings: Issue[];
  delivery: Delivery | null;
};

export async function issueDocument(
  access: OrgAccess,
  actorId: string,
  request: IssueRequest,
  /** Анулиране по чл. 116 ЗДДС: новият документ заменя `documentId` в същата транзакция. */
  options: IssueOptions = {},
): Promise<IssueResult> {
  const settings = await issueSettings();
  return prisma.$transaction((tx) => issueInTx(tx, access, actorId, request, options, settings));
}

/**
 * Издаването в транзакция на извикващия (плащането на план издава фактурата си в транзакцията на
 * активирането — SPEC 50). Заключва фирмата-доставчик; всичко се връща при грешка.
 */
export async function issueInTx(
  tx: Prisma.TransactionClient,
  access: OrgAccess,
  actorId: string,
  request: IssueRequest,
  options: IssueOptions,
  settings: IssueSettings,
): Promise<IssueResult> {
  const { deadlineDays, requireBankAccount, signature } = settings;
  const profile = options.peppol ? 'peppol' : settings.profile;
  const orgs = await tx.$queryRaw<Array<{ id: string }>>`
      SELECT "id" FROM "Organization" WHERE "id" = ${access.organizationId} FOR UPDATE`;
  if (orgs.length !== 1) throw new Error('Фирмата не съществува');
  await recheckAccess(tx, access, actorId);
  const org = await tx.organization.findUniqueOrThrow({ where: { id: access.organizationId } });

  const allocated = await tx.$queryRaw<Array<{ number: bigint }>>`
      UPDATE "DocumentSeries" SET "nextNumber" = "nextNumber" + 1
      WHERE "id" = ${request.seriesId} AND "organizationId" = ${org.id} AND "nextNumber" <= "rangeEnd"
      RETURNING "nextNumber" - 1 AS "number"`;
  const raw = allocated[0]?.number;
  if (raw === undefined) throw new SeriesExhausted();
  const number = formatNumber(BigInt(raw));

  const { seriesId: _series, ...rest } = request;
  // „5“ и „0000000005“ са един и същ номер — в XML-а и във връзката отива десетразрядният.
  const precedingInvoices = rest.precedingInvoices.map(normalizePreceding);
  // Датата на данъчното събитие е реквизит (чл. 114, ал. 1, т. 10): без нея — датата на издаване, и
  // в XML-а (BT-7), за да не се разминава с PDF-а.
  const taxPointDate = rest.taxPointDate ?? rest.issueDate;
  const built = buildEInvoice(
    { ...rest, taxPointDate, precedingInvoices, number, seller: sellerOf(org) },
    {
      profile,
      issueDeadlineDays: deadlineDays,
      requireBankAccount,
      signature: signature || undefined,
    },
  );
  if (!built.ok) throw new IssueRejected(built.issues);
  const wrongType = notIssuable(rest.typeCode) ?? noteWithoutReason(rest);
  if (wrongType) throw new IssueRejected([wrongType]);

  const last = await tx.document.findFirst({
    where: { organizationId: org.id, chainIndex: { not: null } },
    orderBy: { chainIndex: 'desc' },
    select: { chainIndex: true, sha256: true },
  });
  const chainIndex = (last?.chainIndex ?? 0n) + 1n;
  const prevHash = last?.sha256 ?? GENESIS;
  const t = built.calc.totals;
  const content = {
    organizationId: org.id,
    chainIndex,
    number,
    typeCode: built.input.typeCode,
    status: 'ISSUED' as const,
    issueDate: built.input.issueDate,
    payableCents: toCents(t.payable),
    vatCents: toCents(t.vat),
    ublSha256: sha256(built.ubl),
    ciiSha256: sha256(built.cii),
    prevHash,
    inputSha256: inputHash(built.input),
  };
  const hash = entryHash(content);

  const { linked: preceding, warnings: precedingWarnings } = await precedingDocument(
    tx,
    org.id,
    built.input,
  );

  const document = await tx.document.create({
    data: {
      organizationId: org.id,
      seriesId: request.seriesId,
      status: 'ISSUED',
      typeCode: built.input.typeCode,
      number,
      issueDate: new Date(`${built.input.issueDate}T00:00:00Z`),
      taxPointDate: built.input.taxPointDate
        ? new Date(`${built.input.taxPointDate}T00:00:00Z`)
        : null,
      dueDate: built.input.dueDate ? new Date(`${built.input.dueDate}T00:00:00Z`) : null,
      currency: built.input.currency,
      input: built.input as unknown as Prisma.InputJsonValue,
      inputSha256: content.inputSha256,
      buyerName: built.input.buyer.name,
      buyerEik: built.input.buyer.legalId ?? null,
      lineExtensionCents: toCents(t.lineExtension),
      taxExclusiveCents: toCents(t.taxExclusive),
      vatCents: toCents(t.vat),
      taxInclusiveCents: toCents(t.taxInclusive),
      payableCents: toCents(t.payable),
      vatEurCents: t.vatInEur ? toCents(t.vatInEur) : null,
      ublXml: built.ubl,
      ciiXml: built.cii,
      chainIndex,
      sha256: hash,
      prevHash,
      seal: sealHmac(hash),
      issuedById: actorId,
      firmId: access.viaFirmId,
      mandateId: access.mandateId,
      precedingId: preceding?.id ?? null,
      recurringId: options.recurring?.id ?? null,
      recurringPeriod: options.recurring?.period ?? null,
      pdfLanguage: options.pdfLanguage ?? 'bg',
      issuedAt: new Date(),
    },
    select: { id: true },
  });
  if (options.submission) {
    await tx.issueSubmission.create({
      data: { organizationId: org.id, documentId: document.id, ...options.submission },
    });
  }
  await audit(tx, {
    actorId,
    organizationId: org.id,
    action: 'document.issued',
    targetType: 'Document',
    targetId: document.id,
    details: {
      number,
      typeCode: built.input.typeCode,
      viaFirmId: access.viaFirmId,
      mandateId: access.mandateId,
    },
  });
  // Отчитането към НАП (SPEC 63; чл. 120д от законопроекта): записът е тук, изпращане — след API-то.
  await tx.nraReport.create({
    data: {
      organizationId: org.id,
      documentId: document.id,
      typeCode: built.input.typeCode,
      ublSha256: content.ublSha256,
    },
  });
  if (options.peppol) {
    const receiverPartyId = partyIdFromAddress(built.input.buyer.electronicAddress);
    if (!receiverPartyId) throw new IssueRejected([PEPPOL_NO_RECEIVER]);
    await queueTransmission(tx, {
      organizationId: org.id,
      documentId: document.id,
      receiverPartyId,
      actorId,
    });
  }
  if (options.fromProforma) {
    await linkProformaInvoice(tx, {
      organizationId: org.id,
      proformaId: options.fromProforma,
      documentId: document.id,
      typeCode: built.input.typeCode,
      actorId,
    });
  }
  if (options.replaces) {
    await annulInTx(tx, {
      organizationId: org.id,
      oldId: options.replaces.documentId,
      newId: document.id,
      newTypeCode: built.input.typeCode,
      reason: options.replaces.reason,
      actorId,
    });
  }
  // Шкафчето: получател, регистриран във Фактурист (по ЕИК), получава документа и писмо (опашката).
  const delivery = await deliverToInbox(tx, {
    documentId: document.id,
    senderOrgId: org.id,
    actorId,
    buyer: built.input.buyer,
    ...(options.knownRecipientOrgId ? { knownRecipientOrgId: options.knownRecipientOrgId } : {}),
  });
  return {
    id: document.id,
    number,
    warnings: [
      ...built.issues.filter((issue) => issue.severity === 'warning'),
      ...precedingWarnings,
    ],
    delivery,
  };
}
