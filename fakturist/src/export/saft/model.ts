import type { InvoiceInput, PartyInput } from '../../einvoice/model.js';
import type { VatCategory } from '../../einvoice/codes.js';
import type { Dec } from '../../einvoice/decimal.js';

/**
 * Данните за SAF-T на счетоводната програма (решение на собственика, 14.11.2026): Фактурист не подава
 * SAF-T — месечният файл иска главната книга, покупките и салдата, които води счетоводството. Той дава
 * продажбите си като фрагменти по XSD 1.0.3 на НАП (`docs/saf-t/`): SalesInvoices, Customers, Products,
 * TaxTable, UOMTable — всеки е глобален елемент на схемата и се проверява поотделно.
 */
export const SAFT_NAMESPACE = 'mf:nra:dgti:dxxxx:declaration:v1';

/** Сметките от сметкоплана на фирмата (SAFAccountType: 3–5 цифри) — избира ги счетоводителят. */
export interface SaftAccounts {
  receivable: string;
  revenue: string;
}

/** Издаден документ за периода — входът му по EN 16931 и състоянието му. */
export interface SaftDocument {
  number: string;
  typeCode: string;
  status: 'ISSUED' | 'CANCELLED';
  input: InvoiceInput;
}

/** Салдото на клиента по сметката за вземания (само от документите и плащанията във Фактурист). */
export interface SaftBalance {
  /** Положително — дебитно (вземане), отрицателно — кредитно. Евроцентове. */
  openingCents: bigint;
  closingCents: bigint;
}

/**
 * Номенклатурите на НАП (Приложение 2 към заповедта — `SAF-T_BG_Structure_Definition.xlsx`), които XSD-то
 * не съдържа. Стойностите — в `codes.ts`, всяка с източника си.
 */
export interface SaftCodes {
  /** TaxType за ДДС. */
  vatTaxType: string;
  /** TaxCode по категорията и ставката; null — няма сверен код (документът — за ръчно). */
  vatTaxCode(category: VatCategory, rate: Dec | null): string | null;
  /** Описанието на TaxCode за TaxTable. */
  vatTaxDescription(taxCode: string): string;
  /** InvoiceType (Nom_Invoice_Types) по вида на документа; null — видът не влиза в продажбите. */
  invoiceType(typeCode: string): string | null;
  /** CustomerID — типов префикс + номер. */
  customerId(party: PartyInput): string;
  /** CompanyStructure/RegistrationNumber на клиента. */
  registrationNumber(party: PartyInput): string;
  /** ProductCommodityCode (NC8_TARIC) по мерната единица и кода по ХС от реда. */
  commodityCode(unitCode: string, hsCode: string | undefined): string;
  /** Мерната единица по номенклатурата (UOMStandard, InvoiceUOM). */
  unitOfMeasure(unitCode: string): string;
}
