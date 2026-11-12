import { z } from 'zod';
import { isDecimalText } from './decimal.js';
import {
  DOCUMENT_TYPES,
  EAS,
  isCountry,
  isCurrency,
  PAYMENT_MEANS,
  UNIT_CODE,
  VAT_CATEGORIES,
  VATEX,
} from './codes.js';

/**
 * Входът на ядрото — семантичният модел на EN 16931-1 (бизнес термините BT-n и групите BG-n). Всички
 * числа идват като десетичен текст (никога float): количества и цени до 6 знака, сумите — до 2.
 * Изчислените суми (BT-106…BT-115, BG-23) НЕ са във входа — смята ги src/einvoice/calculate.ts.
 */
const decimalText = (max = 6) =>
  z
    .string()
    .trim()
    .refine(isDecimalText, 'Невалидно число')
    .refine((value) => (value.split('.')[1] ?? '').length <= max, `До ${max} знака след запетаята`);

const amountText = decimalText(2);
const nonEmpty = (max: number) => z.string().trim().min(1).max(max);
const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Дата във формат ГГГГ-ММ-ДД')
  .refine((value) => !Number.isNaN(Date.parse(`${value}T00:00:00Z`)), 'Невалидна дата');

const AddressSchema = z.object({
  /** BT-35, BT-50 */
  street: nonEmpty(200),
  /** BT-36, BT-51 */
  additionalStreet: z.string().trim().max(200).optional(),
  /** BT-37, BT-52 */
  city: nonEmpty(100),
  /** BT-38, BT-53 */
  postalCode: z.string().trim().max(20).optional(),
  /** BT-40, BT-55 — ISO 3166-1 alpha-2 */
  countryCode: z.string().refine(isCountry, 'Код на държава по ISO 3166-1'),
});

const ElectronicAddressSchema = z.object({
  scheme: z.string().regex(EAS, 'Схема по списъка EAS'),
  value: nonEmpty(200),
});

const PartySchema = z.object({
  /** BT-27, BT-44 */
  name: nonEmpty(200),
  /** BT-28, BT-45 */
  tradingName: z.string().trim().max(200).optional(),
  /** BT-30, BT-47 — ЕИК/БУЛСТАТ */
  legalId: z.string().trim().max(50).optional(),
  /** BT-31, BT-48 — ДДС номер с префикса на държавата */
  vatId: z.string().trim().max(30).optional(),
  /** BT-29, BT-46 — допълнителен идентификатор */
  identifier: z.string().trim().max(50).optional(),
  address: AddressSchema,
  /** BT-34, BT-49 */
  electronicAddress: ElectronicAddressSchema.optional(),
  /** BG-6 / BG-9 */
  contact: z
    .object({
      name: z.string().trim().max(100).optional(),
      phone: z.string().trim().max(50).optional(),
      email: z.string().trim().max(200).optional(),
    })
    .optional(),
});

const VatSchema = z.object({
  /** BT-151 / BT-95 / BT-102 */
  category: z.enum(VAT_CATEGORIES),
  /** BT-152 / BT-96 / BT-103 — процент; при „O“ липсва */
  rate: decimalText(2).optional(),
});

const AllowanceChargeSchema = z.object({
  /** true — надбавка (BG-21/BG-28), false — отстъпка (BG-20/BG-27) */
  isCharge: z.boolean(),
  /** Сумата; ако липсва, се смята от `percent` върху `baseAmount` */
  amount: amountText.optional(),
  baseAmount: amountText.optional(),
  percent: decimalText(4).optional(),
  reason: z.string().trim().max(200).optional(),
  /** UNTDID 5189 (отстъпка) / 7161 (надбавка) */
  reasonCode: z.string().trim().max(10).optional(),
});

const DocumentAllowanceChargeSchema = AllowanceChargeSchema.extend({ vat: VatSchema });

const LineSchema = z.object({
  /** BT-126 */
  id: nonEmpty(50),
  /** BT-127 */
  note: z.string().trim().max(500).optional(),
  /** BT-129 */
  quantity: decimalText(6),
  /** BT-130 — UN/ECE Rec. 20/21 */
  unitCode: z.string().regex(UNIT_CODE, 'Мерна единица по UN/ECE Rec. 20'),
  /** BT-146 — единична цена без ДДС (чл. 114, ал. 1, т. 11 ЗДДС) */
  netPrice: decimalText(6),
  /** BT-149 — базово количество на цената (по подразбиране 1) */
  priceBaseQuantity: decimalText(6).optional(),
  /** BT-153 */
  name: nonEmpty(200),
  /** BT-154 */
  description: z.string().trim().max(1000).optional(),
  /** BT-155 */
  sellerItemId: z.string().trim().max(100).optional(),
  /** BT-158 + схема (UNTDID 7143: напр. „HS“, „CPV“) */
  classification: z
    .object({ code: nonEmpty(50), scheme: z.string().trim().min(1).max(10) })
    .optional(),
  /** BG-26 */
  period: z.object({ start: isoDate.optional(), end: isoDate.optional() }).optional(),
  vat: VatSchema,
  /** BG-27 / BG-28 */
  allowanceCharges: z.array(AllowanceChargeSchema).max(20).default([]),
  /** BG-32 — атрибути (напр. обстоятелствата за ново превозно средство, чл. 114, ал. 1, т. 15) */
  attributes: z
    .array(z.object({ name: nonEmpty(100), value: nonEmpty(200) }))
    .max(20)
    .default([]),
});

export const ProfileSchema = z.enum(['en16931', 'peppol']);
export type Profile = z.infer<typeof ProfileSchema>;

export const InvoiceInputSchema = z.object({
  /** BT-1 — десетразряден номер (чл. 114, ал. 1, т. 2 ЗДДС) */
  number: nonEmpty(30),
  /** BT-2 */
  issueDate: isoDate,
  /** BT-3 */
  typeCode: z.enum(DOCUMENT_TYPES),
  /** BT-5 */
  currency: z.string().refine(isCurrency, 'Валута по ISO 4217'),
  /**
   * Курсът на ЕЦБ: единици от валутата на фактурата за 1 евро (USD 1.0842). Задължителен, когато
   * валутата не е евро — за ДДС в евро (чл. 114, ал. 5 и чл. 26, ал. 6 ЗДДС; BT-6/BT-111).
   */
  eurExchangeRate: decimalText(6).optional(),
  /** BT-7 — датата на данъчното събитие (чл. 114, ал. 1, т. 10 ЗДДС) */
  taxPointDate: isoDate.optional(),
  /** BT-9 */
  dueDate: isoDate.optional(),
  /** BT-10 */
  buyerReference: z.string().trim().max(200).optional(),
  /** BT-13 */
  orderReference: z.string().trim().max(200).optional(),
  /** BT-12 */
  contractReference: z.string().trim().max(200).optional(),
  /** BT-20 */
  paymentTerms: z.string().trim().max(500).optional(),
  /** BT-22 */
  notes: z.array(z.string().trim().min(1).max(1000)).max(10).default([]),
  /** BG-14 */
  invoicingPeriod: z.object({ start: isoDate.optional(), end: isoDate.optional() }).optional(),
  /** BG-3 — предходни фактури (задължително за известията, чл. 115 ЗДДС) */
  precedingInvoices: z
    .array(z.object({ number: nonEmpty(30), issueDate: isoDate.optional() }))
    .max(20)
    .default([]),
  /** BG-4 */
  seller: PartySchema,
  /** BG-7 */
  buyer: PartySchema,
  /** BG-13 */
  delivery: z.object({ date: isoDate.optional(), address: AddressSchema.optional() }).optional(),
  /** BG-16 */
  payment: z
    .object({
      /** BT-81 */
      meansCode: z.enum(PAYMENT_MEANS),
      /** BT-83 */
      remittanceInformation: z.string().trim().max(140).optional(),
      /** BT-84 — IBAN (т. 16 на чл. 114, ал. 1 по законопроекта) */
      accountId: z.string().trim().max(34).optional(),
      /** BT-85 */
      accountName: z.string().trim().max(200).optional(),
      /** BT-86 */
      bic: z.string().trim().max(11).optional(),
    })
    .optional(),
  /** BG-20 / BG-21 */
  allowanceCharges: z.array(DocumentAllowanceChargeSchema).max(20).default([]),
  /** BT-120 / BT-121 по категория ДДС (основанието за неначисляване) */
  vatExemptions: z
    .array(
      z.object({
        category: z.enum(VAT_CATEGORIES),
        reason: z.string().trim().max(500).optional(),
        reasonCode: z.string().regex(VATEX, 'Код по списъка VATEX').optional(),
      }),
    )
    .max(10)
    .default([]),
  /** BT-113 */
  prepaidAmount: amountText.optional(),
  /** BT-114 */
  roundingAmount: amountText.optional(),
  /** BG-25 */
  lines: z.array(LineSchema).min(1).max(1000),
});

export type InvoiceInput = z.infer<typeof InvoiceInputSchema>;
export type InvoiceLineInput = z.infer<typeof LineSchema>;
export type PartyInput = z.infer<typeof PartySchema>;
export type AddressInput = z.infer<typeof AddressSchema>;
export type AllowanceChargeInput = z.infer<typeof AllowanceChargeSchema>;
export type DocumentAllowanceChargeInput = z.infer<typeof DocumentAllowanceChargeSchema>;
