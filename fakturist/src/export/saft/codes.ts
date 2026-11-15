import { toFixed } from '../../einvoice/decimal.js';
import type { PartyInput } from '../../einvoice/model.js';
import {
  annex2Part,
  DOMESTIC_REVERSE_163A,
  EU_SERVICES_ART_21_2,
  PLACE_ABROAD_ART_69_2,
  ZERO_RATE_SPECIAL,
} from '../journal-format.js';
import { shortHash, clip } from './keys.js';
import type { SaftCodes } from './model.js';

/**
 * Кодовете от номенклатурите на НАП — по Приложение № 2 към заповедта за SAF-T
 * (`docs/saf-t/SAF-T_BG_Structure_Definition_V_1.0.3.xlsx`, версия 1.0.3 от 13.10.2026 по листа Hist;
 * извадката е в `docs/saf-t/nomenclatures-1.0.3.json`, тестът сверява всеки код тук с нея) и „Въпроси и
 * отговори“ в. 2 (март 2026, `docs/saf-t/`). Не е данъчен съвет.
 *
 * - TaxType 100 + TaxCode от лист TAX-IMP. Кодовете за продажбите са полетата на дневника за продажбите
 *   (Приложение № 12 към ППЗДДС; ВиО в. 2, S.TI.1), затова разпределението е същото като в PRODAGBI.TXT
 *   (`sales-journal.ts`): S 20 % → 100211, S 9 % → 100213, Z по глава трета и G (износ, чл. 28) → 100214,
 *   K (ВОД) → 100215, Z по чл. 140, 146, 173 → 100216, E → 100219. AE/O — по члена в основанието (BT-120):
 *   чл. 21, ал. 2 → 100217 (поле 02-17), чл. 69, ал. 2 → 100218 (02-18); AE по чл. 163а с част I/II на
 *   Приложение № 2 → 100227/100228 (в PRODAGBI — само кодово поле, сумата за ръчно). Без член — null,
 *   документът е „за ръчно“.
 * - TaxRegistration/TaxType — номенклатурата VAT_TaxType: 100010 „регистрирано за целите на ДДС“.
 * - InvoiceType — Nom_Invoice_Types: 01 фактура (и авансова — ППЗДДС няма отделен вид), 02 дебитно,
 *   03 кредитно известие.
 * - CustomerID — MF.C.3: 10 + ЕИК; 11 + ДДС номер от ЕС с префикса (Гърция — EL: „11EL123456789“);
 *   12 + държава + номер извън ЕС; 13 + ЕГН/ЛНЧ; 14 + държава + собствен код; 15 + собствен код (и за
 *   лице, което не дава данни — ВиО в. 2).
 * - ProductCommodityCode — NC8_TARIC: КН8, „00000000“ — общата категория за услуги, „0“ — когато кодът по
 *   КН не е приложим. Единица за време и E48 → услуга (наемът също е услуга — чл. 9 ЗДДС).
 * - Мерни единици — Unit_Of_Measure: всички от интерфейса са в номенклатурата (C62 — „единица“) освен
 *   E48 („услуга“) → C62.
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

/** Описанията — дословно от лист TAX-IMP. */
export const VAT_SALES_CODES: Record<string, string> = {
  '100211': 'Данъчна основа на облагаемите доставки със ставка 20 %',
  '100213': 'ДО на облагаемите доставки със ставка 9 %',
  '100214': 'ДО на доставките със ставка 0 % по глава трета от ЗДДС',
  '100215': 'ДО на ВОД на стоки',
  '100216': 'Доставки по чл. 140, 146, 173, ал. 1 и 4 от ЗДДС',
  '100219': 'ДО на освободени доставки и освободените ВОП',
  '100217':
    'Данъчна основа на доставки на услуги по чл. 21, ал. 2 ЗДДС и чл. 22-24 от ЗДДС, с място на изпълнение на територията на друга държава членка',
  '100218':
    'Данъчна основа на доставки по чл. 69, ал. 2 ЗДДС, вкл. данъчна основа на доставките при условията на дистанционни продажби, с място на изпълнение на територията на друга държава членка',
  '100227':
    'Извършени доставки по чл. 163а или основа при начисляване на ДДС при получени доставки по чл. 163а по ЗДДС - Доставки по част I на приложение 2 от ЗДДС',
  '100228':
    'ДО на извършени доставки по чл. 163а или основа при начисляване на ДДС при получени доставки по чл. 163а по ЗДДС - Доставки по част II на приложение 2 от ЗДДС',
};

const STANDARD_RATES: Record<string, string> = { '20.00': '100211', '9.00': '100213' };

const INVOICE_TYPES: Record<string, string> = {
  '380': '01',
  '386': '01',
  '383': '02',
  '381': '03',
};

const SERVICE_UNITS = new Set(['HUR', 'DAY', 'WEE', 'MON', 'ANN', 'MIN', 'E48']);
/** Мерните единици на интерфейса, които ги няма в Unit_Of_Measure. */
const UNIT_REPLACEMENTS: Record<string, string> = { E48: 'C62' };

const compact = (value: string | undefined) =>
  value?.replace(/\s+/g, '').toUpperCase() || undefined;

/** Собствен код на лице без идентификатор — един и същ за едно и също име и държава. */
const ownCode = (party: PartyInput) => shortHash(`${party.name}|${party.address.countryCode}`);

/** ЕИК (9 или 13 цифри) или ЕГН/ЛНЧ (10) на българско лице — от BT-47/BT-46, иначе от ДДС номера без „BG“. */
function bulgarianId(party: PartyInput): string | undefined {
  const id =
    compact(party.legalId) ?? compact(party.identifier) ?? compact(party.vatId)?.replace(/^BG/, '');
  return id && /^(\d{9}|\d{10}|\d{13})$/.test(id) ? id : undefined;
}

/** Префиксът на ДДС номера в ЕС (ISO 3166-1, освен Гърция — EL). */
const vatPrefix = (country: string) => (country === 'GR' ? 'EL' : country);

export function nraCustomerId(party: PartyInput): string {
  const country = party.address.countryCode;
  if (country === 'BG') {
    const id = bulgarianId(party);
    if (id) return `${id.length === 10 ? '13' : '10'}${id}`;
    return `15${ownCode(party)}`;
  }
  const vat = compact(party.vatId);
  if (EU_OTHER.has(country)) {
    if (vat) return clip(`11${/^[A-Z]{2}/.test(vat) ? vat : vatPrefix(country) + vat}`, 35);
    return clip(`14${country}${ownCode(party)}`, 35);
  }
  const registry = compact(party.legalId) ?? compact(party.identifier) ?? vat;
  return clip(registry ? `12${country}${registry}` : `14${country}${ownCode(party)}`, 35);
}

export const NRA_CODES: SaftCodes = {
  vatTaxType: '100',
  vatRegistrationType: '100010',
  vatTaxCode(category, rate, exemptionReason) {
    switch (category) {
      case 'S':
        return rate === null ? null : (STANDARD_RATES[toFixed(rate, 2)] ?? null);
      case 'Z':
        return ZERO_RATE_SPECIAL.test(exemptionReason ?? '') ? '100216' : '100214';
      case 'G':
        return '100214';
      case 'K':
        return '100215';
      case 'E':
        return '100219';
      case 'AE':
      case 'O': {
        const reason = exemptionReason ?? '';
        if (EU_SERVICES_ART_21_2.test(reason)) return '100217';
        if (PLACE_ABROAD_ART_69_2.test(reason)) return '100218';
        if (category === 'AE' && DOMESTIC_REVERSE_163A.test(reason)) {
          const part = annex2Part(reason);
          return part === 'I' ? '100227' : part === 'II' ? '100228' : null;
        }
        return null;
      }
      default:
        return null;
    }
  },
  vatTaxDescription: (taxCode) => VAT_SALES_CODES[taxCode] ?? taxCode,
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
  unitOfMeasure: (unitCode) => UNIT_REPLACEMENTS[unitCode] ?? unitCode,
};
