import { at, child, children, textAt, type XmlNode } from '../xml/parse.js';
import { compact, isoDate, NotAnInvoice, num, numAt, type ReadResult } from './read-common.js';

/**
 * UN/CEFACT CII D16B (CrossIndustryInvoice, EN 16931 и Peppol) → входът по модела на EN 16931.
 * Пътищата са огледални на src/einvoice/cii.ts; датите са във формат 102 (ГГГГММДД).
 */
const date = (node: XmlNode | undefined, path: string) =>
  isoDate(textAt(node, `${path}/DateTimeString`));

function address(node: XmlNode | undefined) {
  if (!node) return undefined;
  return compact({
    street: textAt(node, 'LineOne'),
    additionalStreet: textAt(node, 'LineTwo'),
    city: textAt(node, 'CityName'),
    postalCode: textAt(node, 'PostcodeCode'),
    countryCode: textAt(node, 'CountryID'),
  });
}

function party(node: XmlNode | undefined) {
  const vat = children(node, 'SpecifiedTaxRegistration').find(
    (reg) => child(reg, 'ID')?.attrs['schemeID'] === 'VA',
  );
  const uri = at(node, 'URIUniversalCommunication/URIID');
  return compact({
    name: textAt(node, 'Name'),
    tradingName: textAt(node, 'SpecifiedLegalOrganization/TradingBusinessName'),
    legalId: textAt(node, 'SpecifiedLegalOrganization/ID'),
    vatId: textAt(vat, 'ID'),
    identifier: textAt(node, 'ID'),
    address: address(child(node, 'PostalTradeAddress')) ?? {},
    electronicAddress: uri?.text.trim()
      ? { scheme: uri.attrs['schemeID'] ?? '', value: uri.text.trim() }
      : undefined,
    contact: compact({
      name: textAt(node, 'DefinedTradeContact/PersonName'),
      phone: textAt(node, 'DefinedTradeContact/TelephoneUniversalCommunication/CompleteNumber'),
      email: textAt(node, 'DefinedTradeContact/EmailURIUniversalCommunication/URIID'),
    }),
  });
}

function allowanceCharge(node: XmlNode, withVat: boolean) {
  const tax = child(node, 'CategoryTradeTax');
  return compact({
    isCharge: textAt(node, 'ChargeIndicator/Indicator') === 'true',
    amount: numAt(node, 'ActualAmount'),
    baseAmount: numAt(node, 'BasisAmount'),
    percent: numAt(node, 'CalculationPercent'),
    reason: textAt(node, 'Reason'),
    reasonCode: textAt(node, 'ReasonCode'),
    vat: withVat
      ? compact({
          category: textAt(tax, 'CategoryCode'),
          rate: numAt(tax, 'RateApplicablePercent'),
        })
      : undefined,
  });
}

function period(node: XmlNode | undefined) {
  return node
    ? compact({ start: date(node, 'StartDateTime'), end: date(node, 'EndDateTime') })
    : undefined;
}

function line(node: XmlNode) {
  const doc = child(node, 'AssociatedDocumentLineDocument');
  const product = child(node, 'SpecifiedTradeProduct');
  const agreement = child(node, 'SpecifiedLineTradeAgreement');
  const quantity = at(node, 'SpecifiedLineTradeDelivery/BilledQuantity');
  const settlement = child(node, 'SpecifiedLineTradeSettlement');
  const tax = child(settlement, 'ApplicableTradeTax');
  const classification = at(product, 'DesignatedProductClassification/ClassCode');
  return compact({
    id: textAt(doc, 'LineID'),
    note: textAt(doc, 'IncludedNote/Content'),
    quantity: num(quantity?.text),
    unitCode: quantity?.attrs['unitCode'],
    netPrice: numAt(agreement, 'NetPriceProductTradePrice/ChargeAmount'),
    priceBaseQuantity: numAt(agreement, 'NetPriceProductTradePrice/BasisQuantity'),
    name: textAt(product, 'Name'),
    description: textAt(product, 'Description'),
    sellerItemId: textAt(product, 'SellerAssignedID'),
    classification: classification?.text.trim()
      ? { code: classification.text.trim(), scheme: classification.attrs['listID'] ?? '' }
      : undefined,
    period: period(child(settlement, 'BillingSpecifiedPeriod')),
    vat:
      compact({
        category: textAt(tax, 'CategoryCode'),
        rate: numAt(tax, 'RateApplicablePercent'),
      }) ?? {},
    allowanceCharges: children(settlement, 'SpecifiedTradeAllowanceCharge').map((ac) =>
      allowanceCharge(ac, false),
    ),
    attributes: children(product, 'ApplicableProductCharacteristic').map((p) => ({
      name: textAt(p, 'Description') ?? '',
      value: textAt(p, 'Value') ?? '',
    })),
  });
}

export function readCii(root: XmlNode): ReadResult {
  if (root.name !== 'CrossIndustryInvoice') throw new NotAnInvoice();
  const header = child(root, 'ExchangedDocument');
  const transaction = child(root, 'SupplyChainTradeTransaction');
  const agreement = child(transaction, 'ApplicableHeaderTradeAgreement');
  const delivery = child(transaction, 'ApplicableHeaderTradeDelivery');
  const settlement = child(transaction, 'ApplicableHeaderTradeSettlement');
  const currency = textAt(settlement, 'InvoiceCurrencyCode');
  const means = child(settlement, 'SpecifiedTradeSettlementPaymentMeans');
  const account = child(means, 'PayeePartyCreditorFinancialAccount');
  const terms = child(settlement, 'SpecifiedTradePaymentTerms');
  const sums = child(settlement, 'SpecifiedTradeSettlementHeaderMonetarySummation');
  const taxes = children(settlement, 'ApplicableTradeTax');
  const vatTotal =
    children(sums, 'TaxTotalAmount').find((t) => t.attrs['currencyID'] === currency) ??
    child(sums, 'TaxTotalAmount');
  const input = compact({
    number: textAt(header, 'ID'),
    issueDate: date(header, 'IssueDateTime'),
    typeCode: textAt(header, 'TypeCode'),
    currency,
    taxPointDate: taxes.map((t) => isoDate(textAt(t, 'TaxPointDate/DateString'))).find(Boolean),
    dueDate: date(terms, 'DueDateDateTime'),
    buyerReference: textAt(agreement, 'BuyerReference'),
    orderReference: textAt(agreement, 'BuyerOrderReferencedDocument/IssuerAssignedID'),
    contractReference: textAt(agreement, 'ContractReferencedDocument/IssuerAssignedID'),
    paymentTerms: textAt(terms, 'Description'),
    notes: children(header, 'IncludedNote')
      .map((n) => textAt(n, 'Content'))
      .filter((n): n is string => Boolean(n)),
    invoicingPeriod: period(child(settlement, 'BillingSpecifiedPeriod')),
    precedingInvoices: children(settlement, 'InvoiceReferencedDocument').map((ref) =>
      compact({
        number: textAt(ref, 'IssuerAssignedID'),
        issueDate: date(ref, 'FormattedIssueDateTime'),
      }),
    ),
    seller: party(child(agreement, 'SellerTradeParty')) ?? {},
    buyer: party(child(agreement, 'BuyerTradeParty')) ?? {},
    delivery: delivery
      ? compact({
          date: date(delivery, 'ActualDeliverySupplyChainEvent/OccurrenceDateTime'),
          address: address(at(delivery, 'ShipToTradeParty/PostalTradeAddress')),
        })
      : undefined,
    payment: means
      ? compact({
          meansCode: textAt(means, 'TypeCode'),
          remittanceInformation: textAt(settlement, 'PaymentReference'),
          accountId: textAt(account, 'IBANID') ?? textAt(account, 'ProprietaryID'),
          accountName: textAt(account, 'AccountName'),
          bic: textAt(means, 'PayeeSpecifiedCreditorFinancialInstitution/BICID'),
        })
      : undefined,
    allowanceCharges: children(settlement, 'SpecifiedTradeAllowanceCharge').map((ac) =>
      allowanceCharge(ac, true),
    ),
    vatExemptions: taxes
      .filter((t) => textAt(t, 'ExemptionReason') || textAt(t, 'ExemptionReasonCode'))
      .map((t) =>
        compact({
          category: textAt(t, 'CategoryCode'),
          reason: textAt(t, 'ExemptionReason'),
          reasonCode: textAt(t, 'ExemptionReasonCode'),
        }),
      ),
    prepaidAmount: numAt(sums, 'TotalPrepaidAmount'),
    roundingAmount: numAt(sums, 'RoundingAmount'),
    lines: children(transaction, 'IncludedSupplyChainTradeLineItem').map(line),
  });
  return {
    format: 'CII',
    input: input ?? {},
    declared: {
      lineExtension: numAt(sums, 'LineTotalAmount'),
      taxExclusive: numAt(sums, 'TaxBasisTotalAmount'),
      taxInclusive: numAt(sums, 'GrandTotalAmount'),
      vat: num(vatTotal?.text),
      allowances: numAt(sums, 'AllowanceTotalAmount'),
      charges: numAt(sums, 'ChargeTotalAmount'),
      prepaid: numAt(sums, 'TotalPrepaidAmount'),
      rounding: numAt(sums, 'RoundingAmount'),
      payable: numAt(sums, 'DuePayableAmount'),
      vatEur:
        textAt(settlement, 'TaxCurrencyCode') === 'EUR' && currency !== 'EUR'
          ? num(children(sums, 'TaxTotalAmount').find((t) => t.attrs['currencyID'] === 'EUR')?.text)
          : undefined,
    },
  };
}
