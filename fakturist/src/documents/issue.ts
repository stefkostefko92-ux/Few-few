import { z } from 'zod';
import type { Prisma } from '@prisma/client';
import { prisma } from '../db.js';
import { audit } from '../audit.js';
import { annulInTx, type AnnulReason } from './annul.js';
import { sealHmac } from '../auth/keys.js';
import { setting } from '../admin/settings.js';
import {
  buildEInvoice,
  InvoiceInputSchema,
  type InvoiceInput,
  type Issue,
} from '../einvoice/index.js';
import { toCents } from '../einvoice/decimal.js';
import { EAS_BG_VAT } from '../einvoice/codes.js';
import { entryHash, GENESIS, sha256 } from '../ledger/chain.js';
import { formatNumber } from './numbering.js';
import { deliverToInbox, type Delivery } from '../inbox/deliver.js';
import type { OrgAccess } from '../auth/guards.js';
import { recheckAccess } from './recheck.js';
import type { PdfLanguage } from './pdf-labels.js';
import { linkProformaInvoice } from '../proforma/link.js';
import { partyIdFromAddress } from '../peppol/ids.js';
import { queueTransmission } from '../peppol/transmissions.js';

/**
 * Това, което издаващият подава: всичко без номера и без доставчика. Доставчикът идва от данните на
 * фирмата в базата (никога от формата), номерът — от серията в транзакцията.
 */
export const IssueRequestSchema = InvoiceInputSchema.omit({ number: true, seller: true }).extend({
  seriesId: z.string().regex(/^[a-z0-9]{20,40}$/),
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
}

export class IssueRejected extends Error {
  constructor(readonly issues: Issue[]) {
    super('Документът не минава проверките');
  }
}

const PEPPOL_NO_RECEIVER: Issue = {
  rule: 'PEPPOL-RECEIVER',
  severity: 'fatal',
  path: 'buyer.electronicAddress',
  message: {
    bg: 'За Peppol е нужен електронният адрес на получателя (напр. 9926 и ДДС номерът му).',
    en: 'Peppol needs the buyer electronic address (e.g. 9926 and their VAT number).',
  },
};

export class SeriesExhausted extends Error {
  constructor() {
    super('Серията е изчерпана');
  }
}

type Seller = InvoiceInput['seller'];

export function sellerOf(org: {
  legalName: string;
  eik: string | null;
  vatNumber: string | null;
  addressStreet: string;
  addressCity: string;
  postalCode: string;
  countryCode: string;
  email: string | null;
  eAddressScheme: string | null;
  eAddressValue: string | null;
}): Seller {
  return {
    name: org.legalName,
    legalId: org.eik ?? undefined,
    vatId: org.vatNumber ?? undefined,
    address: {
      street: org.addressStreet,
      city: org.addressCity,
      postalCode: org.postalCode,
      countryCode: org.countryCode,
    },
    electronicAddress:
      org.eAddressScheme && org.eAddressValue
        ? { scheme: org.eAddressScheme, value: org.eAddressValue }
        : org.vatNumber
          ? { scheme: EAS_BG_VAT, value: org.vatNumber }
          : undefined,
    contact: org.email ? { email: org.email } : undefined,
  };
}

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
  {
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
    const built = buildEInvoice(
      { ...rest, number, seller: sellerOf(org) },
      {
        profile,
        issueDeadlineDays: deadlineDays,
        requireBankAccount,
        signature: signature || undefined,
      },
    );
    if (!built.ok) throw new IssueRejected(built.issues);

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
    };
    const hash = entryHash(content);

    const preceding = built.input.precedingInvoices[0]
      ? await tx.document.findFirst({
          where: { organizationId: org.id, number: built.input.precedingInvoices[0].number },
          select: { id: true },
        })
      : null;

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
    });
    return {
      id: document.id,
      number,
      warnings: built.issues.filter((issue) => issue.severity === 'warning'),
      delivery,
    };
  }
}
