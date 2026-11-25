import { dec, toPlain } from './decimal.js';
import { DEFAULT_VATEX } from './codes.js';
import { documentNote } from './notes.js';
import { el, leaf, renderXml, type Child, type XmlElement } from './xml.js';
import type { Calculated } from './calculate.js';
import type { InvoiceInput, Profile } from './model.js';
import { address, allowanceCharge, amount, NS, party, period, taxCategory } from './ubl-parts.js';

/**
 * UBL 2.1 по синтаксисната връзка CEN/TS 16931-3-2 и Peppol BIS Billing 3.0. Редът на елементите следва
 * XSD-тата на OASIS (UBL-Invoice-2.1 / UBL-CreditNote-2.1) — проверява го scripts/conformance/.
 * Кредитното известие (381) е отделен документ CreditNote; останалите видове са Invoice.
 */
/** Спецификацията Peppol BIS Billing 3.0 — по нея се разпознава документ, издаден в профил Peppol. */
export const PEPPOL_BILLING_URN = 'urn:fdc:peppol.eu:2017:poacc:billing:3.0';

export const CUSTOMIZATION = {
  en16931: 'urn:cen.eu:en16931:2017',
  peppol: `urn:cen.eu:en16931:2017#compliant#${PEPPOL_BILLING_URN}`,
} as const satisfies Record<Profile, string>;

export const PEPPOL_PROFILE_ID = 'urn:fdc:peppol.eu:2017:poacc:billing:01:1.0';

export function toUbl(
  input: InvoiceInput,
  calc: Calculated,
  profile: Profile = 'en16931',
  signature?: string,
): string {
  const isCredit = input.typeCode === '381';
  const root = isCredit ? 'CreditNote' : 'Invoice';
  const currency = input.currency;
  const hasO = calc.breakdown.some((group) => group.category === 'O');
  const vatAllowed = !hasO;
  const note = documentNote(input, calc, signature);
  const t = calc.totals;

  // BT-9 при кредитно известие е в PaymentMeans (UBL CreditNote няма DueDate в главата).
  const creditDueInTerms = isCredit && input.dueDate && !input.payment && !input.paymentTerms;
  const paymentTerms =
    input.paymentTerms ?? (creditDueInTerms ? `Падеж: ${input.dueDate}` : undefined);

  const header: Child[] = [
    leaf('cbc:CustomizationID', CUSTOMIZATION[profile]),
    profile === 'peppol' ? leaf('cbc:ProfileID', PEPPOL_PROFILE_ID) : null,
    leaf('cbc:ID', input.number),
    leaf('cbc:IssueDate', input.issueDate),
  ];
  if (isCredit) {
    header.push(
      leaf('cbc:TaxPointDate', input.taxPointDate),
      leaf('cbc:CreditNoteTypeCode', input.typeCode),
      leaf('cbc:Note', note),
    );
  } else {
    header.push(
      leaf('cbc:DueDate', input.dueDate),
      leaf('cbc:InvoiceTypeCode', input.typeCode),
      leaf('cbc:Note', note),
      leaf('cbc:TaxPointDate', input.taxPointDate),
    );
  }
  header.push(
    leaf('cbc:DocumentCurrencyCode', currency),
    calc.vatCurrency ? leaf('cbc:TaxCurrencyCode', calc.vatCurrency) : null,
    leaf('cbc:BuyerReference', input.buyerReference),
    input.invoicingPeriod ? period(input.invoicingPeriod.start, input.invoicingPeriod.end) : null,
    input.orderReference
      ? el('cac:OrderReference', null, leaf('cbc:ID', input.orderReference))
      : null,
    input.precedingInvoices.map((preceding) =>
      el(
        'cac:BillingReference',
        null,
        el(
          'cac:InvoiceDocumentReference',
          null,
          leaf('cbc:ID', preceding.number),
          leaf('cbc:IssueDate', preceding.issueDate),
        ),
      ),
    ),
    input.contractReference
      ? el('cac:ContractDocumentReference', null, leaf('cbc:ID', input.contractReference))
      : null,
    el('cac:AccountingSupplierParty', null, party(input.seller, vatAllowed)),
    el('cac:AccountingCustomerParty', null, party(input.buyer, vatAllowed)),
    input.delivery
      ? el(
          'cac:Delivery',
          null,
          leaf('cbc:ActualDeliveryDate', input.delivery.date),
          input.delivery.address
            ? el('cac:DeliveryLocation', null, address('cac:Address', input.delivery.address))
            : null,
        )
      : null,
    input.payment
      ? el(
          'cac:PaymentMeans',
          null,
          leaf('cbc:PaymentMeansCode', input.payment.meansCode),
          isCredit ? leaf('cbc:PaymentDueDate', input.dueDate) : null,
          leaf('cbc:PaymentID', input.payment.remittanceInformation),
          input.payment.accountId
            ? el(
                'cac:PayeeFinancialAccount',
                null,
                leaf('cbc:ID', input.payment.accountId),
                leaf('cbc:Name', input.payment.accountName),
                input.payment.bic
                  ? el('cac:FinancialInstitutionBranch', null, leaf('cbc:ID', input.payment.bic))
                  : null,
              )
            : null,
        )
      : null,
    paymentTerms ? el('cac:PaymentTerms', null, leaf('cbc:Note', paymentTerms)) : null,
  );

  const documentAllowances = calc.allowanceCharges.map((item) =>
    allowanceCharge(item, currency, { category: item.category, rate: item.rate }),
  );

  const taxTotals = [
    el(
      'cac:TaxTotal',
      null,
      amount('cbc:TaxAmount', t.vat, currency),
      calc.breakdown.map((group) =>
        el(
          'cac:TaxSubtotal',
          null,
          amount('cbc:TaxableAmount', group.taxable, currency),
          amount('cbc:TaxAmount', group.vat, currency),
          taxCategory(
            'cac:TaxCategory',
            group.category,
            group.rate,
            [
              leaf(
                'cbc:TaxExemptionReasonCode',
                group.exemptionCode ??
                  (group.exemptionReason ? undefined : DEFAULT_VATEX[group.category]),
              ),
              leaf('cbc:TaxExemptionReason', group.exemptionReason),
            ].filter((x): x is XmlElement => x !== null),
          ),
        ),
      ),
    ),
    calc.vatCurrency && t.vatInEur
      ? el('cac:TaxTotal', null, amount('cbc:TaxAmount', t.vatInEur, calc.vatCurrency))
      : null,
  ];

  const monetary = el(
    'cac:LegalMonetaryTotal',
    null,
    amount('cbc:LineExtensionAmount', t.lineExtension, currency),
    amount('cbc:TaxExclusiveAmount', t.taxExclusive, currency),
    amount('cbc:TaxInclusiveAmount', t.taxInclusive, currency),
    calc.hasDocumentAllowances ? amount('cbc:AllowanceTotalAmount', t.allowances, currency) : null,
    calc.hasDocumentCharges ? amount('cbc:ChargeTotalAmount', t.charges, currency) : null,
    t.prepaid.v !== 0n ? amount('cbc:PrepaidAmount', t.prepaid, currency) : null,
    t.rounding.v !== 0n ? amount('cbc:PayableRoundingAmount', t.rounding, currency) : null,
    amount('cbc:PayableAmount', t.payable, currency),
  );

  const lines = calc.lines.map((line) => {
    const source = input.lines[line.index]!;
    return el(
      isCredit ? 'cac:CreditNoteLine' : 'cac:InvoiceLine',
      null,
      leaf('cbc:ID', source.id),
      leaf('cbc:Note', source.note),
      leaf(
        isCredit ? 'cbc:CreditedQuantity' : 'cbc:InvoicedQuantity',
        toPlain(dec(source.quantity)),
        {
          unitCode: source.unitCode,
        },
      ),
      amount('cbc:LineExtensionAmount', line.net, currency),
      source.period ? period(source.period.start, source.period.end) : null,
      line.allowanceCharges.map((item) => allowanceCharge(item, currency)),
      el(
        'cac:Item',
        null,
        leaf('cbc:Description', source.description),
        leaf('cbc:Name', source.name),
        source.sellerItemId
          ? el('cac:SellersItemIdentification', null, leaf('cbc:ID', source.sellerItemId))
          : null,
        source.classification
          ? el(
              'cac:CommodityClassification',
              null,
              leaf('cbc:ItemClassificationCode', source.classification.code, {
                listID: source.classification.scheme,
              }),
            )
          : null,
        taxCategory('cac:ClassifiedTaxCategory', line.category, line.rate),
        source.attributes.map((attribute) =>
          el(
            'cac:AdditionalItemProperty',
            null,
            leaf('cbc:Name', attribute.name),
            leaf('cbc:Value', attribute.value),
          ),
        ),
      ),
      el(
        'cac:Price',
        null,
        leaf('cbc:PriceAmount', toPlain(dec(source.netPrice)), { currencyID: currency }),
        source.priceBaseQuantity
          ? leaf('cbc:BaseQuantity', toPlain(dec(source.priceBaseQuantity)), {
              unitCode: source.unitCode,
            })
          : null,
      ),
    );
  });

  const document = el(
    root,
    { xmlns: NS[root], 'xmlns:cac': NS.cac, 'xmlns:cbc': NS.cbc },
    header,
    documentAllowances,
    taxTotals,
    monetary,
    lines,
  );
  if (!document) throw new Error('Празен документ');
  return renderXml(document);
}
