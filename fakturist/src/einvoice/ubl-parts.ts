import { toFixed, toPlain, type Dec } from './decimal.js';
import { el, leaf, type XmlElement } from './xml.js';
import type { CalculatedAllowanceCharge } from './calculate.js';
import type { AddressInput, PartyInput } from './model.js';

/** Части на сериализатора UBL (ubl.ts): пространствата от имена, сумите, адреса, страната, категорията ДДС, отстъпките, периода. */
export const NS = {
  Invoice: 'urn:oasis:names:specification:ubl:schema:xsd:Invoice-2',
  CreditNote: 'urn:oasis:names:specification:ubl:schema:xsd:CreditNote-2',
  cac: 'urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2',
  cbc: 'urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2',
};

export function amount(name: string, value: Dec, currency: string): XmlElement | null {
  return leaf(name, toFixed(value, 2), { currencyID: currency });
}

export function address(name: string, input: AddressInput | undefined): XmlElement | null {
  if (!input) return null;
  return el(
    name,
    null,
    leaf('cbc:StreetName', input.street),
    leaf('cbc:AdditionalStreetName', input.additionalStreet),
    leaf('cbc:CityName', input.city),
    leaf('cbc:PostalZone', input.postalCode),
    el('cac:Country', null, leaf('cbc:IdentificationCode', input.countryCode)),
  );
}

/**
 * Страна по сделката (BG-4 / BG-7). При категория O (не подлежи на ДДС) BR-O-02 забранява ДДС номера на
 * получателя като BT-48 — тогава той отива като идентификатор на страната (BT-46), за да остане във
 * фактурата, както изисква чл. 114, ал. 1, т. 8 ЗДДС.
 */
export function party(input: PartyInput, vatAllowed: boolean): XmlElement | null {
  const identifier = input.identifier ?? (!vatAllowed ? input.vatId : undefined);
  return el(
    'cac:Party',
    null,
    input.electronicAddress
      ? leaf('cbc:EndpointID', input.electronicAddress.value, {
          schemeID: input.electronicAddress.scheme,
        })
      : null,
    identifier ? el('cac:PartyIdentification', null, leaf('cbc:ID', identifier)) : null,
    input.tradingName ? el('cac:PartyName', null, leaf('cbc:Name', input.tradingName)) : null,
    address('cac:PostalAddress', input.address),
    vatAllowed && input.vatId
      ? el(
          'cac:PartyTaxScheme',
          null,
          leaf('cbc:CompanyID', input.vatId),
          el('cac:TaxScheme', null, leaf('cbc:ID', 'VAT')),
        )
      : null,
    el(
      'cac:PartyLegalEntity',
      null,
      leaf('cbc:RegistrationName', input.name),
      leaf('cbc:CompanyID', input.legalId),
    ),
    input.contact
      ? el(
          'cac:Contact',
          null,
          leaf('cbc:Name', input.contact.name),
          leaf('cbc:Telephone', input.contact.phone),
          leaf('cbc:ElectronicMail', input.contact.email),
        )
      : null,
  );
}

export function taxCategory(
  name: string,
  category: string,
  rate: Dec | null,
  extra: XmlElement[] = [],
) {
  return el(
    name,
    null,
    leaf('cbc:ID', category),
    rate !== null ? leaf('cbc:Percent', toPlain(rate)) : null,
    extra,
    el('cac:TaxScheme', null, leaf('cbc:ID', 'VAT')),
  );
}

export function allowanceCharge(
  item: CalculatedAllowanceCharge,
  currency: string,
  category?: { category: string; rate: Dec | null },
): XmlElement | null {
  return el(
    'cac:AllowanceCharge',
    null,
    leaf('cbc:ChargeIndicator', item.isCharge ? 'true' : 'false'),
    leaf('cbc:AllowanceChargeReasonCode', item.reasonCode),
    leaf(
      'cbc:AllowanceChargeReason',
      item.reason ?? (item.reasonCode ? undefined : item.isCharge ? 'Надбавка' : 'Отстъпка'),
    ),
    item.percent !== null ? leaf('cbc:MultiplierFactorNumeric', toPlain(item.percent)) : null,
    amount('cbc:Amount', item.amount, currency),
    item.baseAmount !== null ? amount('cbc:BaseAmount', item.baseAmount, currency) : null,
    category ? taxCategory('cac:TaxCategory', category.category, category.rate) : null,
  );
}

export function period(start: string | undefined, end: string | undefined): XmlElement | null {
  return el('cac:InvoicePeriod', null, leaf('cbc:StartDate', start), leaf('cbc:EndDate', end));
}
