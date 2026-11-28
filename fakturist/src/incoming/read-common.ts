import type { XmlNode } from '../xml/parse.js';
import { child, children, textAt } from '../xml/parse.js';

/**
 * Общото на разчитането на входящи е-фактури (SPEC 55): числата като десетичен текст без излишни нули
 * (никога float), датите — „ГГГГ-ММ-ДД“ (CII формат 102 „ГГГГММДД“ се превежда).
 */
export interface DeclaredTotals {
  lineExtension?: string;
  taxExclusive?: string;
  taxInclusive?: string;
  vat?: string;
  allowances?: string;
  charges?: string;
  prepaid?: string;
  rounding?: string;
  payable?: string;
  /** BT-111 — ДДС във валутата за отчитане (евро), когато фактурата е в друга валута. */
  vatEur?: string;
}

export interface ReadResult {
  format: 'UBL' | 'CII';
  /** Входът по модела на EN 16931 (src/einvoice/model.ts) — проверява се със zod и правилата. */
  input: Record<string, unknown>;
  declared: DeclaredTotals;
}

export class NotAnInvoice extends Error {
  constructor() {
    super('Файлът не е фактура по UBL 2.1 или CII');
  }
}

/** „100.00“ → „100“, „20.50“ → „20.5“, „ - 3.10 “ → „-3.1“; не-число остава (zod/правилата го хващат). */
export function num(value: string | undefined): string | undefined {
  const v = value?.trim();
  if (!v) return undefined;
  if (!/^-?\d+(\.\d+)?$/.test(v)) return v;
  if (!v.includes('.')) return v;
  const trimmed = v.replace(/0+$/, '').replace(/\.$/, '');
  return trimmed === '-0' ? '0' : trimmed;
}

export function numAt(node: XmlNode | undefined, path: string): string | undefined {
  return num(textAt(node, path));
}

/** „20261113“ (CII 102) или „2026-11-13“ → „2026-11-13“. */
export function isoDate(value: string | undefined): string | undefined {
  const v = value?.trim();
  if (!v) return undefined;
  if (/^\d{8}$/.test(v)) return `${v.slice(0, 4)}-${v.slice(4, 6)}-${v.slice(6, 8)}`;
  return v.slice(0, 10);
}

export function texts(node: XmlNode | undefined, name: string): string[] {
  return children(node, name)
    .map((c) => c.text.trim())
    .filter(Boolean);
}

/** Обект без празните полета — zod `.optional()` иска липса, не undefined като стойност в JSON. */
export function compact<T extends Record<string, unknown>>(value: T): T | undefined {
  const entries = Object.entries(value).filter(([, v]) => v !== undefined && v !== '');
  return entries.length ? (Object.fromEntries(entries) as T) : undefined;
}

export function attr(node: XmlNode | undefined, path: string, name: string): string | undefined {
  let current = node;
  for (const part of path.split('/')) current = child(current, part);
  return current?.attrs[name];
}
