import { ARGANI, MASTECH_NG120, MASTECH_QI, MOVILIFT, PELAZZA, SG, type Modulo } from './moduli.js';

/**
 * Кой модул към кое поле на картата: марката, при която се отваря (ако модулът е на една марка),
 * колоната в базата (JSON), въпросът „Sì/No“ и префиксът на полетата му във формата. Пътят на PDF-а е
 * `/schede/:id/<path>`. Таблото има четири модула в една колона и под един въпрос — Pelazza, MoviLift и
 * двата на Mastech (NG120 и QI Touch — по втория избор, модела); марката и моделът са по един, затова
 * отворен е най-много единият. Листът с данни за аргано (за всеки вид аргано) и листът на 2SG за
 * оператора и окачванията са без марка.
 */
/**
 * Префиксът във формата: `oq` — таблото Pelazza, `om` — таблото MoviLift, `mn` и `mq` — таблото
 * Mastech NG120 и QI Touch, `pa` — листът за аргано, `sg` — листът на 2SG.
 */
export type Prefisso = 'oq' | 'om' | 'mn' | 'mq' | 'pa' | 'sg';

export interface ModuloSlot {
  /** Марката, при която модулът се отваря; без нея — при всяка. */
  marca?: { field: 'quadroMarca'; value: string };
  /** И моделът на таблото под марката (Mastech: NG120 или QI Touch). */
  modello?: { field: 'quadroModello'; value: string };
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
    marca: { field: 'quadroMarca', value: 'MASTECH' },
    modello: { field: 'quadroModello', value: 'NG120' },
    column: 'ordineQuadro',
    question: 'quadroOrdine',
    prefix: 'mn',
    path: 'ordine-quadro-mastech-ng120',
    modulo: MASTECH_NG120,
  },
  {
    marca: { field: 'quadroMarca', value: 'MASTECH' },
    modello: { field: 'quadroModello', value: 'QI_TOUCH' },
    column: 'ordineQuadro',
    question: 'quadroOrdine',
    prefix: 'mq',
    path: 'ordine-quadro-mastech-qi-touch',
    modulo: MASTECH_QI,
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

/**
 * Колоните на модулите (таблото — каквато и да е марка, листът за аргано, 2SG) в реда на слотовете: това
 * се избира поотделно за печата и PDF-а на картата (src/schede/stampa.ts).
 */
export const COLONNE: readonly ModuloSlot['column'][] = [
  ...new Set(SLOTS.map((slot) => slot.column)),
];

/** Изборите на картата, при които модулът се отваря: марката, после моделът (изгледът — обвивка за всеки). */
export function sceltaDi(slot: ModuloSlot): Array<{ field: string; value: string }> {
  return [slot.marca, slot.modello].filter((c): c is NonNullable<typeof c> => c !== undefined);
}

/** Марките, при които въпросът на колоната се задава (fields.ts, `when`); празно — без условие. */
export function marcheOf(question: ModuloSlot['question']): string[] {
  return [
    ...new Set(
      SLOTS.flatMap((slot) => (slot.question === question && slot.marca ? [slot.marca.value] : [])),
    ),
  ];
}

/** Записаната карта е избрала марката и модела на модула (без въпроса — него проверява викащият). */
export function sceltoNellaScheda(slot: ModuloSlot, valueOf: (key: string) => unknown): boolean {
  return sceltaDi(slot).every((c) => valueOf(c.field) === c.value);
}

/**
 * Модулът е отворен: въпросът му се вижда (`active`, полетата с условие), отговорът е „Sì“ и марката и
 * моделът са неговите (ако има). Моделът е поле с условие — броят се само видимият. `valueOf` чете от
 * формата (низове) или от записаната карта (true за „Sì“).
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
    sceltoNellaScheda(slot, valueOf) &&
    (!slot.modello || active.has(slot.modello.field))
  );
}

/**
 * „Sì“ на поръчката при марка с модели, но без избран модел (Mastech без NG120 / QI Touch): няма кой
 * модул да се отвори — полето на модела, което липсва, иначе null.
 */
export function modelloMancante(
  active: ReadonlySet<string>,
  valueOf: (key: string) => unknown,
): string | null {
  const slot = SLOTS.find(
    (s) =>
      s.modello &&
      active.has(s.question) &&
      active.has(s.modello.field) &&
      valueOf(s.question) === 'si' &&
      (!s.marca || valueOf(s.marca.field) === s.marca.value),
  );
  if (!slot?.modello) return null;
  const chosen = valueOf(slot.modello.field);
  return typeof chosen === 'string' && chosen !== '' ? null : slot.modello.field;
}
