import { toFixed } from '../../einvoice/decimal.js';
import type { PartyInput } from '../../einvoice/model.js';
import { shortHash, clip } from './keys.js';
import type { SaftCodes } from './model.js';

/**
 * Кодовете от номенклатурите на НАП, които Фактурист ползва. Официалното Приложение 2 (xlsx) и
 * „Въпроси и отговори“ (ВиО) в. 2 не се отварят от nra.bg извън България — затова тук е САМО каквото е
 * сверено (Данъчника, 14.11.2026; не е данъчен съвет). Всичко останало връща null → документът е в
 * списъка „за ръчно“, никога наслуки. Сверка с официалния xlsx — задача на собственика (`docs/saf-t/`).
 *
 * - TaxCode 100211 (основа 20 %) и 100213 (основа 9 %): ВиО в. 2, S.TI.1 (дословно в
 *   saftcheck.bg/nap-otgovaria). TaxType „100“ — примерът в официален отговор на НАП за покупките
 *   („TaxType: 100 TaxCode: 100331“, пак там) и saft-bridge.com („35 кода от вид 100“).
 * - Z, K, G, E, AE: кодовете не са изписани никъде. НАП казва само, че кодовете по ЗДДС са „на база
 *   кодовете, посочени в Приложение №12 към ППЗДДС“ и за продажбите са от 100211 до 100233 — без
 *   таблицата (лист TAX-IMP) съответствието не се гадае. O („извън обхвата“ = 000/000000 по ВиО) не е еднозначно —
 *   във Фактурист „O“ е и мястото на изпълнение извън страната (колона 02-17/02-18 на дневника).
 * - InvoiceType 01/02/03: Nom_Invoice_Types е „на база видовете документи по ППЗДДС“ (Приложение 3,
 *   стр. 8); 02 = дебитно известие — ВиО в. 2, S.I.9; 01/03 — Приложение 12 към ППЗДДС. Авансовата
 *   фактура няма свой вид в ППЗДДС → 01 (както в дневника).
 * - CustomerID: 10 + ЕИК, 11 + ДДС номер от ЕС (с префикса на държавата), 12 + държава + регистров номер
 *   извън ЕС, 13 + ЕГН, 14 + държава + собствен код, 15 + собствен код; без „BG“ след 10
 *   (saftix.bg/errors.html; docs.erp.net — SAF-T Bulgaria, CustomerId).
 * - ProductCommodityCode (NC8_TARIC): „00000000“ — общият код за услуги, „0“ — неприложимост (ВиО в. 2,
 *   III.7 по safty.bg). Единица за време или „услуга“ (E48) → услуга (наемът също е услуга — чл. 9 ЗДДС).
 * - Мерни единици: H87 (брой) и HUR са в номенклатурата (ВиО MF.UOM.2; intrastat.bg: „бр.“ → H87);
 *   C62 не е намерен → H87. Останалите са кодове по UN/ECE Rec. 20 и минават както са.
 */
const EU_OTHER = new Set([
  'AT',
  'BE',
  'CY',
  'CZ',
  'DE',
  'DK',
  'EE',
  'ES',
  'FI',
  'FR',
  'GR',
  'HR',
  'HU',
  'IE',
  'IT',
  'LT',
  'LU',
  'LV',
  'MT',
  'NL',
  'PL',
  'PT',
  'RO',
  'SE',
  'SI',
  'SK',
]);

const TAX_CODES: Record<string, { code: string; description: string }> = {
  '20.00': { code: '100211', description: 'Облагаеми доставки със ставка 20 %' },
  '9.00': { code: '100213', description: 'Облагаеми доставки със ставка 9 %' },
};

const INVOICE_TYPES: Record<string, string> = {
  '380': '01',
  '386': '01',
  '383': '02',
  '381': '03',
};

const SERVICE_UNITS = new Set(['HUR', 'DAY', 'WEE', 'MON', 'ANN', 'MIN', 'E48']);

const compact = (value: string | undefined) =>
  value?.replace(/\s+/g, '').toUpperCase() || undefined;

/** Собствен код на лице без идентификатор — един и същ за едно и също име и държава. */
const ownCode = (party: PartyInput) => shortHash(`${party.name}|${party.address.countryCode}`);

/** ЕИК (9 или 13 цифри) или ЕГН (10) на българско лице — от BT-47/BT-46, иначе от ДДС номера без „BG“. */
function bulgarianId(party: PartyInput): string | undefined {
  const id =
    compact(party.legalId) ?? compact(party.identifier) ?? compact(party.vatId)?.replace(/^BG/, '');
  return id && /^(\d{9}|\d{10}|\d{13})$/.test(id) ? id : undefined;
}

export function nraCustomerId(party: PartyInput): string {
  const country = party.address.countryCode;
  if (country === 'BG') {
    const id = bulgarianId(party);
    if (id) return `${id.length === 10 ? '13' : '10'}${id}`;
    return `15${ownCode(party)}`;
  }
  const vat = compact(party.vatId);
  if (EU_OTHER.has(country) && vat)
    return clip(`11${/^[A-Z]{2}/.test(vat) ? vat : country + vat}`, 35);
  const registry = compact(party.legalId) ?? compact(party.identifier);
  if (!EU_OTHER.has(country) && (registry ?? vat))
    return clip(`12${country}${registry ?? vat}`, 35);
  return clip(`14${country}${registry ?? ownCode(party)}`, 35);
}

export const NRA_CODES: SaftCodes = {
  vatTaxType: '100',
  vatTaxCode(category, rate) {
    if (category !== 'S' || rate === null) return null;
    return TAX_CODES[toFixed(rate, 2)]?.code ?? null;
  },
  vatTaxDescription(taxCode) {
    return Object.values(TAX_CODES).find((t) => t.code === taxCode)?.description ?? taxCode;
  },
  invoiceType: (typeCode) => INVOICE_TYPES[typeCode] ?? null,
  customerId: nraCustomerId,
  registrationNumber(party) {
    if (party.address.countryCode === 'BG') return bulgarianId(party) ?? ownCode(party);
    return clip(
      compact(party.legalId) ?? compact(party.identifier) ?? compact(party.vatId) ?? ownCode(party),
      35,
    );
  },
  commodityCode(unitCode, hsCode) {
    if (SERVICE_UNITS.has(unitCode)) return '00000000';
    const cn = hsCode?.replace(/\s+/g, '');
    return cn && /^\d{8}$/.test(cn) ? cn : '0';
  },
  unitOfMeasure: (unitCode) => (unitCode === 'C62' ? 'H87' : unitCode),
};
