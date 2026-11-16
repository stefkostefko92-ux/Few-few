import { dec, toPlain } from './decimal.js';
import { DEFAULT_VATEX } from './codes.js';
import { documentNote } from './notes.js';
import { el, leaf, renderXml, required } from './xml.js';
import type { Calculated } from './calculate.js';
import type { InvoiceInput, Profile } from './model.js';
import { CUSTOMIZATION, PEPPOL_PROFILE_ID } from './ubl.js';
import {
  allowanceCharge,
  billingPeriod,
  date102,
  money,
  NS,
  postal,
  tradeParty,
} from './cii-parts.js';

/**
 * UN/CEFACT Cross Industry Invoice D16B по синтаксисната връзка CEN/TS 16931-3-3. Редът на елементите
 * следва XSD-то CrossIndustryInvoice_100pD16B — проверява го scripts/conformance/.
 */
export function toCii(
  input: InvoiceInput,
  calc: Calculated,
  profile: Profile = 'en16931',
  signature?: string,
): string {
  const currency = input.currency;
  const vatAllowed = !calc.breakdown.some((group) => group.category === 'O');
  const note = documentNote(input, calc, signature);
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
