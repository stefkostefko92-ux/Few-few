import { dec, toFixed, toPlain, type Dec } from '../einvoice/decimal.js';
import type { PartyInput } from '../einvoice/model.js';

/** Текстовете и форматирането на PDF-а — едни и същи във всеки изглед (pdf.ts). */
export const TITLES: Record<string, string> = {
  '380': 'ФАКТУРА',
  '381': 'КРЕДИТНО ИЗВЕСТИЕ',
  '383': 'ДЕБИТНО ИЗВЕСТИЕ',
  '384': 'КОРИГИРАЩА ФАКТУРА',
  '386': 'АВАНСОВА ФАКТУРА',
  '389': 'САМОФАКТУРА',
};

export const MEANS: Record<string, string> = {
  '10': 'в брой',
  '30': 'банков превод',
  '31': 'дебитен превод',
  '42': 'по банкова сметка',
  '48': 'банкова карта',
  '49': 'директен дебит',
  '57': 'постоянно нареждане',
  '58': 'SEPA превод',
  '59': 'SEPA директен дебит',
  '68': 'онлайн плащане',
  '97': 'прихващане',
};

/** Мерните единици на български (UN/ECE Rec. 20); непознат код се показва както е. */
export const UNITS: Record<string, string> = {
  C62: 'бр.',
  H87: 'бр.',
  HUR: 'ч',
  DAY: 'ден',
  WEE: 'седм.',
  MON: 'мес.',
  ANN: 'год.',
  MIN: 'мин',
  KGM: 'кг',
  GRM: 'г',
  TNE: 'т',
  MTR: 'м',
  KMT: 'км',
  MTK: 'м²',
  MTQ: 'м³',
  LTR: 'л',
  KWH: 'kWh',
  SET: 'компл.',
  PR: 'чифт',
  LS: 'общо',
  E48: 'услуга',
};

/** „1 234,50“ — групи по три с неразделим интервал, десетична запетая (българският запис). */
export function bgAmount(value: Dec): string {
  const [whole = '0', fraction = '00'] = toFixed(value, 2).split('.');
  const negative = whole.startsWith('-');
  const digits = negative ? whole.slice(1) : whole;
  const grouped = digits.replace(/\B(?=(\d{3})+(?!\d))/g, '\u00a0');
  return `${negative ? '−' : ''}${grouped},${fraction}`;
}

/** Единичната цена: поне 2 знака след запетаята, повече — само ако ги има („12,50“, „4,995“). */
export function unitPrice(text: string): string {
  const value = dec(text);
  return value.s <= 2 ? bgAmount(value) : toPlain(value).replace('.', ',');
}

export function bgDate(iso: string | undefined): string {
  if (!iso) return '';
  const [y, m, d] = iso.split('-');
  return `${d}.${m}.${y}`;
}

export function partyLines(party: PartyInput): string[] {
  const address = [
    party.address.street,
    party.address.additionalStreet,
    [party.address.postalCode, party.address.city].filter(Boolean).join(' '),
    party.address.countryCode !== 'BG' ? party.address.countryCode : undefined,
  ]
    .filter(Boolean)
    .join(', ');
  return [
    party.legalId ? `ЕИК: ${party.legalId}` : '',
    party.vatId ? `ДДС №: ${party.vatId}` : '',
    address,
  ].filter(Boolean);
}
