/**
 * Клетка на CSV за електронна таблица. Разделителите и кавичките се ограждат, а водещите `= + - @`,
 * табулация и нов ред на каретка се неутрализират с апостроф — иначе име на контрагент като
 * `=HYPERLINK(…)` става формула в Excel/LibreOffice (CWE-1236). Числата се пишат от нас (`cents`) и
 * минават през същата функция: отрицателна сума остава число, защото е само цифри след знака.
 */
const FORMULA_START = /^[=+\-@\t\r]/;
const NUMBER = /^-?\d+(\.\d+)?$/;

export function csvCell(value: string): string {
  const safe = FORMULA_START.test(value) && !NUMBER.test(value) ? `'${value}` : value;
  return /[",\n\r;]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}
