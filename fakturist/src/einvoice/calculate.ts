import {
  add,
  dec,
  divRound,
  mul,
  neg,
  percentOf,
  round,
  sub,
  sum,
  ZERO,
  type Dec,
} from './decimal.js';
import { ZERO_VAT_CATEGORIES, type VatCategory } from './codes.js';
import type { AllowanceChargeInput, InvoiceInput } from './model.js';

/** Изчислената отстъпка/надбавка — винаги със сума (BT-92/BT-99/BT-136/BT-141). */
export interface CalculatedAllowanceCharge {
  isCharge: boolean;
  amount: Dec;
  baseAmount: Dec | null;
  percent: Dec | null;
  reason: string | undefined;
  reasonCode: string | undefined;
}

export interface CalculatedLine {
  index: number;
  /** qty × цена / базово количество, закръглено до центове — преди отстъпките на реда. */
  grossNet: Dec;
  allowanceCharges: CalculatedAllowanceCharge[];
  /** BT-131 */
  net: Dec;
  category: VatCategory;
  rate: Dec | null;
}

export interface VatBreakdown {
  /** BT-118 */
  category: VatCategory;
  /** BT-119; null за „O“ */
  rate: Dec | null;
  /** BT-116 */
  taxable: Dec;
  /** BT-117 */
  vat: Dec;
  /** BT-120 / BT-121 */
  exemptionReason: string | undefined;
  exemptionCode: string | undefined;
  /** В евро (чл. 114, ал. 5 ЗДДС) — само при фактура в друга валута. */
  taxableEur: Dec | null;
  vatEur: Dec | null;
}

export interface CalculatedDocumentAllowanceCharge extends CalculatedAllowanceCharge {
  category: VatCategory;
  rate: Dec | null;
}

export interface Totals {
  /** BT-106 */
  lineExtension: Dec;
  /** BT-107 */
  allowances: Dec;
  /** BT-108 */
  charges: Dec;
  /** BT-109 */
  taxExclusive: Dec;
  /** BT-110 */
  vat: Dec;
  /** BT-111 — ДДС във валутата за отчитане (евро), когато фактурата е в друга валута */
  vatInEur: Dec | null;
  /** BT-112 */
  taxInclusive: Dec;
  /** BT-113 */
  prepaid: Dec;
  /** BT-114 */
  rounding: Dec;
  /** BT-115 */
  payable: Dec;
}

export interface Calculated {
  lines: CalculatedLine[];
  allowanceCharges: CalculatedDocumentAllowanceCharge[];
  breakdown: VatBreakdown[];
  totals: Totals;
  /** Валутата за отчитане на ДДС (BT-6) — 'EUR', когато фактурата е в друга валута. */
  vatCurrency: 'EUR' | null;
  hasDocumentAllowances: boolean;
  hasDocumentCharges: boolean;
}

/**
 * Сумата на отстъпка/надбавка: дадената сума, или процент × основа (закръглено до центове).
 * Основата по подразбиране е сумата, върху която се прилага (редът или сборът на редовете).
 */
function allowanceCharge(input: AllowanceChargeInput, defaultBase: Dec): CalculatedAllowanceCharge {
  const percent = input.percent !== undefined ? dec(input.percent) : null;
  const base =
    input.baseAmount !== undefined ? dec(input.baseAmount) : percent !== null ? defaultBase : null;
  let amount: Dec;
  if (input.amount !== undefined) amount = round(dec(input.amount), 2);
  else if (percent !== null && base !== null) amount = percentOf(base, percent);
  else amount = ZERO;
  return {
    isCharge: input.isCharge,
    amount: round(amount, 2),
    baseAmount: base !== null ? round(base, 2) : null,
    percent,
    reason: input.reason,
    reasonCode: input.reasonCode,
  };
}

function signed(item: CalculatedAllowanceCharge): Dec {
  return item.isCharge ? item.amount : neg(item.amount);
}

function rateOf(category: VatCategory, rate: string | undefined): Dec | null {
  if (category === 'O') return null;
  if (ZERO_VAT_CATEGORIES.includes(category)) return dec(rate ?? '0');
  return rate !== undefined ? dec(rate) : null;
}

function noReasonInBreakdown(category: VatCategory): boolean {
  return category === 'S' || category === 'Z';
}

function groupKey(category: VatCategory, rate: Dec | null): string {
  return `${category}|${rate ? round(rate, 2).v.toString() : '-'}`;
}

/**
 * Изчислява документа по правилата на EN 16931-1 (раздел 6.5 и правилата BR-CO-10…BR-CO-17):
 * нетна сума на ред = закръглено(количество × цена / базово количество) − отстъпки + надбавки;
 * разбивката по ДДС групира по категория и ставка; данъкът на групата = закръглено(основа × ставка / 100).
 * Закръгля се само крайната стойност на всяка сума („half up“ далеч от нулата).
 */
export function calculate(input: InvoiceInput): Calculated {
  const lines: CalculatedLine[] = input.lines.map((line, index) => {
    const baseQuantity =
      line.priceBaseQuantity !== undefined ? dec(line.priceBaseQuantity) : dec('1');
    const grossNet = divRound(mul(dec(line.quantity), dec(line.netPrice)), baseQuantity, 2);
    const items = line.allowanceCharges.map((item) => allowanceCharge(item, grossNet));
    const net = round(sum([grossNet, ...items.map(signed)]), 2);
    return {
      index,
      grossNet,
      allowanceCharges: items,
      net,
      category: line.vat.category,
      rate: rateOf(line.vat.category, line.vat.rate),
    };
  });

  const lineExtension = sum(lines.map((line) => line.net));
  const documentItems: CalculatedDocumentAllowanceCharge[] = input.allowanceCharges.map((item) => ({
    ...allowanceCharge(item, lineExtension),
    category: item.vat.category,
    rate: rateOf(item.vat.category, item.vat.rate),
  }));
  const allowances = sum(documentItems.filter((i) => !i.isCharge).map((i) => i.amount));
  const charges = sum(documentItems.filter((i) => i.isCharge).map((i) => i.amount));
  const taxExclusive = round(add(sub(lineExtension, allowances), charges), 2);

  const exchange =
    input.currency !== 'EUR' && input.eurExchangeRate !== undefined
      ? dec(input.eurExchangeRate)
      : null;

  const groups = new Map<string, { category: VatCategory; rate: Dec | null; taxable: Dec }>();
  const addToGroup = (category: VatCategory, rate: Dec | null, amount: Dec) => {
    const key = groupKey(category, rate);
    const group = groups.get(key) ?? { category, rate, taxable: ZERO };
    group.taxable = add(group.taxable, amount);
    groups.set(key, group);
  };
  for (const line of lines) addToGroup(line.category, line.rate, line.net);
  for (const item of documentItems) addToGroup(item.category, item.rate, signed(item));

  const breakdown: VatBreakdown[] = [...groups.values()].map((group) => {
    const taxable = round(group.taxable, 2);
    const vat =
      group.category === 'S' && group.rate !== null
        ? divRound(mul(taxable, group.rate), dec('100'), 2)
        : round(ZERO, 2);
    const exemption = input.vatExemptions.find((entry) => entry.category === group.category);
    return {
      category: group.category,
      rate: group.rate,
      taxable,
      vat,
      // EN 16931-1:2017 (BR-S-10, BR-Z-10) забранява основание при S и Z; основанието за нулева ставка
      // по ЗДДС отива в бележка към документа (src/einvoice/notes.ts).
      exemptionReason: noReasonInBreakdown(group.category) ? undefined : exemption?.reason,
      exemptionCode: noReasonInBreakdown(group.category) ? undefined : exemption?.reasonCode,
      taxableEur: exchange ? divRound(taxable, exchange, 2) : null,
      vatEur: exchange ? divRound(vat, exchange, 2) : null,
    };
  });

  const vat = round(sum(breakdown.map((group) => group.vat)), 2);
  // BT-111 = сборът на закръглените по групи суми в евро — документът е вътрешно съгласуван.
  const vatInEur = exchange ? round(sum(breakdown.map((group) => group.vatEur ?? ZERO)), 2) : null;
  const taxInclusive = round(add(taxExclusive, vat), 2);
  const prepaid = round(input.prepaidAmount !== undefined ? dec(input.prepaidAmount) : ZERO, 2);
  const rounding = round(input.roundingAmount !== undefined ? dec(input.roundingAmount) : ZERO, 2);
  const payable = round(add(sub(taxInclusive, prepaid), rounding), 2);

  return {
    lines,
    allowanceCharges: documentItems,
    breakdown,
    totals: {
      lineExtension: round(lineExtension, 2),
      allowances: round(allowances, 2),
      charges: round(charges, 2),
      taxExclusive,
      vat,
      vatInEur,
      taxInclusive,
      prepaid,
      rounding,
      payable,
    },
    vatCurrency: input.currency !== 'EUR' ? 'EUR' : null,
    hasDocumentAllowances: documentItems.some((item) => !item.isCharge),
    hasDocumentCharges: documentItems.some((item) => item.isCharge),
  };
}
