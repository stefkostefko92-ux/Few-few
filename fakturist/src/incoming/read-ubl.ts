import { at, child, children, textAt, type XmlNode } from '../xml/parse.js';
import { attr, compact, NotAnInvoice, num, numAt, texts, type ReadResult } from './read-common.js';

/**
 * UBL 2.1 (Invoice / CreditNote, EN 16931 и Peppol BIS 3) → входът по модела на EN 16931. Пътищата са
 * огледални на src/einvoice/ubl.ts; непознатите елементи се пренебрегват (входът се проверява после).
 */
function address(node: XmlNode | undefined) {
  if (!node) return undefined;
  return compact({
    street: textAt(node, 'StreetName'),
    additionalStreet: textAt(node, 'AdditionalStreetName'),
    city: textAt(node, 'CityName'),
    postalCode: textAt(node, 'PostalZone'),
    countryCode: textAt(node, 'Country/IdentificationCode'),
  });
}

function party(node: XmlNode | undefined) {
  const legalName = textAt(node, 'PartyLegalEntity/RegistrationName');
  const tradingName = textAt(node, 'PartyName/Name');
  const vat = children(node, 'PartyTaxScheme').find(
    (scheme) => (textAt(scheme, 'TaxScheme/ID') ?? 'VAT') === 'VAT',
  );
  const endpoint = child(node, 'EndpointID');
  return compact({
    name: legalName ?? tradingName,
    tradingName: legalName && tradingName && tradingName !== legalName ? tradingName : undefined,
    legalId: textAt(node, 'PartyLegalEntity/CompanyID'),
    vatId: textAt(vat, 'CompanyID'),
    identifier: textAt(node, 'PartyIdentification/ID'),
    address: address(child(node, 'PostalAddress')) ?? {},
    electronicAddress: endpoint?.text.trim()
      ? { scheme: endpoint.attrs['schemeID'] ?? '', value: endpoint.text.trim() }
      : undefined,
    contact: compact({
      name: textAt(node, 'Contact/Name'),
      phone: textAt(node, 'Contact/Telephone'),
      email: textAt(node, 'Contact/ElectronicMail'),
    }),
  });
}

function allowanceCharge(node: XmlNode, withVat: boolean) {
  const category = child(node, 'TaxCategory');
  return compact({
    isCharge: textAt(node, 'ChargeIndicator') === 'true',
    amount: numAt(node, 'Amount'),
    baseAmount: numAt(node, 'BaseAmount'),
    percent: numAt(node, 'MultiplierFactorNumeric'),
    reason: textAt(node, 'AllowanceChargeReason'),
    reasonCode: textAt(node, 'AllowanceChargeReasonCode'),
    vat: withVat
      ? compact({ category: textAt(category, 'ID'), rate: numAt(category, 'Percent') })
      : undefined,
  });
}

function period(node: XmlNode | undefined) {
  return node
    ? compact({ start: textAt(node, 'StartDate'), end: textAt(node, 'EndDate') })
    : undefined;
}

function line(node: XmlNode, credit: boolean) {
  const quantity = child(node, credit ? 'CreditedQuantity' : 'InvoicedQuantity');
  const item = child(node, 'Item');
  const tax = child(item, 'ClassifiedTaxCategory');
  const classification = at(item, 'CommodityClassification/ItemClassificationCode');
  return compact({
    id: textAt(node, 'ID'),
    note: textAt(node, 'Note'),
    quantity: num(quantity?.text),
    unitCode: quantity?.attrs['unitCode'],
    netPrice: numAt(node, 'Price/PriceAmount'),
    priceBaseQuantity: numAt(node, 'Price/BaseQuantity'),
    name: textAt(item, 'Name'),
    description: textAt(item, 'Description'),
    sellerItemId: textAt(item, 'SellersItemIdentification/ID'),
    classification: classification?.text.trim()
      ? { code: classification.text.trim(), scheme: classification.attrs['listID'] ?? '' }
      : undefined,
    period: period(child(node, 'InvoicePeriod')),
    vat: compact({ category: textAt(tax, 'ID'), rate: numAt(tax, 'Percent') }) ?? {},
    allowanceCharges: children(node, 'AllowanceCharge').map((ac) => allowanceCharge(ac, false)),
    attributes: children(item, 'AdditionalItemProperty').map((p) => ({
      name: textAt(p, 'Name') ?? '',
      value: textAt(p, 'Value') ?? '',
    })),
  });
}

export function readUbl(root: XmlNode): ReadResult {
  if (root.name !== 'Invoice' && root.name !== 'CreditNote') throw new NotAnInvoice();
  const credit = root.name === 'CreditNote';
  const currency = textAt(root, 'DocumentCurrencyCode');
  const means = child(root, 'PaymentMeans');
  const account = child(means, 'PayeeFinancialAccount');
  const totals = child(root, 'LegalMonetaryTotal');
  const taxTotal =
    children(root, 'TaxTotal').find((t) => attr(t, 'TaxAmount', 'currencyID') === currency) ??
    child(root, 'TaxTotal');
  const exemptions = children(taxTotal, 'TaxSubtotal')
    .map((sub) => child(sub, 'TaxCategory'))
    .filter((cat) => textAt(cat, 'TaxExemptionReason') || textAt(cat, 'TaxExemptionReasonCode'))
    .map((cat) =>
      compact({
        category: textAt(cat, 'ID'),
        reason: textAt(cat, 'TaxExemptionReason'),
        reasonCode: textAt(cat, 'TaxExemptionReasonCode'),
      }),
    );
  const delivery = child(root, 'Delivery');
  const input = compact({
    number: textAt(root, 'ID'),
    issueDate: textAt(root, 'IssueDate'),
    typeCode: textAt(root, credit ? 'CreditNoteTypeCode' : 'InvoiceTypeCode'),
    currency,
    taxPointDate: textAt(root, 'TaxPointDate'),
    dueDate: textAt(root, 'DueDate') ?? textAt(means, 'PaymentDueDate'),
    buyerReference: textAt(root, 'BuyerReference'),
    orderReference: textAt(root, 'OrderReference/ID'),
    contractReference: textAt(root, 'ContractDocumentReference/ID'),
    paymentTerms: textAt(root, 'PaymentTerms/Note'),
    notes: texts(root, 'Note'),
    invoicingPeriod: period(child(root, 'InvoicePeriod')),
    precedingInvoices: children(root, 'BillingReference').map((ref) =>
      compact({
        number: textAt(ref, 'InvoiceDocumentReference/ID'),
        issueDate: textAt(ref, 'InvoiceDocumentReference/IssueDate'),
      }),
    ),
    seller: party(at(root, 'AccountingSupplierParty/Party')) ?? {},
    buyer: party(at(root, 'AccountingCustomerParty/Party')) ?? {},
    delivery: delivery
      ? compact({
          date: textAt(delivery, 'ActualDeliveryDate'),
          address: address(at(delivery, 'DeliveryLocation/Address')),
        })
      : undefined,
    payment: means
      ? compact({
          meansCode: textAt(means, 'PaymentMeansCode'),
          remittanceInformation: textAt(means, 'PaymentID'),
          accountId: textAt(account, 'ID'),
          accountName: textAt(account, 'Name'),
          bic: textAt(account, 'FinancialInstitutionBranch/ID'),
        })
      : undefined,
    allowanceCharges: children(root, 'AllowanceCharge').map((ac) => allowanceCharge(ac, true)),
    vatExemptions: exemptions,
    prepaidAmount: numAt(totals, 'PrepaidAmount'),
    roundingAmount: numAt(totals, 'PayableRoundingAmount'),
    lines: children(root, credit ? 'CreditNoteLine' : 'InvoiceLine').map((l) => line(l, credit)),
  });
  return {
    format: 'UBL',
    input: input ?? {},
    declared: {
      lineExtension: numAt(totals, 'LineExtensionAmount'),
      taxExclusive: numAt(totals, 'TaxExclusiveAmount'),
      taxInclusive: numAt(totals, 'TaxInclusiveAmount'),
      vat: numAt(taxTotal, 'TaxAmount'),
      allowances: numAt(totals, 'AllowanceTotalAmount'),
      charges: numAt(totals, 'ChargeTotalAmount'),
      prepaid: numAt(totals, 'PrepaidAmount'),
      rounding: numAt(totals, 'PayableRoundingAmount'),
      payable: numAt(totals, 'PayableAmount'),
      vatEur: (() => {
        const taxCurrency = textAt(root, 'TaxCurrencyCode');
        const eur = children(root, 'TaxTotal').find(
          (t) => taxCurrency && attr(t, 'TaxAmount', 'currencyID') === taxCurrency,
        );
        return taxCurrency === 'EUR' && currency !== 'EUR' ? numAt(eur, 'TaxAmount') : undefined;
      })(),
    },
  };
}
