/**
 * Таблиците от „RT-E MOD 10411-1“ на собственика (31 октомври 2026), лист „Funi“: въжетата за тяга на
 * TELCAL и DONATI (диаметър, сечение, минимално разрушително усилие, линейна маса) и мерките на веригите и
 * въжетата за компенсация. Въже без данни във файла (шестте нишки на DONATI) не е в списъка; друго въже —
 * `altro`, с данните на ръка. Ключът на въжето е постоянен: пази се в записаното изчисление.
 */

export interface Fune {
  id: string;
  marca: 'TELCAL' | 'DONATI';
  /** Диаметър, mm. */
  d: number;
  trefoli: number;
  /** Сечение, mm². */
  sezione: number;
  /** Минимално разрушително усилие, N. */
  rottura: number;
  /** Линейна маса, kg/m. */
  massa: number;
  formazione: string;
  classe: string;
}

const telcal = (
  d: number,
  trefoli: 6 | 8,
  sezione: number,
  massa: number,
  rottura: number,
): Fune => ({
  id: `telcal-${d}-${trefoli === 6 ? 114 : 152}`,
  marca: 'TELCAL',
  d,
  trefoli,
  sezione,
  rottura,
  massa,
  formazione: trefoli === 6 ? '6*19 + FC = 114 fili' : '8*19 + FC = 152 fili',
  classe: '1370/1770',
});

const donati = (d: number, sezione: number, massa: number, rottura: number): Fune => ({
  id: `donati-${d}-152`,
  marca: 'DONATI',
  d,
  trefoli: 8,
  sezione,
  rottura,
  massa,
  formazione: '8*19S + FC = 152 fili',
  classe: '1370/1770',
});

export const FUNI: readonly Fune[] = [
  telcal(8, 6, 26, 0.24, 33200),
  telcal(8, 8, 23, 0.22, 28100),
  telcal(9, 6, 32, 0.3, 42000),
  telcal(9, 8, 29, 0.28, 35600),
  telcal(10, 6, 40, 0.37, 51800),
  telcal(10, 8, 36, 0.34, 44000),
  telcal(11, 6, 48, 0.45, 62700),
  telcal(11, 8, 44, 0.42, 53200),
  telcal(12, 6, 57, 0.53, 74600),
  telcal(12, 8, 52, 0.49, 63300),
  telcal(13, 6, 67, 0.62, 87600),
  telcal(13, 8, 61, 0.58, 74300),
  telcal(15, 6, 90, 0.83, 117000),
  telcal(15, 8, 81, 0.77, 98900),
  telcal(16, 8, 92, 0.88, 113000),
  donati(8, 23.7, 0.22, 29400),
  donati(9, 27.9, 0.27, 37300),
  donati(10, 36.5, 0.34, 46000),
  donati(11, 44, 0.42, 55700),
  donati(12, 52.6, 0.51, 66200),
  donati(13, 58.2, 0.58, 77700),
  donati(16, 88.4, 0.87, 118000),
];

export const funeDi = (id: string): Fune | undefined => FUNI.find((f) => f.id === id);

/** Компенсацията: мярката (mm) и линейната маса (kg/m). */
export interface MisuraCompensazione {
  d: number;
  massa: number;
}

export const CATENE: readonly MisuraCompensazione[] = [
  { d: 5.4, massa: 0.5 },
  { d: 6.4, massa: 0.8 },
  { d: 7.5, massa: 1.1 },
  { d: 8, massa: 1.35 },
  { d: 10, massa: 2 },
  { d: 12, massa: 2.6 },
  { d: 14, massa: 3.5 },
  { d: 16, massa: 5.25 },
  { d: 20, massa: 8 },
];

export const FUNI_COMPENSAZIONE: readonly MisuraCompensazione[] = [
  { d: 8, massa: 0.22 },
  { d: 9, massa: 0.28 },
  { d: 10, massa: 0.34 },
  { d: 11, massa: 0.42 },
  { d: 12, massa: 0.49 },
  { d: 13, massa: 0.58 },
  { d: 14, massa: 0.67 },
  { d: 15, massa: 0.77 },
  { d: 16, massa: 0.88 },
  { d: 17, massa: 0.99 },
];
