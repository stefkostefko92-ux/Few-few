import { dec, toFixed, toPlain, type Dec } from './decimal.js';
import { DEFAULT_VATEX } from './codes.js';
import { documentNote } from './notes.js';
import { el, leaf, renderXml, required, type XmlElement } from './xml.js';
import type { Calculated, CalculatedAllowanceCharge } from './calculate.js';
import type { AddressInput, InvoiceInput, PartyInput, Profile } from './model.js';
import { CUSTOMIZATION, PEPPOL_PROFILE_ID } from './ubl.js';

/**
 * UN/CEFACT Cross Industry Invoice D16B по синтаксисната връзка CEN/TS 16931-3-3. Редът на елементите
 * следва XSD-то CrossIndustryInvoice_100pD16B — проверява го scripts/conformance/.
 */
const NS = {
  rsm: 'urn:un:unece:uncefact:data:standard:CrossIndustryInvoice:100',
  ram: 'urn:un:unece:uncefact:data:standard:ReusableAggregateBusinessInformationEntity:100',
  qdt: 'urn:un:unece:uncefact:data:standard:QualifiedDataType:100',
  udt: 'urn:un:unece:uncefact:data:standard:UnqualifiedDataType:100',
};

/** Дата във формат 102 (ГГГГММДД). */
function date102(
  name: string,
  value: string | undefined,
  type: 'udt' | 'qdt' = 'udt',
): XmlElement | null {
  if (!value) return null;
  return el(name, null, leaf(`${type}:DateTimeString`, value.replace(/-/g, ''), { format: '102' }));
}

function money(name: string, value: Dec, currency?: string): XmlElement | null {
  return leaf(name, toFixed(value, 2), currency ? { currencyID: currency } : undefined);
}

function postal(input: AddressInput | undefined): XmlElement | null {
  if (!input) return null;
  return el(
    'ram:PostalTradeAddress',
    null,
    leaf('ram:PostcodeCode', input.postalCode),
    leaf('ram:LineOne', input.street),
    leaf('ram:LineTwo', input.additionalStreet),
    leaf('ram:CityName', input.city),
    leaf('ram:CountryID', input.countryCode),
  );
}

function tradeParty(name: string, input: PartyInput, vatAllowed: boolean): XmlElement | null {
  const identifier = input.identifier ?? (!vatAllowed ? input.vatId : undefined);
  return el(
    name,
    null,
    leaf('ram:ID', identifier),
    leaf('ram:Name', input.name),
    input.legalId || input.tradingName
      ? el(
          'ram:SpecifiedLegalOrganization',
          null,
          leaf('ram:ID', input.legalId),
          leaf('ram:TradingBusinessName', input.tradingName),
        )
      : null,
    input.contact
      ? el(
          'ram:DefinedTradeContact',
          null,
          leaf('ram:PersonName', input.contact.name),
          input.contact.phone
            ? el(
                'ram:TelephoneUniversalCommunication',
                null,
                leaf('ram:CompleteNumber', input.contact.phone),
              )
            : null,
          input.contact.email
            ? el('ram:EmailURIUniversalCommunication', null, leaf('ram:URIID', input.contact.email))
            : null,
        )
      : null,
    postal(input.address),
    input.electronicAddress
      ? el(
          'ram:URIUniversalCommunication',
          null,
          leaf('ram:URIID', input.electronicAddress.value, {
            schemeID: input.electronicAddress.scheme,
          }),
        )
      : null,
    vatAllowed && input.vatId
      ? el('ram:SpecifiedTaxRegistration', null, leaf('ram:ID', input.vatId, { schemeID: 'VA' }))
      : null,
  );
}

function allowanceCharge(
  item: CalculatedAllowanceCharge,
  category?: { category: string; rate: Dec | null },
): XmlElement | null {
  return el(
    'ram:SpecifiedTradeAllowanceCharge',
    null,
    el('ram:ChargeIndicator', null, leaf('udt:Indicator', item.isCharge ? 'true' : 'false')),
    item.percent !== null ? leaf('ram:CalculationPercent', toPlain(item.percent)) : null,
    item.baseAmount !== null ? money('ram:BasisAmount', item.baseAmount) : null,
    money('ram:ActualAmount', item.amount),
    leaf('ram:ReasonCode', item.reasonCode),
    leaf(
      'ram:Reason',
      item.reason ?? (item.reasonCode ? undefined : item.isCharge ? 'Надбавка' : 'Отстъпка'),
    ),
    category
      ? el(
          'ram:CategoryTradeTax',
          null,
          leaf('ram:TypeCode', 'VAT'),
          leaf('ram:CategoryCode', category.category),
          category.rate !== null ? leaf('ram:RateApplicablePercent', toPlain(category.rate)) : null,
        )
      : null,
  );
}

function billingPeriod(start: string | undefined, end: string | undefined): XmlElement | null {
  return el(
    'ram:BillingSpecifiedPeriod',
    null,
    date102('ram:StartDateTime', start),
    date102('ram:EndDateTime', end),
  );
}

export function toCii(input: InvoiceInput, calc: Calculated, profile: Profile = 'en16931'): string {
  const currency = input.currency;
  const vatAllowed = !calc.breakdown.some((group) => group.category === 'O');
  const note = documentNote(input, calc);
  const t = calc.totals;

  const lines = calc.lines.map((line) => {
    const source = input.lines[line.index]!;
    return el(
      'ram:IncludedSupplyChainTradeLineItem',
      null,
      el(
        'ram:AssociatedDocumentLineDocument',
        null,
        leaf('ram:LineID', source.id),
        source.note ? el('ram:IncludedNote', null, leaf('ram:Content', source.note)) : null,
      ),
      el(
        'ram:SpecifiedTradeProduct',
        null,
        leaf('ram:SellerAssignedID', source.sellerItemId),
        leaf('ram:Name', source.name),
        leaf('ram:Description', source.description),
        source.attributes.map((attribute) =>
          el(
            'ram:ApplicableProductCharacteristic',
            null,
            leaf('ram:Description', attribute.name),
            leaf('ram:Value', attribute.value),
          ),
        ),
        source.classification
          ? el(
              'ram:DesignatedProductClassification',
              null,
              leaf('ram:ClassCode', source.classification.code, {
                listID: source.classification.scheme,
              }),
            )
          : null,
      ),
      el(
        'ram:SpecifiedLineTradeAgreement',
        null,
        el(
          'ram:NetPriceProductTradePrice',
          null,
          leaf('ram:ChargeAmount', toPlain(dec(source.netPrice))),
          source.priceBaseQuantity
            ? leaf('ram:BasisQuantity', toPlain(dec(source.priceBaseQuantity)), {
                unitCode: source.unitCode,
              })
            : null,
        ),
      ),
      el(
        'ram:SpecifiedLineTradeDelivery',
        null,
        leaf('ram:BilledQuantity', toPlain(dec(source.quantity)), { unitCode: source.unitCode }),
      ),
      el(
        'ram:SpecifiedLineTradeSettlement',
        null,
        el(
          'ram:ApplicableTradeTax',
          null,
          leaf('ram:TypeCode', 'VAT'),
          leaf('ram:CategoryCode', line.category),
          line.rate !== null ? leaf('ram:RateApplicablePercent', toPlain(line.rate)) : null,
        ),
        source.period ? billingPeriod(source.period.start, source.period.end) : null,
        line.allowanceCharges.map((item) => allowanceCharge(item)),
        el(
          'ram:SpecifiedTradeSettlementLineMonetarySummation',
          null,
          money('ram:LineTotalAmount', line.net),
        ),
      ),
    );
  });

  const agreement = required(
    'ram:ApplicableHeaderTradeAgreement',
    leaf('ram:BuyerReference', input.buyerReference),
    tradeParty('ram:SellerTradeParty', input.seller, vatAllowed),
    tradeParty('ram:BuyerTradeParty', input.buyer, vatAllowed),
    input.orderReference
      ? el(
          'ram:BuyerOrderReferencedDocument',
          null,
          leaf('ram:IssuerAssignedID', input.orderReference),
        )
      : null,
    input.contractReference
      ? el(
          'ram:ContractReferencedDocument',
          null,
          leaf('ram:IssuerAssignedID', input.contractReference),
        )
      : null,
  );

  const delivery = required(
    'ram:ApplicableHeaderTradeDelivery',
    input.delivery?.address
      ? el('ram:ShipToTradeParty', null, postal(input.delivery.address))
      : null,
    input.delivery?.date
      ? el(
          'ram:ActualDeliverySupplyChainEvent',
          null,
          date102('ram:OccurrenceDateTime', input.delivery.date),
        )
      : null,
  );

  const settlement = required(
    'ram:ApplicableHeaderTradeSettlement',
    leaf('ram:PaymentReference', input.payment?.remittanceInformation),
    calc.vatCurrency ? leaf('ram:TaxCurrencyCode', calc.vatCurrency) : null,
    leaf('ram:InvoiceCurrencyCode', currency),
    input.payment
      ? el(
          'ram:SpecifiedTradeSettlementPaymentMeans',
          null,
          leaf('ram:TypeCode', input.payment.meansCode),
          input.payment.accountId
            ? el(
                'ram:PayeePartyCreditorFinancialAccount',
                null,
                /^[A-Z]{2}\d{2}[A-Z0-9]{10,30}$/.test(input.payment.accountId)
                  ? leaf('ram:IBANID', input.payment.accountId)
                  : null,
                leaf('ram:AccountName', input.payment.accountName),
                /^[A-Z]{2}\d{2}[A-Z0-9]{10,30}$/.test(input.payment.accountId)
                  ? null
                  : leaf('ram:ProprietaryID', input.payment.accountId),
              )
            : null,
          input.payment.bic
            ? el(
                'ram:PayeeSpecifiedCreditorFinancialInstitution',
                null,
                leaf('ram:BICID', input.payment.bic),
              )
            : null,
        )
      : null,
    // BT-7 се пише само веднъж — в първата група ДДС (CII-SR-461).
    calc.breakdown.map((group, index) =>
      el(
        'ram:ApplicableTradeTax',
        null,
        money('ram:CalculatedAmount', group.vat),
        leaf('ram:TypeCode', 'VAT'),
        leaf('ram:ExemptionReason', group.exemptionReason),
        money('ram:BasisAmount', group.taxable),
        leaf('ram:CategoryCode', group.category),
        leaf(
          'ram:ExemptionReasonCode',
          group.exemptionCode ??
            (group.exemptionReason ? undefined : DEFAULT_VATEX[group.category]),
        ),
        input.taxPointDate && index === 0
          ? el(
              'ram:TaxPointDate',
              null,
              leaf('udt:DateString', input.taxPointDate.replace(/-/g, ''), { format: '102' }),
            )
          : null,
        group.rate !== null ? leaf('ram:RateApplicablePercent', toPlain(group.rate)) : null,
      ),
    ),
    input.invoicingPeriod
      ? billingPeriod(input.invoicingPeriod.start, input.invoicingPeriod.end)
      : null,
    calc.allowanceCharges.map((item) =>
      allowanceCharge(item, { category: item.category, rate: item.rate }),
    ),
    input.paymentTerms || input.dueDate
      ? el(
          'ram:SpecifiedTradePaymentTerms',
          null,
          leaf('ram:Description', input.paymentTerms),
          date102('ram:DueDateDateTime', input.dueDate),
        )
      : null,
    el(
      'ram:SpecifiedTradeSettlementHeaderMonetarySummation',
      null,
      money('ram:LineTotalAmount', t.lineExtension),
      calc.hasDocumentCharges ? money('ram:ChargeTotalAmount', t.charges) : null,
      calc.hasDocumentAllowances ? money('ram:AllowanceTotalAmount', t.allowances) : null,
      money('ram:TaxBasisTotalAmount', t.taxExclusive),
      money('ram:TaxTotalAmount', t.vat, currency),
      calc.vatCurrency && t.vatInEur
        ? money('ram:TaxTotalAmount', t.vatInEur, calc.vatCurrency)
        : null,
      t.rounding.v !== 0n ? money('ram:RoundingAmount', t.rounding) : null,
      money('ram:GrandTotalAmount', t.taxInclusive),
      t.prepaid.v !== 0n ? money('ram:TotalPrepaidAmount', t.prepaid) : null,
      money('ram:DuePayableAmount', t.payable),
    ),
    input.precedingInvoices.map((preceding) =>
      el(
        'ram:InvoiceReferencedDocument',
        null,
        leaf('ram:IssuerAssignedID', preceding.number),
        date102('ram:FormattedIssueDateTime', preceding.issueDate, 'qdt'),
      ),
    ),
  );

  const document = el(
    'rsm:CrossIndustryInvoice',
    { 'xmlns:rsm': NS.rsm, 'xmlns:ram': NS.ram, 'xmlns:qdt': NS.qdt, 'xmlns:udt': NS.udt },
    el(
      'rsm:ExchangedDocumentContext',
      null,
      profile === 'peppol'
        ? el(
            'ram:BusinessProcessSpecifiedDocumentContextParameter',
            null,
            leaf('ram:ID', PEPPOL_PROFILE_ID),
          )
        : null,
      el(
        'ram:GuidelineSpecifiedDocumentContextParameter',
        null,
        leaf('ram:ID', CUSTOMIZATION[profile]),
      ),
    ),
    el(
      'rsm:ExchangedDocument',
      null,
      leaf('ram:ID', input.number),
      leaf('ram:TypeCode', input.typeCode),
      date102('ram:IssueDateTime', input.issueDate),
      note ? el('ram:IncludedNote', null, leaf('ram:Content', note)) : null,
    ),
    required('rsm:SupplyChainTradeTransaction', lines, agreement, delivery, settlement),
  );
  if (!document) throw new Error('Празен документ');
  return renderXml(document);
}
