import { createHash } from 'node:crypto';

/**
 * Ключовете, които свързват фрагментите: един артикул — един `ProductCode` в редовете и в Products.
 * Дължините са по XSD (SAFmiddle1text — 35 знака, SAFmiddle2text — 70, SAFlongtext — 256).
 */
export const shortHash = (text: string) =>
  createHash('sha256').update(text).digest('hex').slice(0, 16).toUpperCase();

/** Текст в границата на типа — по знаци, без управляващи. */
export function clip(text: string | undefined, max: number): string {
  const clean = [...(text ?? '').replace(/[\u0000-\u001f]+/g, ' ').trim()];
  return clean.slice(0, max).join('');
}

/** Кодът на артикула от доставчика (BT-155), иначе отпечатък на името, мярката и категорията. */
export function productCode(line: {
  sellerItemId?: string | undefined;
  name: string;
  unitCode: string;
  vat: { category: string; rate?: string | undefined };
}): string {
  if (line.sellerItemId) return clip(line.sellerItemId, 70);
  return `P-${shortHash(`${line.name}|${line.unitCode}|${line.vat.category}|${line.vat.rate ?? ''}`)}`;
}

/** Псевдоартикулите за отстъпка и надбавка на ниво документ (BG-20/BG-21). */
export const DOCUMENT_ALLOWANCE = 'FKT-DISCOUNT';
export const DOCUMENT_CHARGE = 'FKT-CHARGE';
