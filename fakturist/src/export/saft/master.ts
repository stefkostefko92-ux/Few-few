import type { VatCategory } from '../../einvoice/codes.js';
import { fromCents, toFixed, type Dec } from '../../einvoice/decimal.js';
import type { PartyInput } from '../../einvoice/model.js';
import { el, leaf, type XmlElement } from '../../einvoice/xml.js';
import { UNITS } from '../../documents/pdf-format.js';
import { money } from './amounts.js';
import { clip } from './keys.js';
import { addressXml } from './lines.js';
import { SAFT_NAMESPACE, type SaftBalance, type SaftCodes } from './model.js';

/**
 * Номенклатурите към продажбите (XSD 1.0.3, MasterFiles): Customers, Products, TaxTable, UOMTable —
 * само записите, които фактурите от файла ползват. Всеки е глобален елемент на схемата и е корен на
 * свой файл; празен списък не се пише (схемата иска поне един запис).
 */
export interface SaftCustomer {
  id: string;
  party: PartyInput;
  balance: SaftBalance;
  /** Свързано лице — по списъка, който фирмата води в „Данни за SAF-T“ (Фактурист не го извежда сам). */
  related: boolean;
}

export interface SaftProduct {
  code: string;
  description: string;
  commodityCode: string | undefined;
  unitCode: string;
  category: VatCategory;
  rate: Dec | null;
  exemption: string | undefined;
}

const root = (name: string, children: Array<XmlElement | null>): XmlElement | null => {
  const kids = children.filter((c): c is XmlElement => c !== null);
  return kids.length ? { name, attrs: { xmlns: SAFT_NAMESPACE }, children: kids } : null;
};

/** Салдото: положително — дебитно, отрицателно — кредитно (XSD: сумата без знак в своя елемент). */
function balanceXml(kind: 'Opening' | 'Closing', cents: bigint): XmlElement | null {
  return cents >= 0n
    ? leaf(`${kind}DebitBalance`, money(fromCents(cents)))
    : leaf(`${kind}CreditBalance`, money(fromCents(-cents)));
}

export function customersXml(
  customers: readonly SaftCustomer[],
  receivableAccount: string,
  codes: SaftCodes,
): XmlElement | null {
  return root(
    'Customers',
    customers.map((c) =>
      el(
        'Customer',
        null,
        el(
          'CompanyStructure',
          null,
          leaf('RegistrationNumber', codes.registrationNumber(c.party)),
          leaf('Name', clip(c.party.name, 70)),
          addressXml('Address', c.party.address),
          c.party.vatId
            ? el(
                'TaxRegistration',
                null,
                leaf('TaxRegistrationNumber', clip(c.party.vatId.replace(/\s+/g, ''), 35)),
                leaf('TaxType', codes.vatRegistrationType),
              )
            : null,
          leaf('RelatedParty', c.related ? 'Y' : 'N'),
        ),
        leaf('CustomerID', c.id),
        leaf('AccountID', receivableAccount),
        balanceXml('Opening', c.balance.openingCents),
        balanceXml('Closing', c.balance.closingCents),
      ),
    ),
  );
}

export function productsXml(products: readonly SaftProduct[], codes: SaftCodes): XmlElement | null {
  return root(
    'Products',
    products.map((p) =>
      el(
        'Product',
        null,
        leaf('ProductCode', p.code),
        leaf('Description', clip(p.description, 256)),
        leaf('ProductCommodityCode', codes.commodityCode(p.unitCode, p.commodityCode)),
        // Мярката във Фактурист е кодът по UN/ECE Rec. 20 — UOMBase и UOMStandard са един и същ код, а
        // тогава коефициентът е 1 (MF.P.10: различни единици с коефициент 1 не се приемат).
        leaf('UOMBase', codes.unitOfMeasure(p.unitCode)),
        leaf('UOMStandard', codes.unitOfMeasure(p.unitCode)),
        leaf('UOMToUOMBaseConversionFactor', '1'),
        el(
          'Tax',
          null,
          leaf('TaxType', codes.vatTaxType),
          leaf('TaxCode', codes.vatTaxCode(p.category, p.rate, p.exemption)),
        ),
      ),
    ),
  );
}

export function taxTableXml(
  groups: ReadonlyArray<{ category: VatCategory; rate: Dec | null; exemption: string | undefined }>,
  codes: SaftCodes,
): XmlElement | null {
  const seen = new Map<string, XmlElement>();
  for (const g of groups) {
    const code = codes.vatTaxCode(g.category, g.rate, g.exemption);
    if (!code || seen.has(code)) continue;
    const details = el(
      'TaxCodeDetails',
      null,
      leaf('TaxCode', code),
      leaf('Description', clip(codes.vatTaxDescription(code), 256)),
      g.rate && g.category !== 'E' ? leaf('TaxPercentage', toFixed(g.rate, 2)) : null,
      leaf('Country', 'BG'),
    );
    if (details) seen.set(code, details);
  }
  if (seen.size === 0) return null;
  return root('TaxTable', [
    el(
      'TaxTableEntry',
      null,
      leaf('TaxType', codes.vatTaxType),
      leaf('Description', 'Данък върху добавената стойност'),
      [...seen.values()],
    ),
  ]);
}

export function uomTableXml(unitCodes: readonly string[], codes: SaftCodes): XmlElement | null {
  const entries = new Map<string, string>();
  for (const code of unitCodes) {
    const standard = codes.unitOfMeasure(code);
    if (!entries.has(standard)) entries.set(standard, UNITS[code] ?? code);
  }
  return root(
    'UOMTable',
    [...entries].map(([code, description]) =>
      el('UOMTableEntry', null, leaf('UnitOfMeasure', code), leaf('Description', description)),
    ),
  );
}
