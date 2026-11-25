import { toFixed, toPlain, type Dec } from './decimal.js';
import { el, leaf, type XmlElement } from './xml.js';
import type { CalculatedAllowanceCharge } from './calculate.js';
import type { AddressInput, PartyInput } from './model.js';

/** Части на сериализатора CII (cii.ts): пространствата от имена, датите, сумите, страните, отстъпките, периода. */
export const NS = {
  rsm: 'urn:un:unece:uncefact:data:standard:CrossIndustryInvoice:100',
  ram: 'urn:un:unece:uncefact:data:standard:ReusableAggregateBusinessInformationEntity:100',
  qdt: 'urn:un:unece:uncefact:data:standard:QualifiedDataType:100',
  udt: 'urn:un:unece:uncefact:data:standard:UnqualifiedDataType:100',
};

/** Дата във формат 102 (ГГГГММДД). */
export function date102(
  name: string,
  value: string | undefined,
  type: 'udt' | 'qdt' = 'udt',
): XmlElement | null {
  if (!value) return null;
  return el(name, null, leaf(`${type}:DateTimeString`, value.replace(/-/g, ''), { format: '102' }));
}

export function money(name: string, value: Dec, currency?: string): XmlElement | null {
  return leaf(name, toFixed(value, 2), currency ? { currencyID: currency } : undefined);
}

export function postal(input: AddressInput | undefined): XmlElement | null {
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

export function tradeParty(
  name: string,
  input: PartyInput,
  vatAllowed: boolean,
): XmlElement | null {
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

export function allowanceCharge(
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

export function billingPeriod(
  start: string | undefined,
  end: string | undefined,
): XmlElement | null {
  return el(
    'ram:BillingSpecifiedPeriod',
    null,
    date102('ram:StartDateTime', start),
    date102('ram:EndDateTime', end),
  );
}
