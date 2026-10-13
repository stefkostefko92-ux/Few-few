import { MONTANARI, MOVILIFT, PELAZZA, type Modulo } from './moduli.js';

/**
 * Кой модул на доставчик към кое поле на картата: марката, при която се отваря, колоната в базата
 * (JSON), въпросът „Sì/No“ и префиксът на полетата му във формата. Пътят на PDF-а е
 * `/schede/:id/<path>`. Таблото има два модула в една колона и под един въпрос — Pelazza и MoviLift;
 * марката е една, затова отворен е най-много единият.
 */
/** Префиксът във формата: `oq` — таблото Pelazza, `om` — таблото MoviLift, `pa` — аргано Montanari. */
export type Prefisso = 'oq' | 'om' | 'pa';

export interface ModuloSlot {
  marca: { field: 'quadroMarca' | 'arganoMarca'; value: string };
  column: 'ordineQuadro' | 'preventivoArgano';
  question: 'quadroOrdine' | 'arganoPreventivo';
  prefix: Prefisso;
  path: string;
  modulo: Modulo;
}

export const SLOTS: readonly ModuloSlot[] = [
  {
    marca: { field: 'quadroMarca', value: 'PELAZZA' },
    column: 'ordineQuadro',
    question: 'quadroOrdine',
    prefix: 'oq',
    path: 'ordine-quadro',
    modulo: PELAZZA,
  },
  {
    marca: { field: 'quadroMarca', value: 'MOVILIFT' },
    column: 'ordineQuadro',
    question: 'quadroOrdine',
    prefix: 'om',
    path: 'ordine-quadro-movilift',
    modulo: MOVILIFT,
  },
  {
    marca: { field: 'arganoMarca', value: 'MONTANARI' },
    column: 'preventivoArgano',
    question: 'arganoPreventivo',
    prefix: 'pa',
    path: 'preventivo-argano',
    modulo: MONTANARI,
  },
];

/** Марките, при които въпросът на колоната се задава (fields.ts, `when`). */
export function marcheOf(question: ModuloSlot['question']): string[] {
  return SLOTS.filter((slot) => slot.question === question).map((slot) => slot.marca.value);
}

/**
 * Модулът е отворен: въпросът му се вижда (`active`, полетата с условие), отговорът е „Sì“ и марката е
 * неговата. `valueOf` чете от формата (низове) или от записаната карта (true за „Sì“).
 */
export function slotAperto(
  slot: ModuloSlot,
  active: ReadonlySet<string>,
  valueOf: (key: string) => unknown,
): boolean {
  const answer = valueOf(slot.question);
  return (
    active.has(slot.question) &&
    (answer === 'si' || answer === true) &&
    valueOf(slot.marca.field) === slot.marca.value
  );
}
