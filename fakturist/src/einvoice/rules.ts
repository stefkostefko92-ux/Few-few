import { cmp, dec, isNegative, isZero } from './decimal.js';
import { CREDIT_TRANSFER_MEANS, type VatCategory } from './codes.js';
import { EU_VAT } from './bg-ids.js';
import { validateBg } from './rules-bg.js';
import type { Calculated } from './calculate.js';
import type { InvoiceInput, Profile } from './model.js';

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

  validateBg(input, categories, exemption, options, fail);

  return issues;
}

export function hasFatal(issues: readonly Issue[]): boolean {
  return issues.some((issue) => issue.severity === 'fatal');
}
