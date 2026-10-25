// Логика на етикетния лист без DOM — серийни номера, списъци, разпределение
// по листове. Тества се с node:test (виж __tests__/labels.test.ts).

import { MAX_SHEETS } from "@/lib/print";

export interface NumberFormat {
  prefix: string;
  suffix: string;
  /** Минимален брой цифри — 7 с pad 4 → „0007“. 0 = без водещи нули. */
  pad: number;
}

/** „№ 7“, „INV-0007“, „7/2026“… */
export function formatNumber(n: number, f: NumberFormat): string {
  const digits = f.pad > 0 ? String(n).padStart(f.pad, "0") : String(n);
  return `${f.prefix}${digits}${f.suffix}`;
}

/** Номерът на етикет с пореден индекс i (от 0). */
export function nthNumber(start: number, step: number, i: number): number {
  return start + i * step;
}

/**
 * Ред от списъка → [първи ред, втори ред]. Разделител е „|“ ИЛИ табулация —
 * табулацията е това, което идва при поставяне на две колони от Excel /
 * Google Sheets, затова таблица се поставя направо, без преправяне.
 */
export function splitLine(line: string): [string, string] {
  const m = /\s*[|\t]\s*/.exec(line);
  if (!m) return [line.trim(), ""];
  return [line.slice(0, m.index).trim(), line.slice(m.index + m[0].length).trim()];
}

/**
 * „{N}“ в стойност (баркод) → номерът на етикета. Без шаблона стойността е
 * една и съща за всички етикети.
 */
export function fillNumber(template: string, digits: string): string {
  return template.replace(/\{N\}/g, digits);
}

export interface SheetCell {
  /** Позиция в решетката на листа (0…total-1). */
  cell: number;
  /** Пореден номер на етикета в цялата серия (0…). */
  index: number;
}

/**
 * Кои клетки на кои листове се печатат. Първият лист започва от `skip`
 * (начеван лист), следващите са пълни. `count` = колко етикета общо.
 * Таванът MAX_SHEETS пази браузъра от стотици листове наведнъж.
 */
export function layoutSheets(count: number, perSheet: number, skip: number): SheetCell[][] {
  if (perSheet <= 0 || count <= 0) return [];
  const start = Math.min(Math.max(0, skip), perSheet - 1);
  const sheets: SheetCell[][] = [];
  let index = 0;
  for (let sheet = 0; index < count && sheet < MAX_SHEETS; sheet++) {
    const cells: SheetCell[] = [];
    for (let cell = sheet === 0 ? start : 0; cell < perSheet && index < count; cell++) {
      cells.push({ cell, index: index++ });
    }
    sheets.push(cells);
  }
  return sheets;
}
