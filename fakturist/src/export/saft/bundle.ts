import { calculate } from '../../einvoice/calculate.js';
import type { PartyInput } from '../../einvoice/model.js';
import { renderXml, type XmlElement } from '../../einvoice/xml.js';
import { customersXml, productsXml, taxTableXml, uomTableXml, type SaftProduct } from './master.js';
import type { SaftAccounts, SaftBalance, SaftCodes, SaftDocument } from './model.js';
import { saftLines } from './lines.js';
import { salesInvoices, type SalesResult } from './sales.js';

/**
 * Пакетът за месеца: SalesInvoices + номенклатурите, които фактурите ползват, всеки като отделен XML с
 * корен — глобалния елемент от XSD 1.0.3. Без нито един документ за месеца — нищо (схемата иска поне една
 * фактура и поне един запис във всяка номенклатура).
 */
/** Идентификатор за сравнение: без интервали, главни букви, без „BG“ пред цифрите (ДДС номер = ЕИК). */
export const compactId = (value: string | undefined): string =>
  (value ?? '')
    .replace(/\s+/g, '')
    .toUpperCase()
    .replace(/^BG(?=\d)/, '');

export interface SaftFile {
  name: string;
  xml: string;
}

export interface SaftBundle {
  files: SaftFile[];
  included: number;
  manual: SalesResult['manual'];
  customers: number;
  products: number;
}

export function saftBundle(input: {
  documents: readonly SaftDocument[];
  balances: ReadonlyMap<string, SaftBalance>;
  accounts: SaftAccounts;
  codes: SaftCodes;
  /** ЕИК / ДДС номера / идентификатори на свързаните лица (както ги е въвела фирмата). */
  relatedParties: readonly string[];
}): SaftBundle {
  const { accounts, codes } = input;
  const sales = salesInvoices({ documents: input.documents, accounts, codes });
  if (sales.included.length === 0) {
    return { files: [], included: 0, manual: sales.manual, customers: 0, products: 0 };
  }

  // Последните данни на клиента в месеца (документите са подредени по дата на издаване).
  const parties = new Map<string, PartyInput>();
  const products = new Map<string, SaftProduct>();
  const groups: SaftProduct[] = [];
  for (const doc of sales.included) {
    parties.set(codes.customerId(doc.input.buyer), doc.input.buyer);
    for (const line of saftLines(doc.input, calculate(doc.input))) {
      const product: SaftProduct = {
        code: line.code,
        description: line.description,
        commodityCode: line.commodityCode,
        unitCode: line.unitCode,
        category: line.category,
        rate: line.rate,
        exemption: line.exemption,
      };
      if (!products.has(line.code)) products.set(line.code, product);
      groups.push(product);
    }
  }

  const related = new Set(input.relatedParties.map(compactId).filter(Boolean));
  const customers = [...parties].map(([id, party]) => ({
    id,
    party,
    balance: input.balances.get(id) ?? { openingCents: 0n, closingCents: 0n },
    related: [party.legalId, party.vatId, party.identifier].some((x) => {
      const key = compactId(x);
      return key !== '' && related.has(key);
    }),
  }));
  const productList = [...products.values()];
  const roots: Array<[string, XmlElement | null]> = [
    ['SalesInvoices.xml', sales.xml],
    ['Customers.xml', customersXml(customers, accounts.receivable, codes)],
    ['Products.xml', productsXml(productList, codes)],
    ['TaxTable.xml', taxTableXml(groups, codes)],
    [
      'UOMTable.xml',
      uomTableXml(
        productList.map((p) => p.unitCode),
        codes,
      ),
    ],
  ];
  return {
    files: roots.flatMap(([name, root]) => (root ? [{ name, xml: renderXml(root) }] : [])),
    included: sales.included.length,
    manual: sales.manual,
    customers: customers.length,
    products: productList.length,
  };
}
