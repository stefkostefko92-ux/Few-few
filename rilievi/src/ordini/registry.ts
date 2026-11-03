import {
  AMI_RTBS,
  ARGANI,
  DMG_FIXTURES,
  DMG_PITAGORA,
  EQ_GEARED,
  EQ_GEARLESS,
  EQ_OLEO,
  MASTECH_NG120,
  MASTECH_QI,
  MOVILIFT,
  PELAZZA,
  SG,
  type Modulo,
} from './moduli.js';

/**
 * Кой модул към кое поле на картата: марката, при която се отваря (ако модулът е на една марка),
 * колоната в базата (JSON), въпросът „Sì/No“ и префиксът на полетата му във формата. Пътят на PDF-а е
 * `/schede/:id/<path>`. Таблото има осем модула в една колона и под един въпрос — Pelazza, MoviLift, DMG,
 * двата на Mastech (NG120 и QI Touch — по втория избор, модела) и трите на Elettroquadri (по вида на
 * уредбата: електрическа — geared, MRL — gearless, хидравлична — oleodinamico); марката, моделът и
 * видът са по един, затова отворен е най-много единият. Листът с данни за аргано (за всеки вид аргано)
 * и листът на 2SG за оператора и окачванията са без марка. Листът на 2SG има два въпроса — „Sospensioni
 * da cambiare?“ при автоматични врати и „Operatore da cambiare?“ при автоматични и полуавтоматични — и
 * затова два слота (свой префикс и свой път на PDF-а) в една колона. Отворен е най-много единият: при
 * автоматични с „Sì“ и на двата листът е един — този на окачванията (слотът на оператора отстъпва,
 * `cede`). AMI 100 Mono RTBS (собственикът, 3 ноември 2026) — без въпрос „Sì/No“: отваря го отметката
 * „AMI 100 Mono RTBS“ в списъка на намаленото горно пространство или на намалената яма (`apertura`); Mono
 * UCM и въпросът „Installare AMI 100?“ са махнати. DMG (2
 * ноември 2026): таблото Pitagora 4.0 — осмият модул под въпроса на таблото; бутониерите (QF Fixtures) —
 * своя колона под „Vuoi compilare la scheda ordine bottoniere DMG?“ в раздела „Bottoniere“, без марка
 * (бутониерите се поръчват и при табло на друга марка).
 */
/**
 * Префиксът във формата: `oq` — таблото Pelazza, `om` — таблото MoviLift, `mn` и `mq` — таблото
 * Mastech NG120 и QI Touch, `eg`, `el` и `eo` — таблото Elettroquadri geared, gearless и oleodinamico,
 * `pa` — листът за аргано, `sg` и `so` — листът на 2SG (окачванията при автоматични врати, операторът при
 * автоматични и полуавтоматични), `ar` — AMI 100 Mono RTBS, `dp` — таблото DMG
 * (Pitagora 4.0), `db` — бутониерите DMG (QF Fixtures).
 */
export type Prefisso =
  'oq' | 'om' | 'dp' | 'mn' | 'mq' | 'eg' | 'el' | 'eo' | 'pa' | 'sg' | 'so' | 'ar' | 'db';

export interface ModuloSlot {
  /** Марката, при която модулът се отваря; без нея — при всяка. */
  marca?: { field: 'quadroMarca'; value: string };
  /** И моделът под марката (Mastech: NG120 или QI Touch). */
  modello?: { field: 'quadroModello'; value: string };
  /** И видът на уредбата (Elettroquadri: модулът се избира сам по него — собственикът, 30.10.2026). */
  impianto?: { field: 'tipoImpianto'; value: string };
  column:
    'ordineQuadro' | 'preventivoArgano' | 'ordineSospensioni' | 'ordineAmi' | 'ordineBottoniere';
  question:
    | 'quadroOrdine'
    | 'arganoPreventivo'
    | 'sospensioni'
    | 'operatore'
    | 'fossaInterventi'
    | 'bottoniereOrdine';
  /**
   * Модулът не се отваря с „Sì“ на въпроса, а с отметката `valore` в него или в някое от полетата `anche`
   * (AMI 100 Mono RTBS — в решенията на ямата или на горното пространство).
   */
  apertura?: { valore: string; anche: readonly string[] };
  /** Въпросът на друг слот в същата колона, който има предимство: при неговото видимо „Sì“ този е затворен. */
  cede?: ModuloSlot['question'];
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
    marca: { field: 'quadroMarca', value: 'DMG' },
    column: 'ordineQuadro',
    question: 'quadroOrdine',
    prefix: 'dp',
    path: 'ordine-quadro-dmg-pitagora',
    modulo: DMG_PITAGORA,
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
    marca: { field: 'quadroMarca', value: 'ELETTROQUADRI' },
    impianto: { field: 'tipoImpianto', value: 'ELETTRICO' },
    column: 'ordineQuadro',
    question: 'quadroOrdine',
    prefix: 'eg',
    path: 'ordine-quadro-elettroquadri-geared',
    modulo: EQ_GEARED,
  },
  {
    marca: { field: 'quadroMarca', value: 'ELETTROQUADRI' },
    impianto: { field: 'tipoImpianto', value: 'GEARLESS' },
    column: 'ordineQuadro',
    question: 'quadroOrdine',
    prefix: 'el',
    path: 'ordine-quadro-elettroquadri-gearless',
    modulo: EQ_GEARLESS,
  },
  {
    marca: { field: 'quadroMarca', value: 'ELETTROQUADRI' },
    impianto: { field: 'tipoImpianto', value: 'IDRAULICO' },
    column: 'ordineQuadro',
    question: 'quadroOrdine',
    prefix: 'eo',
    path: 'ordine-quadro-elettroquadri-oleodinamico',
    modulo: EQ_OLEO,
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
  {
    column: 'ordineSospensioni',
    question: 'operatore',
    cede: 'sospensioni',
    prefix: 'so',
    path: 'operatore-2sg',
    modulo: SG,
  },
  {
    column: 'ordineAmi',
    question: 'fossaInterventi',
    apertura: { valore: 'AMI100_RTBS', anche: ['testataInterventi'] },
    prefix: 'ar',
    path: 'ami100-mono-rtbs',
    modulo: AMI_RTBS,
  },
  {
    column: 'ordineBottoniere',
    question: 'bottoniereOrdine',
    prefix: 'db',
    path: 'ordine-bottoniere-dmg',
    modulo: DMG_FIXTURES,
  },
];

/**
 * Колоните на модулите (таблото — каквато и да е марка, листът за аргано, 2SG) в реда на слотовете: това
 * се избира поотделно за печата и PDF-а на картата (src/schede/stampa.ts).
 */
export const COLONNE: readonly ModuloSlot['column'][] = [
  ...new Set(SLOTS.map((slot) => slot.column)),
];

/**
 * Изборите на картата, при които модулът се отваря: марката, после моделът или видът на уредбата
 * (изгледът — обвивка за всеки).
 */
export function sceltaDi(slot: ModuloSlot): Array<{ field: string; value: string }> {
  return [slot.marca, slot.modello, slot.impianto].filter(
    (c): c is NonNullable<typeof c> => c !== undefined,
  );
}

/** Изборът е направен: единичната стойност или (видът на уредбата — отметки) стойността сред отметнатите. */
export function scelto(value: unknown, wanted: string): boolean {
  return Array.isArray(value) ? value.includes(wanted) : value === wanted;
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
  return sceltaDi(slot).every((c) => scelto(valueOf(c.field), c.value));
}

const si = (answer: unknown): boolean => answer === 'si' || answer === true;

/** Полетата, които отварят модула: въпросът му и (`apertura`) другите списъци със същата отметка. */
export const campiApertura = (slot: ModuloSlot): string[] => [
  slot.question,
  ...(slot.apertura?.anche ?? []),
];

/** Стойността отваря модула: „Sì“ на въпроса (true в записаната карта) или отметката на `apertura`. */
export const apre = (slot: ModuloSlot, value: unknown): boolean =>
  slot.apertura ? scelto(value, slot.apertura.valore) : si(value);

/**
 * Полето, което отваря модула (първото видимо с отваряща стойност), иначе undefined — на него стоят
 * връзките към PDF-а в страницата на картата. Без `active` — записаната карта (скритото там е null).
 */
export function campoCheApre(
  slot: ModuloSlot,
  valueOf: (key: string) => unknown,
  active?: ReadonlySet<string>,
): string | undefined {
  return campiApertura(slot).find(
    (field) => (!active || active.has(field)) && apre(slot, valueOf(field)),
  );
}

/**
 * Модулът е отворен: въпросът му се вижда (`active`, полетата с условие), отговорът е „Sì“ (или
 * отметката на `apertura` в някое от полетата ѝ), марката, моделът и видът на уредбата са неговите (ако
 * има) и слотът с предимство в колоната му не е отворен (`cede`). Моделът е поле с условие — броят се
 * само видимият. `valueOf` чете от формата (низове) или от записаната карта (true за „Sì“).
 */
export function slotAperto(
  slot: ModuloSlot,
  active: ReadonlySet<string>,
  valueOf: (key: string) => unknown,
): boolean {
  return (
    campoCheApre(slot, valueOf, active) !== undefined &&
    sceltoNellaScheda(slot, valueOf) &&
    (!slot.modello || active.has(slot.modello.field)) &&
    (!slot.impianto || active.has(slot.impianto.field)) &&
    !(slot.cede && active.has(slot.cede) && si(valueOf(slot.cede)))
  );
}

/**
 * „Sì“ на въпрос с модели, но без избран модел (Mastech без NG120 / QI Touch): няма кой модул да се
 * отвори — полетата на моделите, които липсват (празно — нищо не липсва).
 */
export function modelliMancanti(
  active: ReadonlySet<string>,
  valueOf: (key: string) => unknown,
): string[] {
  const missing = new Set<string>();
  for (const s of SLOTS) {
    if (
      !s.modello ||
      !active.has(s.question) ||
      !active.has(s.modello.field) ||
      valueOf(s.question) !== 'si' ||
      (s.marca && valueOf(s.marca.field) !== s.marca.value)
    )
      continue;
    const chosen = valueOf(s.modello.field);
    if (typeof chosen !== 'string' || chosen === '') missing.add(s.modello.field);
  }
  return [...missing];
}

/**
 * „Sì“ на поръчката при марка, чийто модул зависи от вида на уредбата (Elettroquadri), но без отметнат
 * вид: няма кой модул да се отвори — полето на вида, иначе null.
 */
export function impiantoMancante(
  active: ReadonlySet<string>,
  valueOf: (key: string) => unknown,
): string | null {
  const slots = SLOTS.filter(
    (s) =>
      s.impianto &&
      active.has(s.question) &&
      valueOf(s.question) === 'si' &&
      (!s.marca || valueOf(s.marca.field) === s.marca.value),
  );
  const field = slots[0]?.impianto?.field;
  if (!field) return null;
  return slots.some((s) => s.impianto && scelto(valueOf(field), s.impianto.value)) ? null : field;
}
