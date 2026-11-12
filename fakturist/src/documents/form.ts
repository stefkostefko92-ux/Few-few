/**
 * Формата за нов документ (views/app/document-new.ejs) → входът на услугата за издаване. Само
 * преобразува форма (празно поле = липсва, номериране на редовете); проверката е в zod схемата и в ядрото.
 */
type Form = Record<string, unknown>;

function text(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed === '' ? undefined : trimmed;
}

function decimal(value: unknown): string | undefined {
  const raw = text(value);
  // „12,50“ от българска клавиатура → „12.50“; интервалите за хиляди се махат.
  return raw?.replace(/\s/g, '').replace(',', '.');
}

function record(value: unknown): Form {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Form)
    : {};
}

function list(value: unknown): Form[] {
  if (Array.isArray(value)) return value.map(record);
  // qs прави обект с ключове „0“, „1“… когато индексите са над 20.
  return Object.values(record(value)).map(record);
}

export function formToIssueRequest(body: unknown): Record<string, unknown> {
  const form = record(body);
  const buyer = record(form['buyer']);
  const payment = record(form['payment']);
  const preceding = record(form['preceding']);
  const exemption = record(form['exemption']);
  const lines = list(form['lines'])
    .filter((line) => text(line['name']) !== undefined)
    .map((line, index) => {
      const category = text(line['category']) ?? 'S';
      const discount = decimal(line['discount']);
      return {
        id: String(index + 1),
        name: text(line['name']),
        quantity: decimal(line['quantity']),
        unitCode: text(line['unitCode']) ?? 'C62',
        netPrice: decimal(line['netPrice']),
        vat: { category, rate: category === 'O' ? undefined : (decimal(line['rate']) ?? '0') },
        allowanceCharges: discount
          ? [{ isCharge: false, percent: discount, reason: 'Отстъпка' }]
          : [],
        attributes: [],
      };
    });
  const eScheme = text(buyer['eScheme']);
  const eValue = text(buyer['eValue']);
  const meansCode = text(payment['meansCode']);
  const exemptionCategory = text(exemption['category']);
  return {
    seriesId: text(form['seriesId']),
    typeCode: text(form['typeCode']) ?? '380',
    issueDate: text(form['issueDate']),
    taxPointDate: text(form['taxPointDate']),
    dueDate: text(form['dueDate']),
    currency: text(form['currency'])?.toUpperCase() ?? 'EUR',
    eurExchangeRate: decimal(form['eurExchangeRate']),
    buyerReference: text(form['buyerReference']),
    orderReference: text(form['orderReference']),
    paymentTerms: text(form['paymentTerms']),
    notes: text(form['note']) ? [text(form['note'])] : [],
    precedingInvoices: text(preceding['number'])
      ? [{ number: text(preceding['number']), issueDate: text(preceding['issueDate']) }]
      : [],
    buyer: {
      name: text(buyer['name']),
      legalId: text(buyer['legalId']),
      vatId: text(buyer['vatId'])?.replace(/\s/g, '').toUpperCase(),
      address: {
        street: text(buyer['street']),
        city: text(buyer['city']),
        postalCode: text(buyer['postalCode']),
        countryCode: text(buyer['countryCode'])?.toUpperCase() ?? 'BG',
      },
      electronicAddress: eScheme && eValue ? { scheme: eScheme, value: eValue } : undefined,
    },
    payment: meansCode
      ? {
          meansCode,
          accountId: text(payment['accountId'])?.replace(/\s/g, '').toUpperCase(),
          bic: text(payment['bic'])?.toUpperCase(),
        }
      : undefined,
    allowanceCharges: [],
    vatExemptions: exemptionCategory
      ? [
          {
            category: exemptionCategory,
            reason: text(exemption['reason']),
            reasonCode: text(exemption['code']),
          },
        ]
      : [],
    lines,
  };
}
