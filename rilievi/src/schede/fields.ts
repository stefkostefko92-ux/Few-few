/**
 * Полетата на схемата — ЕДИНСТВЕНИЯТ източник: формата, проверката, страницата, печатът и PDF-ът се
 * строят оттук. Редът е дословно от заданието на клиента; разделите само групират, без да разместват.
 * Полетата от второто задание (врати, аларма, работна поръчка, мерки на бутониерите) стоят до тези,
 * към които се отнасят; третото (табло и аргано за поръчка) е накрая — модулите на доставчиците им са в
 * src/ordini/. Етикетите са в речника: `scheda.field.<key>`, `scheda.section.<key>`,
 * `scheda.option.<key>.<СТОЙНОСТ>`, `scheda.question.<key>`.
 */

import type { Condition, FieldDef, SectionDef } from './field-types.js';

export * from './field-types.js';

export const UBICAZIONE_MACCHINA = ['ALTO', 'BASSO'] as const;
export const TIPO_IMPIANTO = ['ELETTRICO', 'IDRAULICO', 'GEARLESS'] as const;
export const TIPO_PORTE = ['AUTOMATICHE', 'SEMIAUTOMATICHE', 'MANUALI'] as const;
export const TELESOCCORSO_STATO = ['COMPLETO', 'MANCA_PERIFERICA'] as const;
export const QUADRO_MARCA = ['PELAZZA', 'MOVILIFT', 'DMG', 'MASTECH', 'ALTRO'] as const;
export const ARGANO_MARCA = ['MONTANARI', 'ALTRO'] as const;

const yes = (field: string): Condition => ({ field, values: ['si'] });
/** Операторът на вратите има смисъл при автоматични и полуавтоматични врати. */
const PORTE_CON_OPERATORE: Condition = {
  field: 'tipoPorte',
  values: ['AUTOMATICHE', 'SEMIAUTOMATICHE'],
};
const PORTE_MANUALI: Condition = { field: 'tipoPorte', values: ['MANUALI'] };
/** Прибиращата се шейна — при ръчни и при полуавтоматични врати. */
const PORTE_CON_PATTINO: Condition = { field: 'tipoPorte', values: ['MANUALI', 'SEMIAUTOMATICHE'] };
/** „Altro“ при марката → коя. */
const ALTRA = (field: string): Condition => ({ field, values: ['ALTRO'] });

export const SECTIONS = [
  {
    key: 'impianto',
    fields: [
      { key: 'data', kind: 'date' },
      { key: 'indirizzo', kind: 'text', maxLength: 200, wide: true },
      { key: 'marca', kind: 'text', maxLength: 120 },
      { key: 'matricola', kind: 'digits', maxLength: 20 },
      { key: 'numeroImpianto', kind: 'digits', maxLength: 20 },
      // Работната поръчка, по която е огледът — може да остане празно.
      { key: 'buonoLavoro', kind: 'text', maxLength: 60 },
    ],
  },
  {
    key: 'targa',
    fields: [
      { key: 'portataKg', kind: 'int', min: 0, max: 100_000, unit: 'kg' },
      { key: 'capienzaPersone', kind: 'int', min: 0, max: 1_000, unit: 'persone' },
      { key: 'fermate', kind: 'int', min: 0, max: 300 },
    ],
  },
  {
    key: 'ubicazione',
    fields: [
      { key: 'ubicazioneMacchina', kind: 'checks', options: UBICAZIONE_MACCHINA },
      // Къде е кутийката — свободен текст („Piano -1, vano contatori“).
      { key: 'ubicazioneCassettina', kind: 'text', maxLength: 120 },
      { key: 'parcheggio', kind: 'text', maxLength: 300, wide: true },
    ],
  },
  {
    key: 'tipologia',
    fields: [
      { key: 'tipoImpianto', kind: 'checks', options: TIPO_IMPIANTO },
      { key: 'tipoPorte', kind: 'checks', options: TIPO_PORTE },
      { key: 'operatoreMarca', kind: 'text', maxLength: 120, when: PORTE_CON_OPERATORE },
      // Светлият отвор и напрежението — свободен текст („800 x 2000“, „24 V DC“).
      { key: 'lucePorte', kind: 'text', maxLength: 60, when: PORTE_CON_OPERATORE },
      { key: 'operatoreTensione', kind: 'text', maxLength: 60, when: PORTE_CON_OPERATORE },
      { key: 'doppioAccesso', kind: 'yesno', when: PORTE_CON_OPERATORE },
      { key: 'bloccaPortine', kind: 'yesno', when: PORTE_MANUALI },
      { key: 'autolivellamento', kind: 'yesno', when: PORTE_MANUALI },
      { key: 'pattinoRetrattile', kind: 'yesno', when: PORTE_CON_PATTINO },
      {
        key: 'pattinoRetrattileNumero',
        kind: 'int',
        min: 0,
        max: 99,
        when: yes('pattinoRetrattile'),
      },
      // „Serrature/sospensioni“ — брави и окачвания на вратите.
      { key: 'serrature', kind: 'yesno' },
      { key: 'serratureNumero', kind: 'int', min: 0, max: 999, when: yes('serrature') },
      { key: 'serratureTipo', kind: 'text', maxLength: 120, when: yes('serrature') },
      { key: 'luceVanoSostituire', kind: 'yesno' },
    ],
  },
  {
    key: 'funi',
    fields: [
      { key: 'funiDiametroMm', kind: 'decimal', min: 0, max: 100, unit: 'mm' },
      { key: 'funiTrefoli', kind: 'int', min: 0, max: 100 },
      { key: 'funiNumero', kind: 'int', min: 0, max: 100 },
      { key: 'funiLunghezzaM', kind: 'decimal', min: 0, max: 10_000, unit: 'm' },
    ],
  },
  {
    key: 'limitatore',
    fields: [
      { key: 'limitatoreTipo', kind: 'text', maxLength: 120 },
      { key: 'funicellaDiametroMm', kind: 'decimal', min: 0, max: 100, unit: 'mm' },
      { key: 'funicellaLunghezzaM', kind: 'decimal', min: 0, max: 10_000, unit: 'm' },
      { key: 'tenditore', kind: 'text', maxLength: 120 },
    ],
  },
  {
    key: 'cavi',
    fields: [
      { key: 'caviNumero', kind: 'int', min: 0, max: 100 },
      { key: 'caviConduttori', kind: 'int', min: 0, max: 1_000 },
      { key: 'caviLunghezzaM', kind: 'decimal', min: 0, max: 10_000, unit: 'm' },
    ],
  },
  {
    key: 'allarme',
    fields: [
      { key: 'telesoccorso', kind: 'yesno' },
      {
        key: 'telesoccorsoStato',
        kind: 'choice',
        options: TELESOCCORSO_STATO,
        when: yes('telesoccorso'),
      },
      { key: 'allarmePortineria', kind: 'yesno' },
      { key: 'displayPortineria', kind: 'yesno' },
    ],
  },
  {
    key: 'note',
    fields: [
      { key: 'noteQuadretto', kind: 'textarea', maxLength: 4000, wide: true },
      { key: 'noteImpianto', kind: 'textarea', maxLength: 4000, wide: true },
      { key: 'noteBottoniere', kind: 'textarea', maxLength: 4000, wide: true },
      { key: 'bottoniereMisure', kind: 'yesno', wide: true, question: true, misure: true },
      { key: 'lavoriExtra', kind: 'textarea', maxLength: 4000, wide: true },
    ],
  },
  {
    // Таблото за поръчка: марката; при Pelazza и MoviLift — модулът им за поръчка (src/ordini/).
    key: 'quadro',
    fields: [
      { key: 'quadroMarca', kind: 'choice', options: QUADRO_MARCA },
      { key: 'quadroMarcaAltro', kind: 'text', maxLength: 120, when: ALTRA('quadroMarca') },
      {
        key: 'quadroOrdine',
        kind: 'yesno',
        wide: true,
        question: true,
        modulo: 'ordineQuadro',
        // Марките с модул за поръчка (src/ordini/registry.ts — тестът пази съвпадението).
        when: { field: 'quadroMarca', values: ['PELAZZA', 'MOVILIFT'] },
      },
    ],
  },
  {
    // Аргано (машината): марката; при Montanari — тяхното запитване за оферта (src/ordini/).
    key: 'argano',
    fields: [
      { key: 'arganoMarca', kind: 'choice', options: ARGANO_MARCA },
      { key: 'arganoMarcaAltro', kind: 'text', maxLength: 120, when: ALTRA('arganoMarca') },
      {
        key: 'arganoPreventivo',
        kind: 'yesno',
        wide: true,
        question: true,
        modulo: 'preventivoArgano',
        when: { field: 'arganoMarca', values: ['MONTANARI'] },
      },
    ],
  },
] as const satisfies readonly SectionDef[];

export type SchedaFieldKey = (typeof SECTIONS)[number]['fields'][number]['key'];

/** Всички полета в реда от заданието. */
export const FIELDS: readonly FieldDef[] = SECTIONS.flatMap(
  (section): readonly FieldDef[] => section.fields,
);

/** Поне едно от тези трябва да е попълнено — иначе схемата не може да се намери после. */
export const IDENTIFIERS = ['indirizzo', 'matricola', 'numeroImpianto'] as const;

/** Текстовите полета, по които търси лентата за търсене (числата-идентификатори първи). */
export const SEARCHABLE = [
  'numeroImpianto',
  'matricola',
  'indirizzo',
  'marca',
  'buonoLavoro',
  'parcheggio',
  'operatoreMarca',
  'serratureTipo',
  'limitatoreTipo',
  'tenditore',
  'noteQuadretto',
  'noteImpianto',
  'noteBottoniere',
  'lavoriExtra',
] as const satisfies readonly SchedaFieldKey[];

export function fieldByKey(key: string): FieldDef | undefined {
  return FIELDS.find((field) => field.key === key);
}

/** Стойността като думи от формата: Sì/No → 'si'/'no', отметките — списъкът, изборът — той самият. */
export function tokensOf(raw: unknown): string[] {
  if (raw === true) return ['si'];
  if (raw === false) return ['no'];
  if (typeof raw === 'string') return raw === '' ? [] : [raw];
  if (Array.isArray(raw)) return raw.filter((value): value is string => typeof value === 'string');
  return [];
}

/**
 * Кои полета имат смисъл при тези стойности: без условие — винаги; с условие — когато то е изпълнено и
 * полето, от което зависи, само има смисъл („Numero pattini“ ← „Pattino retrattile: Sì“ ← „Porte:
 * manuali“). Полето-условие стои по-рано в списъка (тестът го пази), затова стига един проход.
 */
export function activeFields(valueOf: (key: string) => unknown): Set<string> {
  const active = new Set<string>();
  for (const field of FIELDS) {
    const when = field.when;
    const met =
      !when ||
      (active.has(when.field) &&
        tokensOf(valueOf(when.field)).some((v) => when.values.includes(v)));
    if (met) active.add(field.key);
  }
  return active;
}
