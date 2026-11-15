import { calculate, type Calculated } from '../../einvoice/calculate.js';
import type { VatCategory } from '../../einvoice/codes.js';
import { add, isNegative, neg, toFixed, toPlain, ZERO, type Dec } from '../../einvoice/decimal.js';
import { el, leaf, type XmlElement } from '../../einvoice/xml.js';
import { NOTE_REASON_PREFIX } from '../../documents/form.js';
import { amountStructure, lineVat, money, parseRate, toEur } from './amounts.js';
import { exemptionReasonFor } from '../journal-format.js';
import { clip } from './keys.js';
import { addressXml, saftLines, type SaftLine } from './lines.js';
import { SAFT_NAMESPACE, type SaftAccounts, type SaftCodes, type SaftDocument } from './model.js';

/**
 * `SalesInvoices` (XSD 1.0.3, InvoiceStructure): по един `Invoice` на издаден документ от периода. Сумите
 * на редовете са без ДДС и положителни, посоката е в `DebitCreditIndicator` — по „Въпроси и отговори“ на
 * НАП, в. 2, S.I.47: „D“ — редът увеличава вземането (фактура, дебитно известие, надбавка), „C“ — намалява
 * го с положителна сума (кредитно известие, отстъпка, приспаднат аванс). Отстъпката и надбавката на ниво
 * документ са отделни редове (псевдоартикули `FKT-DISCOUNT`/`FKT-CHARGE`). Документ без код за вида или за
 * категорията на ДДС не влиза — излиза в списъка „за ръчно“, никога наслуки.
 */
export type ManualReason = 'type' | 'category' | 'cancelled';
export interface SalesResult {
  xml: XmlElement;
  included: SaftDocument[];
  manual: Array<{ number: string; reason: ManualReason }>;
}

const abs = (value: Dec): Dec => (isNegative(value) ? neg(value) : value);

interface Money {
  currency: string;
  rate: Dec | null;
}

function taxInformation(
  name: string,
  codes: SaftCodes,
  group: { category: VatCategory; rate: Dec | null; exemption: string | undefined },
  base: Dec,
  vat: Dec,
  vatEur: Dec | null,
  m: Money,
): XmlElement | null {
  return el(
    name,
    null,
    leaf('TaxType', codes.vatTaxType),
    leaf('TaxCode', codes.vatTaxCode(group.category, group.rate, group.exemption)),
    // Ставката е по избор; за освободените (E) в TAX-IMP е „Н/П“.
    group.rate && group.category !== 'E' ? leaf('TaxPercentage', toFixed(group.rate, 2)) : null,
    leaf('TaxBase', money(base)),
    el(
      'TaxAmount',
      null,
      leaf('Amount', money(vatEur ?? toEur(vat, m.currency, m.rate))),
      leaf('CurrencyCode', m.currency),
      leaf('CurrencyAmount', money(vat)),
      m.currency !== 'EUR' && m.rate ? leaf('ExchangeRate', toFixed(m.rate, 4)) : null,
    ),
    leaf('TaxExemptionReason', clip(group.exemption, 70)),
  );
}

interface Sums {
  debit: Dec;
  credit: Dec;
}

function invoiceXml(
  doc: SaftDocument,
  invoiceType: string,
  calc: Calculated,
  lines: SaftLine[],
  accounts: SaftAccounts,
  codes: SaftCodes,
  sums: Sums,
): XmlElement {
  const { input } = doc;
  const m: Money = { currency: input.currency, rate: parseRate(input.eurExchangeRate) };
  const credit = doc.typeCode === '381';
  const taxPoint = input.taxPointDate ?? input.issueDate;
  const [year, month] = input.issueDate.split('-') as [string, string];
  const preceding = input.precedingInvoices[0];
  const reason = input.notes
    .find((n) => n.startsWith(NOTE_REASON_PREFIX))
    ?.slice(NOTE_REASON_PREFIX.length);
  const isNote = doc.typeCode === '381' || doc.typeCode === '383';

  const lineXml = lines.map((line, i) => {
    // Намалява вземането: ред с минус във фактура или ред с плюс в кредитно известие (S.I.47).
    const indicator = isNegative(line.net) !== credit ? 'C' : 'D';
    const net = abs(line.net);
    const netEur = toEur(net, m.currency, m.rate);
    if (indicator === 'D') sums.debit = add(sums.debit, netEur);
    else sums.credit = add(sums.credit, netEur);
    return el(
      'InvoiceLine',
      null,
      leaf('LineNumber', String(i + 1)),
      leaf('AccountID', accounts.revenue),
      leaf('ProductCode', line.code),
      leaf('ProductDescription', line.productDescription),
      leaf('Quantity', toPlain(abs(line.quantity))),
      leaf('InvoiceUOM', codes.unitOfMeasure(line.unitCode)),
      leaf('UnitPrice', money(toEur(abs(line.unitPrice), m.currency, m.rate))),
      leaf('TaxPointDate', taxPoint),
      isNote && preceding
        ? el(
            'References',
            null,
            el(
              'CreditNote',
              null,
              leaf('Reference', clip(preceding.number, 35)),
              leaf('Reason', clip(reason, 256)),
            ),
          )
        : null,
      leaf('Description', line.description),
      amountStructure('InvoiceLineAmount', net, m.currency, m.rate),
      leaf('DebitCreditIndicator', indicator),
      taxInformation(
        'TaxInformation',
        codes,
        { category: line.category, rate: line.rate, exemption: line.exemption },
        netEur,
        lineVat(net, line.rate),
        null,
        m,
      ),
    );
  });

  const totals = el(
    'InvoiceDocumentTotals',
    null,
    calc.breakdown.map((g) =>
      taxInformation(
        'TaxInformationTotals',
        codes,
        {
          category: g.category,
          rate: g.rate,
          exemption: exemptionReasonFor(g.category, g.exemptionReason, input.vatExemptions),
        },
        g.taxableEur ?? g.taxable,
        g.vat,
        g.vatEur,
        m,
      ),
    ),
    leaf('NetTotal', money(toEur(calc.totals.taxExclusive, m.currency, m.rate))),
    leaf(
      'GrossTotal',
      money(
        add(
          toEur(calc.totals.taxExclusive, m.currency, m.rate),
          calc.totals.vatInEur ?? calc.totals.vat,
        ),
      ),
    ),
  );

  return el(
    'Invoice',
    null,
    leaf('InvoiceNo', clip(doc.number, 70)),
    el(
      'CustomerInfo',
      null,
      leaf('CustomerID', codes.customerId(input.buyer)),
      leaf('Name', clip(input.buyer.name, 70)),
      addressXml('BillingAddress', input.buyer.address),
    ),
    leaf('AccountID', accounts.receivable),
    leaf('Period', String(Number(month))),
    leaf('PeriodYear', year),
    leaf('InvoiceDate', input.issueDate),
    leaf('InvoiceType', invoiceType),
    leaf('SelfBillingIndicator', 'N'),
    leaf('TransactionID', clip(doc.number, 70)),
    lineXml,
    totals,
  )!;
}

export function salesInvoices(input: {
  documents: readonly SaftDocument[];
  accounts: SaftAccounts;
  codes: SaftCodes;
}): SalesResult {
  const { accounts, codes } = input;
  const included: SaftDocument[] = [];
  const manual: SalesResult['manual'] = [];
  const invoices: XmlElement[] = [];
  const sums: Sums = { debit: ZERO, credit: ZERO };

  for (const doc of input.documents) {
    if (doc.status === 'CANCELLED') {
      manual.push({ number: doc.number, reason: 'cancelled' });
      continue;
    }
    const invoiceType = codes.invoiceType(doc.typeCode);
    if (!invoiceType) {
      manual.push({ number: doc.number, reason: 'type' });
      continue;
    }
    const calc = calculate(doc.input);
    const lines = saftLines(doc.input, calc);
    const unmapped =
      lines.some((x) => codes.vatTaxCode(x.category, x.rate, x.exemption) === null) ||
      calc.breakdown.some(
        (g) =>
          codes.vatTaxCode(
            g.category,
            g.rate,
            exemptionReasonFor(g.category, g.exemptionReason, doc.input.vatExemptions),
          ) === null,
      );
    if (unmapped) {
      manual.push({ number: doc.number, reason: 'category' });
      continue;
    }
    invoices.push(invoiceXml(doc, invoiceType, calc, lines, accounts, codes, sums));
    included.push(doc);
  }

  const xml: XmlElement = {
    name: 'SalesInvoices',
    attrs: { xmlns: SAFT_NAMESPACE },
    children: [
      leaf('NumberOfEntries', String(invoices.length))!,
      leaf('TotalDebit', money(sums.debit))!,
      leaf('TotalCredit', money(sums.credit))!,
      ...invoices,
    ],
  };
  return { xml, included, manual };
}
