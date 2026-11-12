import type { InvoiceInput } from '../../src/einvoice/model.js';

/**
 * Примерните документи — едни и същи за unit тестовете и за официалната проверка (scripts/conformance/).
 * Сумите в коментарите са сметнати на ръка.
 */
const seller = {
  name: 'Карбон Стелт ЕДПК',
  legalId: '208725180',
  vatId: 'BG208725180',
  address: { street: 'ул. „Самуил“ № 3', city: 'Бобов дол', postalCode: '2670', countryCode: 'BG' },
  electronicAddress: { scheme: '9926', value: 'BG208725180' },
  contact: { name: 'Счетоводство', email: 'info@carbonstealth.eu' },
};

const buyer = {
  name: 'Национална агенция за приходите',
  legalId: '131063188',
  vatId: 'BG131063188',
  address: {
    street: 'бул. „Княз Александър Дондуков“ № 52',
    city: 'София',
    postalCode: '1000',
    countryCode: 'BG',
  },
  electronicAddress: { scheme: '9926', value: 'BG131063188' },
};

/**
 * Вътрешна фактура в евро, две ставки, отстъпка на ред и на документ.
 * Ред 1: 3 × 12.50 = 37.50 (S 20). Ред 2: 1.5 ч × 40.00 = 60.00 − 10% = 54.00 (S 20).
 * Ред 3: 2 × 4.995 = 9.99 (S 9). Отстъпка на документа 5.00 (S 20).
 * BT-106 = 101.49; BT-109 = 96.49; S20: 86.50 → 17.30; S9: 9.99 → 0.90; BT-110 = 18.20; BT-112 = 114.69.
 */
export const domestic: InvoiceInput = {
  number: '0000000124',
  issueDate: '2026-11-12',
  typeCode: '380',
  currency: 'EUR',
  taxPointDate: '2026-11-10',
  dueDate: '2026-11-26',
  buyerReference: 'Поръчка 77',
  notes: [],
  precedingInvoices: [],
  seller,
  buyer,
  payment: {
    meansCode: '30',
    accountId: 'BG80BNBG96611020345678',
    accountName: 'Карбон Стелт ЕДПК',
    bic: 'BNBGBGSD',
    remittanceInformation: '0000000124',
  },
  allowanceCharges: [
    {
      isCharge: false,
      amount: '5.00',
      reason: 'Отстъпка за лоялен клиент',
      vat: { category: 'S', rate: '20' },
    },
  ],
  vatExemptions: [],
  lines: [
    {
      id: '1',
      quantity: '3',
      unitCode: 'H87',
      netPrice: '12.50',
      name: 'Етикети за рафт, комплект',
      vat: { category: 'S', rate: '20' },
      allowanceCharges: [],
      attributes: [],
    },
    {
      id: '2',
      quantity: '1.5',
      unitCode: 'HUR',
      netPrice: '40.00',
      name: 'Консултация по е-фактуриране',
      vat: { category: 'S', rate: '20' },
      allowanceCharges: [{ isCharge: false, percent: '10', reason: 'Отстъпка' }],
      attributes: [],
    },
    {
      id: '3',
      quantity: '2',
      unitCode: 'H87',
      netPrice: '4.995',
      name: 'Книга',
      vat: { category: 'S', rate: '9' },
      allowanceCharges: [],
      attributes: [],
    },
  ],
};

/**
 * Фактура в щатски долари: 100.00 USD при S 20 → ДДС 20.00 USD. Курс 1.0842 USD/EUR:
 * основа 92.23 EUR, ДДС 18.45 EUR (BT-111).
 */
export const foreignCurrency: InvoiceInput = {
  ...domestic,
  number: '0000000125',
  currency: 'USD',
  eurExchangeRate: '1.0842',
  allowanceCharges: [],
  payment: undefined,
  paymentTerms: 'Плащане до 14 дни',
  lines: [
    {
      id: '1',
      quantity: '1',
      unitCode: 'C62',
      netPrice: '100.00',
      name: 'Годишен абонамент',
      vat: { category: 'S', rate: '20' },
      allowanceCharges: [],
      attributes: [],
    },
  ],
};

/** Услуга към фирма от ЕС — обратно начисляване (чл. 21, ал. 2 ЗДДС). */
export const reverseCharge: InvoiceInput = {
  ...domestic,
  number: '0000000126',
  allowanceCharges: [],
  buyer: {
    name: 'Esempio S.r.l.',
    vatId: 'IT12345678903',
    address: { street: 'Via Roma 1', city: 'Milano', postalCode: '20121', countryCode: 'IT' },
    electronicAddress: { scheme: '0211', value: 'IT12345678903' },
  },
  vatExemptions: [
    {
      category: 'AE',
      reason: 'Обратно начисляване, чл. 21, ал. 2 ЗДДС / Reverse charge',
      reasonCode: 'VATEX-EU-AE',
    },
  ],
  lines: [
    {
      id: '1',
      quantity: '10',
      unitCode: 'HUR',
      netPrice: '55',
      name: 'Разработка на софтуер',
      vat: { category: 'AE', rate: '0' },
      allowanceCharges: [],
      attributes: [],
    },
  ],
};

/** Кредитно известие към 0000000124 (чл. 115 ЗДДС): връщане на 1 комплект етикети. */
export const creditNote: InvoiceInput = {
  ...domestic,
  number: '0000000127',
  typeCode: '381',
  issueDate: '2026-11-13',
  taxPointDate: '2026-11-13',
  allowanceCharges: [],
  precedingInvoices: [{ number: '0000000124', issueDate: '2026-11-12' }],
  lines: [
    {
      id: '1',
      quantity: '1',
      unitCode: 'H87',
      netPrice: '12.50',
      name: 'Етикети за рафт, комплект — върнат',
      vat: { category: 'S', rate: '20' },
      allowanceCharges: [],
      attributes: [],
    },
  ],
};

/** Доставчик без регистрация по ЗДДС (чл. 113, ал. 9) — категория O. */
export const notRegistered: InvoiceInput = {
  ...domestic,
  number: '0000000001',
  allowanceCharges: [],
  seller: {
    ...seller,
    vatId: undefined,
    electronicAddress: { scheme: '9926', value: 'BG208725180' },
  },
  vatExemptions: [
    { category: 'O', reason: 'Лицето не е регистрирано по ЗДДС, чл. 113, ал. 9 ЗДДС' },
  ],
  lines: [
    {
      id: '1',
      quantity: '1',
      unitCode: 'C62',
      netPrice: '250',
      name: 'Изработка на уебсайт',
      vat: { category: 'O' },
      allowanceCharges: [],
      attributes: [],
    },
  ],
};

/** Нулева ставка — международен превоз (чл. 30 ЗДДС): основанието отива в бележката (BR-Z-10). */
export const zeroRated: InvoiceInput = {
  ...domestic,
  number: '0000000128',
  allowanceCharges: [],
  vatExemptions: [{ category: 'Z', reason: 'чл. 30 ЗДДС — международен превоз' }],
  lines: [
    {
      id: '1',
      quantity: '1',
      unitCode: 'C62',
      netPrice: '1200',
      name: 'Международен превоз София — Милано',
      vat: { category: 'Z', rate: '0' },
      allowanceCharges: [],
      attributes: [],
    },
  ],
};

export const SAMPLES = {
  domestic,
  foreignCurrency,
  reverseCharge,
  creditNote,
  notRegistered,
  zeroRated,
};
