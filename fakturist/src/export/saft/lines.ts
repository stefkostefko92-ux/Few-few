import type { Calculated } from '../../einvoice/calculate.js';
import type { VatCategory } from '../../einvoice/codes.js';
import { dec, divRound, neg, type Dec } from '../../einvoice/decimal.js';
import { el, leaf, type XmlElement } from '../../einvoice/xml.js';
import type { AddressInput, InvoiceInput } from '../../einvoice/model.js';
import { clip, DOCUMENT_ALLOWANCE, DOCUMENT_CHARGE, productCode } from './keys.js';

/** AddressStructure — редът е по XSD: StreetName, AdditionalAddressDetail, City, PostalCode, Country. */
export function addressXml(name: string, address: AddressInput): XmlElement | null {
  return el(
    name,
    null,
    leaf('StreetName', clip(address.street, 70)),
    leaf('AdditionalAddressDetail', clip(address.additionalStreet, 70)),
    leaf('City', clip(address.city, 35)),
    leaf('PostalCode', clip(address.postalCode, 18)),
    leaf('Country', address.countryCode),
  );
}

export interface SaftLine {
  code: string;
  /** Кодът по Хармонизираната система (BT-158, схема „HS“), ако редът го има. */
  commodityCode: string | undefined;
  description: string;
  productDescription: string | undefined;
  quantity: Dec;
  unitCode: string;
  unitPrice: Dec;
  net: Dec;
  category: VatCategory;
  rate: Dec | null;
}

/** Редовете на документа + отстъпката/надбавката на ниво документ като отделни редове. */
export function saftLines(input: InvoiceInput, calc: Calculated): SaftLine[] {
  const lines: SaftLine[] = input.lines.map((line, i) => {
    const computed = calc.lines[i]!;
    const base = line.priceBaseQuantity ? dec(line.priceBaseQuantity) : null;
    return {
      code: productCode(line),
      commodityCode: line.classification?.scheme === 'HS' ? line.classification.code : undefined,
      description: clip(line.name, 256),
      productDescription: line.description ? clip(line.description, 256) : undefined,
      quantity: dec(line.quantity),
      unitCode: line.unitCode,
      unitPrice: base ? divRound(dec(line.netPrice), base, 6) : dec(line.netPrice),
      net: computed.net,
      category: computed.category,
      rate: computed.rate,
    };
  });
  for (const ac of calc.allowanceCharges) {
    lines.push({
      code: ac.isCharge ? DOCUMENT_CHARGE : DOCUMENT_ALLOWANCE,
      commodityCode: undefined,
      description: clip(ac.reason ?? (ac.isCharge ? 'Надбавка' : 'Отстъпка'), 256),
      productDescription: undefined,
      quantity: dec('1'),
      unitCode: 'C62',
      unitPrice: ac.amount,
      net: ac.isCharge ? ac.amount : neg(ac.amount),
      category: ac.category,
      rate: ac.rate,
    });
  }
  return lines;
}
