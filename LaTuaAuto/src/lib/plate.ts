// Италиански регистрационни номера — нормализация и валидация.
//
// Формати (Codice della Strada / DM 1994 и следващи):
//  - Автомобили от 1994: AA 000 AA (две букви, три цифри, две букви).
//    Изключени букви: I, O, Q, U (за да не се бъркат с 1, 0, V).
//  - Мотоциклети от 1999: AA 00000 (две букви, пет цифри).
//  - Ремаркета от 2013: XA 000 AA (първата е X).
//  - Стари формати (провинция + число, напр. MI 123456) — приемаме ги като
//    „legacy“, без строга проверка, само за ръчно потвърждаване.
//
// Табелата е ЛИЧНА ДАННА — никога не се логва сурова; за търсене се ползва
// plateHash (виж plate-hash.ts — само сървър; този модул е споделен с клиента).

export type PlateKind = 'AUTO' | 'MOTO' | 'RIMORCHIO' | 'LEGACY';

export interface ParsedPlate {
  normalized: string; // без интервали, главни букви — напр. „AB123CD“
  display: string; // с интервали както на табелата — „AB 123 CD“
  kind: PlateKind;
}

const FORBIDDEN_LETTERS = /[IOQU]/;
const AUTO_RE = /^([A-Z]{2})(\d{3})([A-Z]{2})$/;
const MOTO_RE = /^([A-Z]{2})(\d{5})$/;
const RIMORCHIO_RE = /^(X[A-Z])(\d{3})([A-Z]{2})$/;
const LEGACY_RE = /^([A-Z]{2})(\d{5,6})$/;

/** Премахва интервали/тирета/точки, латинизира и вдига в главни букви. */
export function normalizePlate(input: string): string {
  return input
    .normalize('NFKD')
    .replace(/[^A-Za-z0-9]/g, '')
    .toUpperCase();
}

/** Парсва табела; връща null при невалиден формат. */
export function parsePlate(input: string): ParsedPlate | null {
  const normalized = normalizePlate(input);
  if (normalized.length < 7 || normalized.length > 8) return null;

  const rimorchio = RIMORCHIO_RE.exec(normalized);
  if (rimorchio) {
    const [, a, n, b] = rimorchio;
    if (FORBIDDEN_LETTERS.test(`${a}${b}`)) return null;
    return { normalized, display: `${a} ${n} ${b}`, kind: 'RIMORCHIO' };
  }

  const auto = AUTO_RE.exec(normalized);
  if (auto) {
    const [, a, n, b] = auto;
    if (FORBIDDEN_LETTERS.test(`${a}${b}`)) return null;
    return { normalized, display: `${a} ${n} ${b}`, kind: 'AUTO' };
  }

  const moto = MOTO_RE.exec(normalized);
  if (moto) {
    const [, a, n] = moto;
    if (FORBIDDEN_LETTERS.test(a ?? '')) return null;
    return { normalized, display: `${a} ${n}`, kind: 'MOTO' };
  }

  const legacy = LEGACY_RE.exec(normalized);
  if (legacy) {
    const [, a, n] = legacy;
    return { normalized, display: `${a} ${n}`, kind: 'LEGACY' };
  }

  return null;
}

export function isValidPlate(input: string): boolean {
  return parsePlate(input) !== null;
}

/** Маскира табела за логове/UI към трети лица: „AB 1•• ••“. */
export function maskPlate(input: string): string {
  const parsed = parsePlate(input);
  if (!parsed) return '•••';
  const n = parsed.normalized;
  return `${n.slice(0, 3)}${'•'.repeat(Math.max(0, n.length - 3))}`;
}
