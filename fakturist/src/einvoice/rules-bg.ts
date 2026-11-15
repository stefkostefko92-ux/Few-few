import { cmp, dec } from './decimal.js';
import { NOTE_TYPES, type VatCategory } from './codes.js';
import { isValidBgVat, isValidEik } from './bg-ids.js';
import type { InvoiceInput, PartyInput } from './model.js';
import type { RuleOptions, Severity } from './rules.js';

/** Правилата по ЗДДС (BG-01…BG-10) — частта от `validateDocument` за България. */
type Fail = (rule: string, path: string, bg: string, en: string, severity?: Severity) => void;

/** Фиксираният курс на лева (ЗВЕРБ, чл. 5) като „лева за 1 евро“ — посоката на `eurExchangeRate`. */
export const BGN_PER_EUR = '1.95583';

const DAY_MS = 86_400_000;

function days(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS);
}

/** 15-о число на месеца след датата (ГГГГ-ММ-ДД). */
export function fifteenthOfNextMonth(date: string): string {
  const [year, month] = date.split('-').map(Number) as [number, number];
  const next = new Date(Date.UTC(year, month, 15));
  return next.toISOString().slice(0, 10);
}

export function validateBg(
  input: InvoiceInput,
  categories: Set<VatCategory>,
  exemption: (category: VatCategory) => InvoiceInput['vatExemptions'][number] | undefined,
  options: RuleOptions,
  fail: Fail,
): void {
  if (!/^\d{10}$/.test(input.number)) {
    fail(
      'BG-01',
      'number',
      'Номерът на документа е десетразряден, само с арабски цифри (чл. 114, ал. 1, т. 2 ЗДДС).',
      'The document number has ten Arabic digits (Art. 114(1)(2) of the Bulgarian VAT Act).',
    );
  }
  checkBgParty('seller', input.seller, true, fail);
  checkBgParty('buyer', input.buyer, false, fail);
  if (input.buyer.address.countryCode === 'BG' && !input.buyer.legalId && !input.buyer.vatId) {
    fail(
      'BG-10',
      'buyer.legalId',
      'Получателят се посочва с ЕИК или ДДС номер (чл. 114, ал. 1, т. 8 ЗДДС) — освен физическо лице, което не е търговец.',
      'The customer is identified by EIK or VAT number (Art. 114(1)(8) of the VAT Act) — except a private individual.',
      'warning',
    );
  }

  if (input.currency !== 'EUR' && !input.eurExchangeRate) {
    fail(
      'BG-05',
      'eurExchangeRate',
      'При фактура в друга валута основата и ДДС се посочват и в евро — нужен е курсът на ЕЦБ (чл. 114, ал. 5 и чл. 26, ал. 6 ЗДДС).',
      'For an invoice in another currency the base and VAT are also stated in euro — the ECB rate is required (Art. 114(5) and 26(6) of the VAT Act).',
    );
  }
  if (input.currency === 'BGN' && input.eurExchangeRate !== undefined) {
    // Левът е с фиксиран курс (ЗВЕРБ, чл. 5): 1 евро = 1,95583 лева — не курс на ЕЦБ за деня.
    if (cmp(dec(input.eurExchangeRate), dec(BGN_PER_EUR)) !== 0) {
      fail(
        'BG-05',
        'eurExchangeRate',
        `Курсът на лева е фиксиран: ${BGN_PER_EUR} лв. за 1 евро (ЗВЕРБ, чл. 5).`,
        `The lev rate is fixed: ${BGN_PER_EUR} BGN per euro (Euro Adoption Act, Art. 5).`,
      );
    }
  }
  if (input.eurExchangeRate !== undefined && cmp(dec(input.eurExchangeRate), dec('0')) <= 0) {
    fail(
      'BG-05',
      'eurExchangeRate',
      'Курсът трябва да е над 0.',
      'The exchange rate must be greater than 0.',
    );
  }

  if (NOTE_TYPES.includes(input.typeCode) && input.precedingInvoices.length === 0) {
    fail(
      'BG-06',
      'precedingInvoices',
      'Известието съдържа номера и датата на фактурата, към която е издадено (чл. 115 ЗДДС).',
      'A note must reference the number and date of the invoice it corrects (Art. 115 of the VAT Act).',
    );
  }

  for (const category of ['Z', 'E', 'AE', 'K', 'G', 'O'] as const) {
    if (!categories.has(category)) continue;
    const entry = exemption(category);
    if (!entry?.reason) {
      fail(
        'BG-07',
        'vatExemptions',
        'При нулева ставка или неначисляване се посочва основанието като текст (чл. 114, ал. 1, т. 12 ЗДДС).',
        'With a zero rate or no VAT charged, the legal basis must be stated as text (Art. 114(1)(12) of the VAT Act).',
      );
    } else if (category === 'AE' && !/обратно начисляване/i.test(entry.reason)) {
      // Чл. 114, ал. 4 ЗДДС иска текста на български; „Reverse charge“ (Дир. 2006/112, чл. 226, т. 11а)
      // може да е до него, не вместо него (Данъчника, 13.11.2026).
      fail(
        'BG-07',
        'vatExemptions',
        'При обратно начисляване се посочва текстът „обратно начисляване“ (чл. 114, ал. 4 ЗДДС).',
        'Reverse charge must state the words “обратно начисляване” (Art. 114(4) of the VAT Act).',
      );
    }
  }

  if (input.taxPointDate && categories.has('K')) {
    // Вътреобщностна доставка: до 15-о число на месеца след данъчното събитие (чл. 113, ал. 5 ЗДДС).
    const deadline = fifteenthOfNextMonth(input.taxPointDate);
    if (input.issueDate > deadline) {
      fail(
        'BG-08',
        'issueDate',
        `При вътреобщностна доставка документът се издава до ${deadline} (15-о число на следващия месец — чл. 113, ал. 5 ЗДДС).`,
        `For an intra-Community supply the document is issued by ${deadline} (the 15th of the following month — Art. 113(5) of the VAT Act).`,
        'warning',
      );
    }
  } else if (input.taxPointDate) {
    const late = days(input.taxPointDate, input.issueDate);
    if (late > options.issueDeadlineDays) {
      fail(
        'BG-08',
        'issueDate',
        `Документът е издаден ${late} дни след данъчното събитие; срокът е ${options.issueDeadlineDays} дни (чл. 113, ал. 4 ЗДДС).`,
        `The document is issued ${late} days after the tax point; the deadline is ${options.issueDeadlineDays} days (Art. 113(4) of the VAT Act).`,
        'warning',
      );
    }
  }

  if (options.requireBankAccount && !input.payment?.accountId) {
    fail(
      'BG-09',
      'payment.accountId',
      'Сметката на доставчика е задължителен реквизит (чл. 114, ал. 1, т. 16 по законопроекта за 2028 г.).',
      'The supplier bank account is a required field (Art. 114(1)(16) under the 2028 bill).',
    );
  }
}

function checkBgParty(
  role: 'seller' | 'buyer',
  party: PartyInput,
  isSeller: boolean,
  fail: Fail,
): void {
  if (party.address.countryCode !== 'BG') return;
  if (party.legalId !== undefined && !isValidEik(party.legalId)) {
    fail(
      isSeller ? 'BG-02' : 'BG-03',
      `${role}.legalId`,
      'ЕИК/БУЛСТАТ е невалиден (9 или 13 цифри с вярна контролна цифра).',
      'The EIK/BULSTAT is invalid (9 or 13 digits with a correct check digit).',
    );
  }
  if (party.vatId !== undefined && party.vatId.startsWith('BG') && !isValidBgVat(party.vatId)) {
    fail(
      'BG-04',
      `${role}.vatId`,
      'Българският ДДС номер е „BG“ + ЕИК (9 цифри) или + 10 цифри.',
      'A Bulgarian VAT number is “BG” + the EIK (9 digits) or + 10 digits.',
    );
  }
  if (isSeller && !party.legalId && !party.vatId) {
    fail(
      'BG-02',
      `${role}.legalId`,
      'Доставчикът се посочва с ЕИК или ДДС номер (чл. 114, ал. 1, т. 5 ЗДДС).',
      'The supplier must be identified by EIK or VAT number (Art. 114(1)(5) of the VAT Act).',
    );
  }
}
