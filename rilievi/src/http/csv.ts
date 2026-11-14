/**
 * CSV за Excel (точка D2): точка и запетая (италианският Excel), всяка клетка в кавички, CRLF и BOM — Excel чете
 * UTF-8 само с него. Клетка, която започва като формула (= + - @, таб, CR), получава апостроф отпред: написано от
 * някого не се изпълнява в таблицата на този, който отвори файла (CSV injection, OWASP).
 */

const FORMULA = /^[=+\-@\t\r]/;

export function cellaCsv(value: string | number | null | undefined): string {
  const testo = value === null || value === undefined ? '' : String(value);
  const sicuro = FORMULA.test(testo) ? `'${testo}` : testo;
  return `"${sicuro.replace(/"/g, '""')}"`;
}

export function righeCsv(
  intestazione: readonly string[],
  righe: ReadonlyArray<ReadonlyArray<string | number | null | undefined>>,
): string {
  const riga = (celle: ReadonlyArray<string | number | null | undefined>) =>
    `${celle.map(cellaCsv).join(';')}\r\n`;
  return `﻿${riga(intestazione)}${righe.map(riga).join('')}`;
}

/** Името на файла за сваляне: само букви, цифри и тирета, с деня. */
export const nomeCsv = (base: string, giorno: string): string =>
  `${base.replace(/[^a-z0-9-]+/gi, '-')}-${giorno}.csv`;
