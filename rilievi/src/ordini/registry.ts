import { ARGANI, MOVILIFT, PELAZZA, SG, type Modulo } from './moduli.js';

/**
 * Кой модул към кое поле на картата: марката, при която се отваря (ако модулът е на една марка),
 * колоната в базата (JSON), въпросът „Sì/No“ и префиксът на полетата му във формата. Пътят на PDF-а е
 * `/schede/:id/<path>`. Таблото има два модула в една колона и под един въпрос — Pelazza и MoviLift;
 * марката е една, затова отворен е най-много единият. Листът с данни за аргано (за всеки вид аргано) и
 * листът на 2SG за оператора и окачванията са без марка.
 */
/**
 * Префиксът във формата: `oq` — таблото Pelazza, `om` — таблото MoviLift, `pa` — листът за аргано,
 * `sg` — листът на 2SG.
 */
export type Prefisso = 'oq' | 'om' | 'pa' | 'sg';

export interface ModuloSlot {
  /** Марката, при която модулът се отваря; без нея — при всяка. */
  marca?: { field: 'quadroMarca'; value: string };
  column: 'ordineQuadro' | 'preventivoArgano' | 'ordineSospensioni';
  question: 'quadroOrdine' | 'arganoPreventivo' | 'sospensioni';
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
    column: 'preventivoArgano',
    question: 'arganoPreventivo',
    prefix: 'pa',
    path: 'dati-argano',
    modulo: ARGANI,
  },
  {
    column: 'ordineSospensioni',
    question: 'sospensioni',
    prefix: 'sg',
    path: 'sospensioni-2sg',
    modulo: SG,
  },
];

/** Марките, при които въпросът на колоната се задава (fields.ts, `when`); празно — без условие. */
export function marcheOf(question: ModuloSlot['question']): string[] {
  return SLOTS.flatMap((slot) =>
    slot.question === question && slot.marca ? [slot.marca.value] : [],
  );
}

/**
 * Модулът е отворен: въпросът му се вижда (`active`, полетата с условие), отговорът е „Sì“ и марката е
 * неговата (ако има марка). `valueOf` чете от формата (низове) или от записаната карта (true за „Sì“).
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
    (!slot.marca || valueOf(slot.marca.field) === slot.marca.value)
  );
}
