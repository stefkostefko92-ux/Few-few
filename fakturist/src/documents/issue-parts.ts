import type { Prisma } from '@prisma/client';
import type { InvoiceInput, Issue } from '../einvoice/index.js';
import { EAS_BG_VAT, NOTE_TYPES } from '../einvoice/codes.js';

/** Общото на издаването: грешките, доставчикът от данните на фирмата, кои видове се издават. */
export class IssueRejected extends Error {
  constructor(readonly issues: Issue[]) {
    super('Документът не минава проверките');
  }
}

export const PEPPOL_NO_RECEIVER: Issue = {
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
 * Видовете, които български доставчик издава оттук. 384 („коригираща фактура“) няма в ЗДДС — грешка се
 * поправя с известие (чл. 115) или с анулиране и нов документ (чл. 116); иначе ДДС се начислява втори
 * път. 389 („самофактура“) се издава от получателя от името на доставчика (чл. 113, ал. 11) — тук
 * издателят е самият доставчик. Ядрото продължава да ги чете във входящите е-фактури.
 */
export const ISSUABLE_TYPES = ['380', '381', '383', '386'] as const;

export function notIssuable(typeCode: string): Issue | null {
  if ((ISSUABLE_TYPES as readonly string[]).includes(typeCode)) return null;
  return {
    rule: 'BG-TYPE',
    severity: 'fatal',
    path: 'typeCode',
    message: {
      bg: 'Този вид документ не се издава по ЗДДС: поправката е с кредитно или дебитно известие (чл. 115) или с анулиране и нов документ (чл. 116).',
      en: 'This document type is not issued under the Bulgarian VAT Act: corrections use a credit or debit note (Art. 115) or cancellation and a new document (Art. 116).',
    },
  };
}

/** Номерът на основния документ, както е въведен: само цифри до 10 → десетразряден (чл. 114, ал. 1, т. 2). */
export function normalizePreceding<T extends { number: string }>(ref: T): T {
  return /^\d{1,10}$/.test(ref.number) ? { ...ref, number: ref.number.padStart(10, '0') } : ref;
}

/** Видовете, към които се издава известие: фактура и авансова фактура (и старите 384). */
const NOTE_TARGETS = ['380', '386', '384'];

/**
 * Известие (чл. 115 ЗДДС): посоченият номер, ако е на документ на фирмата, трябва да е издадена (неанулирана)
 * фактура — иначе отказ (известие към анулирана фактура, или номер на друго известие). Номер, който не е
 * на фирмата, е фактура от предишна програма — минава с предупреждение. Връща документа за връзката
 * (първия посочен) и предупрежденията.
 */
export async function precedingDocument(
  tx: Prisma.TransactionClient,
  organizationId: string,
  input: Pick<InvoiceInput, 'typeCode' | 'precedingInvoices'>,
): Promise<{ linked: { id: string } | null; warnings: Issue[] }> {
  const isNote = (NOTE_TYPES as readonly string[]).includes(input.typeCode);
  const warnings: Issue[] = [];
  let linked: { id: string } | null = null;
  for (const [index, ref] of input.precedingInvoices.entries()) {
    const own = await tx.document.findFirst({
      where: { organizationId, number: ref.number },
      select: { id: true, status: true, typeCode: true },
    });
    const path = `precedingInvoices.${index}.number`;
    if (isNote && own && (own.status !== 'ISSUED' || !NOTE_TARGETS.includes(own.typeCode))) {
      throw new IssueRejected([
        {
          rule: 'BG-06',
          severity: 'fatal',
          path,
          message: {
            bg: 'Документът с този номер е анулиран или не е фактура — известието се издава към издадена фактура (чл. 115 ЗДДС).',
            en: 'The document with this number is cancelled or is not an invoice — a note refers to an issued invoice (Art. 115 VAT Act).',
          },
        },
      ]);
    }
    if (isNote && !own) {
      warnings.push({
        rule: 'BG-06',
        severity: 'warning',
        path,
        message: {
          bg: 'Във Фактурист няма фактура с този номер — ако е от предишната ви програма, всичко е наред; иначе проверете номера.',
          en: 'Fakturist has no invoice with this number — fine if it is from your previous software; otherwise check the number.',
        },
      });
    }
    if (index === 0 && own) linked = { id: own.id };
  }
  return { linked, warnings };
}

/**
 * Кредитно и дебитно известие посочват основанието за издаването си (чл. 115, ал. 4, т. 2 ЗДДС) — в
 * бележката (BT-22); формата го пише като „Основание за известието: …“, API-то — в `notes`.
 */
export function noteWithoutReason(input: Pick<InvoiceInput, 'typeCode' | 'notes'>): Issue | null {
  if (input.typeCode !== '381' && input.typeCode !== '383') return null;
  if (input.notes.some((note) => note.trim().length > 0)) return null;
  return {
    rule: 'BG-NOTE',
    severity: 'fatal',
    path: 'preceding.reason',
    message: {
      bg: 'Посочете основанието за известието (чл. 115, ал. 4, т. 2 ЗДДС) — напр. „върната стока“ или „отстъпка след фактурата“.',
      en: 'State the reason for the note (Art. 115(4)(2) VAT Act) — e.g. “returned goods” or “discount after the invoice”.',
    },
  };
}
