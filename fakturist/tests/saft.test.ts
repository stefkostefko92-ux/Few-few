import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { COMMON_UNITS } from '../src/einvoice/codes.js';
import { dec } from '../src/einvoice/decimal.js';
import { renderXml } from '../src/einvoice/xml.js';
import type { InvoiceInput, PartyInput } from '../src/einvoice/model.js';
import { customerBalances } from '../src/export/saft/balances.js';
import { saftBundle } from '../src/export/saft/bundle.js';
import { NRA_CODES, nraCustomerId, VAT_SALES_CODES } from '../src/export/saft/codes.js';
import type { SaftDocument } from '../src/export/saft/model.js';
import { saftReadme } from '../src/export/saft/readme.js';
import { salesInvoices } from '../src/export/saft/sales.js';
import { SaftSettingsForm } from '../src/export/saft/settings.js';
import {
  creditNote,
  domestic,
  finalWithAdvance,
  foreignCurrency,
  notRegistered,
  reverseCharge,
  zeroRated,
} from './fixtures/einvoice-samples.js';

/**
 * Данните за SAF-T (XSD 1.0.3): сумите са сметнати на ръка от примерите (виж коментарите в
 * fixtures/einvoice-samples.ts); посоката D/C — по ВиО на НАП, в. 2, S.I.47.
 */
const accounts = { receivable: '411', revenue: '703' };
const doc = (input: InvoiceInput, status: SaftDocument['status'] = 'ISSUED'): SaftDocument => ({
  number: input.number,
  typeCode: input.typeCode,
  status,
  input,
});
const sales = (...inputs: InvoiceInput[]) =>
  renderXml(
    salesInvoices({ documents: inputs.map((i) => doc(i)), accounts, codes: NRA_CODES }).xml,
  );
/** Текстът на всички елементи с това име, по ред. */
const values = (xml: string, tag: string) =>
  [...xml.matchAll(new RegExp(`<${tag}>([^<]*)</${tag}>`, 'g'))].map((m) => m[1]);

test('фактура в евро: вид 01, клиент 10+ЕИК, редове D, отстъпката на документа — C', () => {
  const xml = sales(domestic);
  assert.match(xml, /<SalesInvoices xmlns="mf:nra:dgti:dxxxx:declaration:v1">/);
  assert.deepEqual(values(xml, 'InvoiceType'), ['01']);
  assert.deepEqual(values(xml, 'CustomerID'), ['10131063188']);
  assert.deepEqual(values(xml, 'Period'), ['11']);
  assert.deepEqual(values(xml, 'PeriodYear'), ['2026']);
  assert.deepEqual(values(xml, 'SelfBillingIndicator'), ['N']);
  assert.deepEqual(values(xml, 'TransactionID'), ['0000000124']);
  assert.deepEqual(values(xml, 'DebitCreditIndicator'), ['D', 'D', 'D', 'C']);
  assert.deepEqual(values(xml, 'ProductCode').at(-1), 'FKT-DISCOUNT');
  // Отстъпката на документа е с мярка C62 („единица“ в Unit_Of_Measure).
  assert.deepEqual(values(xml, 'InvoiceUOM'), ['H87', 'HUR', 'H87', 'C62']);
  assert.deepEqual(values(xml, 'TaxPointDate'), Array(4).fill('2026-11-10'));
  // Редовете: 37.50, 54.00 (след отстъпката на реда), 9.99; отстъпката на документа 5.00.
  assert.deepEqual(
    values(xml, 'Amount')
      .filter((_, i) => i % 2 === 0)
      .slice(0, 4),
    ['37.50', '54.00', '9.99', '5.00'],
  );
  assert.deepEqual(values(xml, 'TotalDebit'), ['101.49']);
  assert.deepEqual(values(xml, 'TotalCredit'), ['5.00']);
  assert.deepEqual(values(xml, 'TaxType').slice(0, 1), ['100']);
  assert.deepEqual(values(xml, 'TaxCode'), [
    '100211',
    '100211',
    '100213',
    '100211',
    '100211',
    '100213',
  ]);
  assert.deepEqual(values(xml, 'NetTotal'), ['96.49']);
  assert.deepEqual(values(xml, 'GrossTotal'), ['114.69']);
  assert.deepEqual(values(xml, 'AccountID'), ['411', '703', '703', '703', '703']);
});

test('кредитно известие: вид 03, редът — C с положителна сума и препратка към фактурата', () => {
  const xml = sales(creditNote);
  assert.deepEqual(values(xml, 'InvoiceType'), ['03']);
  assert.deepEqual(values(xml, 'DebitCreditIndicator'), ['C']);
  assert.deepEqual(values(xml, 'Reference'), ['0000000124']);
  assert.deepEqual(values(xml, 'TotalDebit'), ['0.00']);
  assert.deepEqual(values(xml, 'TotalCredit'), ['12.50']);
});

test('приспаднат аванс: редът с минус е C с положително количество и сума', () => {
  const xml = sales(finalWithAdvance);
  assert.deepEqual(values(xml, 'DebitCreditIndicator'), ['D', 'C']);
  assert.deepEqual(values(xml, 'Quantity'), ['1', '1']);
  assert.deepEqual(values(xml, 'TotalDebit'), ['300.00']);
  assert.deepEqual(values(xml, 'TotalCredit'), ['100.00']);
  assert.deepEqual(values(xml, 'NetTotal'), ['200.00']);
  assert.equal(values(xml, 'Reference').length, 0, 'BG-3 към аванса не е кредитно известие');
});

test('чужда валута: сумата в евро по курса, валутата и курсът до нея; C62 остава C62', () => {
  const xml = sales(foreignCurrency);
  assert.deepEqual(values(xml, 'InvoiceUOM'), ['C62']);
  assert.deepEqual(values(xml, 'CurrencyCode'), ['USD', 'USD', 'USD']);
  assert.deepEqual(values(xml, 'ExchangeRate'), ['1.0842', '1.0842', '1.0842']);
  // 100.00 USD / 1.0842 = 92.23 EUR; ДДС 20.00 USD = 18.45 EUR.
  assert.deepEqual(values(xml, 'Amount'), ['92.23', '18.45', '18.45']);
  assert.deepEqual(values(xml, 'CurrencyAmount'), ['100.00', '20.00', '20.00']);
  assert.deepEqual(values(xml, 'UnitPrice'), ['92.23']);
  assert.deepEqual(values(xml, 'GrossTotal'), ['110.68']);
});

test('обратно начисляване по чл. 21, ал. 2 — 100217; 0 % по чл. 30 — 100214; извън обхвата без член и анулиран — за ръчно', () => {
  const result = salesInvoices({
    documents: [doc(reverseCharge), doc(zeroRated), doc(notRegistered), doc(domestic, 'CANCELLED')],
    accounts,
    codes: NRA_CODES,
  });
  assert.deepEqual(
    result.included.map((d) => d.number),
    [reverseCharge.number, zeroRated.number],
  );
  assert.deepEqual(
    result.manual.map((m) => m.reason),
    ['category', 'cancelled'],
  );
  const xml = renderXml(result.xml);
  assert.deepEqual([...new Set(values(xml, 'TaxCode'))], ['100217', '100214']);
  // Обратно начисляване: ставката е „Н/П“ — без TaxPercentage; клиентът от ЕС — 11 + ДДС номер.
  assert.deepEqual(values(xml, 'CustomerID')[0], '11IT12345678903');
  assert.match(xml, /<TaxPercentage>0\.00<\/TaxPercentage>/);
});

test('TaxCode по категорията — точно по лист TAX-IMP на Приложение 2 (v1.0.3)', () => {
  const official = JSON.parse(
    readFileSync(new URL('../docs/saf-t/nomenclatures-1.0.3.json', import.meta.url), 'utf8'),
  ) as {
    vatTaxType: string;
    taxImpVat: Array<{ code: string; description: string }>;
    invoiceTypes: Array<{ code: string }>;
    vatRegistrationTypes: Array<{ code: string; description: string }>;
    unitsOfMeasure: Array<{ code: string }>;
  };
  const tax = new Map(official.taxImpVat.map((t) => [t.code, t.description]));
  for (const [code, description] of Object.entries(VAT_SALES_CODES)) {
    assert.equal(tax.get(code), description, code);
  }
  const code = (
    category: Parameters<typeof NRA_CODES.vatTaxCode>[0],
    rate?: string,
    reason?: string,
  ) => NRA_CODES.vatTaxCode(category, rate === undefined ? null : dec(rate), reason);
  assert.equal(code('S', '20'), '100211');
  assert.equal(code('S', '9'), '100213');
  assert.equal(code('S', '15'), null, 'друга ставка — за ръчно');
  assert.equal(code('Z', '0', 'Международен превоз, чл. 30 ЗДДС'), '100214');
  assert.equal(code('Z', '0', 'Доставка по чл. 173, ал. 1 ЗДДС'), '100216');
  assert.equal(code('G', '0'), '100214');
  assert.equal(code('K', '0'), '100215');
  assert.equal(code('E', '0'), '100219');
  assert.equal(code('AE', '0'), null, 'без член — за ръчно');
  assert.equal(code('O'), null);
  assert.equal(code('AE', '0', 'Обратно начисляване — чл. 21, ал. 2 ЗДДС'), '100217');
  assert.equal(code('O', undefined, 'Място на изпълнение — чл. 69, ал. 2 ЗДДС'), '100218');
  assert.equal(code('AE', '0', 'чл. 163а, ал. 2 ЗДДС (Приложение № 2, част I)'), '100227');
  assert.equal(code('AE', '0', 'чл. 163а, ал. 2 ЗДДС (Приложение № 2, част II)'), '100228');
  assert.equal(code('AE', '0', 'чл. 163а, ал. 2 ЗДДС'), null, 'без частта — за ръчно');
  assert.equal(code('AE', '0', 'чл. 21, ал. 20'), null, 'ал. 20 не е ал. 2');
  assert.equal(code('O', undefined, 'чл. 113, ал. 9 ЗДДС'), null);
  assert.equal(official.vatTaxType, NRA_CODES.vatTaxType);
  assert.equal(
    official.vatRegistrationTypes.find((t) => t.code === NRA_CODES.vatRegistrationType)
      ?.description,
    'Данъчно задължено лице, регистрирано за целите на ДДС',
  );
  const types = new Set(official.invoiceTypes.map((t) => t.code));
  for (const t of ['380', '381', '383', '386']) assert.ok(types.has(NRA_CODES.invoiceType(t)!), t);
  // Всяка мярка от формата за документ е в Unit_Of_Measure след замяната (E48 → C62).
  const units = new Set(official.unitsOfMeasure.map((u) => u.code));
  for (const unit of COMMON_UNITS) assert.ok(units.has(NRA_CODES.unitOfMeasure(unit)), unit);
  assert.equal(NRA_CODES.unitOfMeasure('E48'), 'C62');
});

test('CustomerID: 10 ЕИК, 13 ЕГН, 11 ДДС номер от ЕС, 12 извън ЕС, 14/15 собствен код', () => {
  const party = (extra: Partial<PartyInput>, countryCode = 'BG'): PartyInput => ({
    name: 'Клиент',
    address: { street: 'ул. 1', city: 'София', countryCode },
    ...extra,
  });
  assert.equal(nraCustomerId(party({ legalId: '131063188' })), '10131063188');
  assert.equal(nraCustomerId(party({ vatId: 'BG 131063188' })), '10131063188');
  assert.equal(nraCustomerId(party({ legalId: '7501010010' })), '137501010010');
  assert.equal(nraCustomerId(party({ vatId: 'IT12345678903' }, 'IT')), '11IT12345678903');
  assert.equal(nraCustomerId(party({ vatId: 'EL123456789' }, 'GR')), '11EL123456789');
  assert.equal(nraCustomerId(party({ vatId: '12345678903' }, 'IT')), '11IT12345678903');
  assert.equal(nraCustomerId(party({ legalId: '98-7654321' }, 'US')), '12US98-7654321');
  assert.match(nraCustomerId(party({})), /^15[0-9A-F]{16}$/);
  assert.match(nraCustomerId(party({}, 'DE')), /^14DE[0-9A-F]{16}$/);
  // Гърция — с префикса EL (пример „11EL123456789“ в MF.C.3), и когато номерът е без него.
  assert.equal(nraCustomerId(party({ vatId: '123456789' }, 'GR')), '11EL123456789');
  // Лице от ЕС без ДДС номер — 14 + държава + собствен код (не регистровият номер).
  assert.match(nraCustomerId(party({ legalId: 'HRB 12345' }, 'DE')), /^14DE[0-9A-F]{16}$/);
  assert.equal(
    nraCustomerId(party({})),
    nraCustomerId(party({})),
    'един и същ за едно и също лице',
  );
});

test('салда: начално преди месеца, крайно към края му; кредитното известие и плащанията намаляват', () => {
  const base = {
    customerId: 'C',
    currency: 'EUR',
    eurExchangeRate: undefined,
    precedingTypeCode: null,
    cancelledOn: null,
  };
  const balances = customerBalances(
    [
      { ...base, id: 'a', typeCode: '380', issueDate: '2026-10-05', payableCents: 10000n },
      { ...base, id: 'b', typeCode: '380', issueDate: '2026-11-03', payableCents: 5000n },
      { ...base, id: 'c', typeCode: '381', issueDate: '2026-11-10', payableCents: 1000n },
      { ...base, id: 'd', typeCode: '380', issueDate: '2026-12-01', payableCents: 9900n },
      {
        id: 'e',
        customerId: 'USD',
        typeCode: '380',
        issueDate: '2026-11-04',
        payableCents: 12000n,
        currency: 'USD',
        eurExchangeRate: '1.0842',
        precedingTypeCode: null,
        cancelledOn: null,
      },
    ],
    [
      { documentId: 'a', paidOn: '2026-10-20', amountCents: 4000n },
      { documentId: 'b', paidOn: '2026-11-25', amountCents: 3000n },
      { documentId: 'b', paidOn: '2026-12-02', amountCents: 500n },
    ],
    '2026-11-01',
    '2026-11-30',
  );
  assert.deepEqual(balances.get('C'), { openingCents: 6000n, closingCents: 7000n });
  // 120.00 USD / 1.0842 = 110.68 EUR
  assert.deepEqual(balances.get('USD'), { openingCents: 0n, closingCents: 11068n });
});

test('салда: авансът (386) не е вземане — окончателната го приспада и плащането я затваря', () => {
  const base = {
    customerId: 'C',
    currency: 'EUR',
    eurExchangeRate: undefined,
    precedingTypeCode: null,
    cancelledOn: null,
  };
  const balances = customerBalances(
    [
      // Аванс 120.00, окончателна 360.00 − 120.00 = 240.00 за плащане, платена изцяло.
      { ...base, id: 'adv', typeCode: '386', issueDate: '2026-10-02', payableCents: 12000n },
      { ...base, id: 'fin', typeCode: '380', issueDate: '2026-11-05', payableCents: 24000n },
      // Кредитно известие към аванса — също не е движение по вземането.
      {
        ...base,
        id: 'cn',
        typeCode: '381',
        precedingTypeCode: '386',
        issueDate: '2026-11-06',
        payableCents: 1000n,
      },
    ],
    [{ documentId: 'fin', paidOn: '2026-11-20', amountCents: 24000n }],
    '2026-11-01',
    '2026-11-30',
  );
  assert.deepEqual(balances.get('C'), { openingCents: 0n, closingCents: 0n });
});

test('салда: документ, анулиран по-късно, е в сила за стария месец; плащането на заменящия — с деня си', () => {
  const base = {
    customerId: 'C',
    currency: 'EUR',
    eurExchangeRate: undefined,
    precedingTypeCode: null,
  };
  const documents = [
    // Издадена 10.09, платена 20.09, анулирана 15.11 и заменена с нова (плащането е преместено на нея).
    {
      ...base,
      id: 'old',
      typeCode: '380',
      issueDate: '2026-09-10',
      cancelledOn: '2026-11-15',
      payableCents: 10000n,
    },
    {
      ...base,
      id: 'new',
      typeCode: '380',
      issueDate: '2026-11-15',
      cancelledOn: null,
      payableCents: 10000n,
    },
  ];
  const payments = [{ documentId: 'new', paidOn: '2026-09-20', amountCents: 10000n }];
  assert.deepEqual(customerBalances(documents, payments, '2026-09-01', '2026-09-30').get('C'), {
    openingCents: 0n,
    closingCents: 0n,
  });
  // Неплатена: септември завършва с вземане 100.00; ноември — същото (старата излиза, новата влиза).
  assert.deepEqual(customerBalances(documents, [], '2026-09-01', '2026-09-30').get('C'), {
    openingCents: 0n,
    closingCents: 10000n,
  });
  assert.deepEqual(customerBalances(documents, [], '2026-11-01', '2026-11-30').get('C'), {
    openingCents: 10000n,
    closingCents: 10000n,
  });
});

test('пакетът: пет файла, свързано лице Y, артикулите — по веднъж, услугите с 00000000', () => {
  const bundle = saftBundle({
    documents: [doc(domestic), doc(creditNote), doc(notRegistered)],
    balances: new Map([['10131063188', { openingCents: -500n, closingCents: 11469n }]]),
    accounts,
    codes: NRA_CODES,
    relatedParties: ['bg131063188'],
  });
  assert.deepEqual(
    bundle.files.map((f) => f.name),
    ['SalesInvoices.xml', 'Customers.xml', 'Products.xml', 'TaxTable.xml', 'UOMTable.xml'],
  );
  assert.equal(bundle.included, 2);
  assert.deepEqual(bundle.manual, [{ number: notRegistered.number, reason: 'category' }]);
  const file = (name: string) => bundle.files.find((f) => f.name === name)!.xml;
  const customers = file('Customers.xml');
  assert.deepEqual(values(customers, 'RelatedParty'), ['Y']);
  assert.deepEqual(values(customers, 'RegistrationNumber'), ['131063188']);
  assert.deepEqual(values(customers, 'OpeningCreditBalance'), ['5.00']);
  assert.deepEqual(values(customers, 'ClosingDebitBalance'), ['114.69']);
  const products = file('Products.xml');
  // 3 реда + отстъпката от фактурата + върнатите етикети (друго име → друг код).
  assert.equal(values(products, 'ProductCode').length, 5);
  assert.deepEqual(values(products, 'ProductCommodityCode'), ['0', '00000000', '0', '0', '0']);
  assert.deepEqual(values(file('TaxTable.xml'), 'TaxCode'), ['100211', '100213']);
  assert.deepEqual(values(file('UOMTable.xml'), 'UnitOfMeasure'), ['H87', 'HUR', 'C62']);
  // UOMBase = UOMStandard → коефициент 1 (MF.P.10); TaxType на регистрацията — VAT_TaxType 100010.
  assert.deepEqual(values(products, 'UOMBase'), values(products, 'UOMStandard'));
  assert.deepEqual(values(customers, 'TaxType'), ['100010']);
  const readme = saftReadme({ orgName: 'Карбон Стелт ЕДПК', period: '2026-11', accounts, bundle });
  assert.match(readme, /0000000001 — обратно начисляване, извън обхвата или друга ставка/);
  assert.match(readme, /\r\n$/);
});

test('месец без документи — без файлове (схемата иска поне един запис)', () => {
  const bundle = saftBundle({
    documents: [doc(notRegistered)],
    balances: new Map(),
    accounts,
    codes: NRA_CODES,
    relatedParties: [],
  });
  assert.deepEqual(bundle.files, []);
});

test('настройките: сметка от 3 до 5 цифри без водеща нула; свързаните — уникални, главни', () => {
  const ok = SaftSettingsForm.parse({
    receivable: '411',
    revenue: '70301',
    related: 'bg 131 063188\r\n131063188;123456789, 123456789',
  });
  assert.deepEqual(ok.related, ['BG131063188', '131063188', '123456789']);
  for (const bad of ['0411', '41', '411111', '41a']) {
    assert.equal(
      SaftSettingsForm.safeParse({ receivable: bad, revenue: '703' }).success,
      false,
      bad,
    );
  }
  assert.equal(
    SaftSettingsForm.safeParse({ receivable: '411', revenue: '703', related: 'ЕИК' }).success,
    false,
  );
});
