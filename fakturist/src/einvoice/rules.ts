import { cmp, dec, isNegative, isZero } from './decimal.js';
import { CREDIT_TRANSFER_MEANS, NOTE_TYPES, type VatCategory } from './codes.js';
import { EU_VAT, isValidBgVat, isValidEik } from './bg-ids.js';
import type { Calculated } from './calculate.js';
import type { InvoiceInput, PartyInput, Profile } from './model.js';

export type Severity = 'fatal' | 'warning';

export interface Issue {
  /** Кодът на правилото: BR-… / PEPPOL-… от стандарта или BG-… — нашите по ЗДДС. */
  rule: string;
  severity: Severity;
  /** Пътят в модела (`seller.vatId`, `lines.2.netPrice`). */
  path: string;
  message: { bg: string; en: string };
}

export interface RuleOptions {
  profile: Profile;
  /** Срокът за издаване след данъчното събитие (чл. 113, ал. 4 ЗДДС: 5 дни; законопроектът — 10). */
  issueDeadlineDays: number;
  /** Сметката като реквизит (т. 16 на чл. 114, ал. 1 по законопроекта) — включва се от мастър панела. */
  requireBankAccount: boolean;
}

export const DEFAULT_RULE_OPTIONS: RuleOptions = {
  profile: 'en16931',
  issueDeadlineDays: 5,
  requireBankAccount: false,
};

const DAY_MS = 86_400_000;

function days(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS);
}

/**
 * Проверява документа срещу правилата на EN 16931 (подмножеството, което ядрото може да наруши — пълната
 * проверка е официалният Schematron в scripts/conformance/), профила Peppol BIS 3 и ЗДДС.
 * Фатална грешка спира издаването; предупреждението се показва, но не спира.
 */
export function validateDocument(
  input: InvoiceInput,
  calc: Calculated,
  options: RuleOptions = DEFAULT_RULE_OPTIONS,
): Issue[] {
  const issues: Issue[] = [];
  const fail = (rule: string, path: string, bg: string, en: string, severity: Severity = 'fatal') =>
    issues.push({ rule, severity, path, message: { bg, en } });

  const categories = new Set<VatCategory>(calc.breakdown.map((group) => group.category));
  const sellerVat = input.seller.vatId;
  const buyerVat = input.buyer.vatId;
  const exemption = (category: VatCategory) =>
    input.vatExemptions.find((entry) => entry.category === category);

  // --- EN 16931: цени, идентификатори, плащане -----------------------------------------------------
  input.lines.forEach((line, index) => {
    if (isNegative(dec(line.netPrice))) {
      fail(
        'BR-27',
        `lines.${index}.netPrice`,
        'Единичната цена не може да е отрицателна — намалението се прави с количество или отстъпка.',
        'The item net price must not be negative — use quantity or an allowance instead.',
      );
    }
    if (
      line.vat.category === 'S' &&
      (line.vat.rate === undefined || cmp(dec(line.vat.rate), dec('0')) <= 0)
    ) {
      fail(
        'BR-S-05',
        `lines.${index}.vat.rate`,
        'При стандартна категория ставката на ДДС трябва да е над 0.',
        'For standard rated lines the VAT rate must be greater than 0.',
      );
    }
    if (
      ['Z', 'E', 'AE', 'K', 'G'].includes(line.vat.category) &&
      line.vat.rate !== undefined &&
      !isZero(dec(line.vat.rate))
    ) {
      fail(
        `BR-${line.vat.category === 'K' ? 'IC' : line.vat.category}-05`,
        `lines.${index}.vat.rate`,
        'При тази категория ставката на ДДС е 0.',
        'The VAT rate for this category must be 0.',
      );
    }
  });

  for (const [role, party] of [
    ['seller', input.seller],
    ['buyer', input.buyer],
  ] as const) {
    if (party.vatId !== undefined && !EU_VAT.test(party.vatId)) {
      fail(
        'BR-CO-9',
        `${role}.vatId`,
        'ДДС номерът трябва да започва с кода на държавата (напр. BG123456789).',
        'The VAT identifier must start with the country prefix (e.g. BG123456789).',
      );
    }
  }

  if (cmp(calc.totals.payable, dec('0')) > 0 && !input.dueDate && !input.paymentTerms) {
    fail(
      'BR-CO-25',
      'dueDate',
      'При сума за плащане над нула е нужен падеж или условия за плащане.',
      'A positive amount due requires a due date or payment terms.',
    );
  }

  if (
    input.payment &&
    CREDIT_TRANSFER_MEANS.includes(input.payment.meansCode) &&
    !input.payment.accountId
  ) {
    fail(
      'BR-61',
      'payment.accountId',
      'При плащане по банков път е нужна сметка (IBAN).',
      'Payment by credit transfer requires the payment account (IBAN).',
    );
  }

  // --- EN 16931: категориите ДДС -------------------------------------------------------------------
  const needsSellerVat: VatCategory[] = ['S', 'Z', 'E', 'AE', 'K', 'G'];
  for (const category of categories) {
    if (needsSellerVat.includes(category) && !sellerVat) {
      fail(
        `BR-${category === 'K' ? 'IC' : category}-02`,
        'seller.vatId',
        category === 'S'
          ? 'Доставчик без ДДС номер не може да начислява ДДС (чл. 113, ал. 9 ЗДДС).'
          : 'При тази категория ДДС доставчикът трябва да има ДДС номер.',
        category === 'S'
          ? 'A seller without a VAT number cannot charge VAT (Art. 113(9) of the Bulgarian VAT Act).'
          : 'This VAT category requires the seller VAT identifier.',
      );
    }
  }
  if (categories.has('AE') && !buyerVat && !input.buyer.legalId) {
    fail(
      'BR-AE-02',
      'buyer.vatId',
      'При обратно начисляване е нужен ДДС номерът на получателя.',
      'Reverse charge requires the buyer VAT identifier.',
    );
  }
  if (categories.has('K')) {
    if (!buyerVat) {
      fail(
        'BR-IC-02',
        'buyer.vatId',
        'При вътреобщностна доставка е нужен ДДС номерът на получателя от другата държава членка.',
        'An intra-community supply requires the buyer VAT identifier.',
      );
    }
    if (!input.delivery?.date && !input.invoicingPeriod?.start) {
      fail(
        'BR-IC-11',
        'delivery.date',
        'При вътреобщностна доставка е нужна датата на доставката или периодът.',
        'An intra-community supply requires the actual delivery date or the invoicing period.',
      );
    }
    if (!input.delivery?.address?.countryCode) {
      fail(
        'BR-IC-12',
        'delivery.address.countryCode',
        'При вътреобщностна доставка е нужна държавата на доставката.',
        'An intra-community supply requires the deliver-to country.',
      );
    }
  }
  if (categories.has('O')) {
    if (categories.size > 1) {
      fail(
        'BR-O-11',
        'lines',
        'Документ с неподлежаща на ДДС доставка (категория O) не може да има редове с друга категория.',
        'A document with category O (not subject to VAT) cannot contain other VAT categories.',
      );
    }
    if (sellerVat) {
      fail(
        'BR-O-02',
        'seller.vatId',
        'При категория O (не подлежи на ДДС) ДДС номер на доставчика не се посочва.',
        'With category O the seller VAT identifier must not be present.',
      );
    }
  }
  for (const category of ['E', 'AE', 'K', 'G', 'O'] as const) {
    const entry = exemption(category);
    if (categories.has(category) && !entry?.reason && !entry?.reasonCode) {
      fail(
        `BR-${category === 'K' ? 'IC' : category}-10`,
        'vatExemptions',
        'Липсва основанието за неначисляване на ДДС за тази категория.',
        'The VAT exemption reason for this category is missing.',
      );
    }
  }

  // --- Peppol BIS Billing 3.0 ------------------------------------------------------------------------
  if (options.profile === 'peppol') {
    if (!input.buyerReference && !input.orderReference) {
      fail(
        'PEPPOL-EN16931-R003',
        'buyerReference',
        'В мрежата Peppol е нужна референция на купувача или номер на поръчката.',
        'Peppol requires a buyer reference or a purchase order reference.',
      );
    }
    if (!input.seller.electronicAddress) {
      fail(
        'PEPPOL-EN16931-R020',
        'seller.electronicAddress',
        'В мрежата Peppol е нужен електронният адрес на доставчика.',
        'Peppol requires the seller electronic address.',
      );
    }
    if (!input.buyer.electronicAddress) {
      fail(
        'PEPPOL-EN16931-R010',
        'buyer.electronicAddress',
        'В мрежата Peppol е нужен електронният адрес на получателя.',
        'Peppol requires the buyer electronic address.',
      );
    }
  }

  // --- ЗДДС (България) --------------------------------------------------------------------------------
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

  if (input.currency !== 'EUR' && !input.eurExchangeRate) {
    fail(
      'BG-05',
      'eurExchangeRate',
      'При фактура в друга валута основата и ДДС се посочват и в евро — нужен е курсът на ЕЦБ (чл. 114, ал. 5 и чл. 26, ал. 6 ЗДДС).',
      'For an invoice in another currency the base and VAT are also stated in euro — the ECB rate is required (Art. 114(5) and 26(6) of the VAT Act).',
    );
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

  if (input.taxPointDate) {
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

  return issues;
}

function checkBgParty(
  role: 'seller' | 'buyer',
  party: PartyInput,
  isSeller: boolean,
  fail: (rule: string, path: string, bg: string, en: string, severity?: Severity) => void,
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

export function hasFatal(issues: readonly Issue[]): boolean {
  return issues.some((issue) => issue.severity === 'fatal');
}
