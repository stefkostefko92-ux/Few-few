/**
 * Полетата на схемата — ЕДИНСТВЕНИЯТ източник: формата, проверката, страницата, печатът и PDF-ът се
 * строят оттук. Редът на разделите е този от отпечатаната карта, номериран от собственика (октомври
 * 2026): табелата, място, вид, табло, аргано (или централата при хидравлична уредба), въжета,
 * ограничител, кабели, брави и окачвания, аларма, аварийна връзка, бележки — фирмата може да го смени
 * (src/aziende/sezioni.ts); полетата в раздела остават в този ред. Модулите на доставчиците са в
 * src/ordini/. Етикетите са в речника: `scheda.field.<key>`, `scheda.section.<key>`,
 * `scheda.option.<key>.<СТОЙНОСТ>`, `scheda.question.<key>`; опциите — в field-options.ts.
 */

import {
  QUADRO_MARCA,
  QUADRO_MODELLO,
  TIPO_IMPIANTO,
  TIPO_PORTE,
  UBICAZIONE_MACCHINA,
} from './field-options.js';
import type { Condition, FieldDef, SectionDef, SectionKey } from './field-types.js';

export * from './field-types.js';
export * from './field-options.js';

import {
  ALTRA,
  NON_IDRAULICO,
  PORTE_CON_OPERATORE,
  PORTE_CON_PATTINO,
  PORTE_SCELTE,
  yes,
  no,
} from './field-conditions.js';
import { SEZIONE_CENTRALINA } from './fields-centralina.js';

export const SECTIONS = [
  {
    // Разделът 1 е подреден като главата и табелата на листа (собственикът, октомври 2026): датата;
    // адресът и бонът; матрикулата и № на асансьора; товарът, капацитетът, спирките и марката.
    key: 'impianto',
    fields: [
      { key: 'data', kind: 'date' },
      { key: 'indirizzo', kind: 'text', maxLength: 200, wide: true },
      // Работната поръчка, по която е огледът — може да остане празно.
      { key: 'buonoLavoro', kind: 'text', maxLength: 60 },
      { key: 'matricola', kind: 'digits', maxLength: 20 },
      { key: 'numeroImpianto', kind: 'digits', maxLength: 20 },
      { key: 'portataKg', kind: 'int', min: 0, max: 100_000, unit: 'kg' },
      { key: 'capienzaPersone', kind: 'int', min: 0, max: 1_000, unit: 'persone' },
      { key: 'fermate', kind: 'int', min: 0, max: 300 },
      { key: 'marca', kind: 'text', maxLength: 120 },
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
      // „Accessi: 1 / 2“ — двойният достъп като брой достъпи.
      { key: 'doppioAccesso', kind: 'yesno', risposte: ['no', 'si'], when: PORTE_SCELTE },
      // „Pattino retrattile da cambiare“. Блокировката, донивелирането и броят шейни — махнати (2026).
      { key: 'pattinoRetrattile', kind: 'yesno', when: PORTE_CON_PATTINO },
    ],
  },
  {
    // Таблото за поръчка: марката (Mastech — и моделът); при Pelazza, MoviLift и Mastech — модулът им
    // за поръчка (src/ordini/). Намалената яма и горното пространство — за таблото (октомври 2026).
    key: 'quadro',
    fields: [
      { key: 'quadroMarca', kind: 'choice', options: QUADRO_MARCA },
      { key: 'quadroMarcaAltro', kind: 'text', maxLength: 120, when: ALTRA('quadroMarca') },
      {
        key: 'quadroModello',
        kind: 'choice',
        options: QUADRO_MODELLO,
        when: { field: 'quadroMarca', values: ['MASTECH'] },
      },
      { key: 'fossaRidotta', kind: 'yesno' },
      { key: 'testataRidotta', kind: 'yesno' },
      {
        key: 'quadroOrdine',
        kind: 'yesno',
        wide: true,
        question: true,
        modulo: 'ordineQuadro',
        // Марките с модул за поръчка (src/ordini/registry.ts — тестът пази съвпадението).
        when: { field: 'quadroMarca', values: ['PELAZZA', 'MOVILIFT', 'MASTECH'] },
      },
    ],
  },
  {
    // „Argano da sostituire?“ — при Sì листът с данните на машината, за всеки вид аргано (src/ordini/);
    // при No — сменят ли се челюстите и контактите на спирачката. Не при хидравлична уредба.
    key: 'argano',
    when: NON_IDRAULICO,
    fields: [
      {
        key: 'arganoPreventivo',
        kind: 'yesno',
        wide: true,
        question: true,
        modulo: 'preventivoArgano',
      },
      { key: 'ganasceFreno', kind: 'yesno', when: no('arganoPreventivo') },
      { key: 'contattiFreno', kind: 'yesno', when: no('arganoPreventivo') },
    ],
  },
  SEZIONE_CENTRALINA,
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
    when: NON_IDRAULICO,
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
    // Брави и окачвания на вратите за смяна: бравите — брой и вид; окачванията — брой и листът 2SG,
    // в който е и операторът на кабината (src/ordini/).
    key: 'serrature',
    fields: [
      { key: 'serrature', kind: 'yesno' },
      { key: 'serratureNumero', kind: 'int', min: 0, max: 999, when: yes('serrature') },
      { key: 'serratureTipo', kind: 'text', maxLength: 120, when: yes('serrature') },
      {
        key: 'sospensioni',
        kind: 'yesno',
        wide: true,
        question: true,
        modulo: 'ordineSospensioni',
      },
      { key: 'sospensioniNumero', kind: 'int', min: 0, max: 999, when: yes('sospensioni') },
    ],
  },
  {
    key: 'allarme',
    fields: [
      { key: 'allarmePortineria', kind: 'yesno' },
      { key: 'displayPortineria', kind: 'yesno' },
    ],
  },
  {
    // Аварийната връзка: какво има да се монтира (октомври 2026). Заменя „Telesoccorso esistente“ и
    // състоянието му — колоните им остават със старите отговори, проверката не ги чете.
    key: 'telesoccorso',
    fields: [
      { key: 'telesoccorsoInstallare', kind: 'yesno' },
      { key: 'perifericaInstallare', kind: 'yesno' },
      { key: 'cornettaInstallare', kind: 'yesno' },
    ],
  },
  {
    key: 'note',
    fields: [
      { key: 'noteQuadretto', kind: 'textarea', maxLength: 4000, wide: true },
      { key: 'noteImpianto', kind: 'textarea', maxLength: 4000, wide: true },
      // „Luce vano da sostituire“ — в бележките (собственикът го премести от „Tipologia“).
      { key: 'luceVanoSostituire', kind: 'yesno' },
      { key: 'noteBottoniere', kind: 'textarea', maxLength: 4000, wide: true },
      { key: 'bottoniereMisure', kind: 'yesno', wide: true, question: true, misure: true },
      { key: 'lavoriExtra', kind: 'textarea', maxLength: 4000, wide: true },
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
  'centralinaMarca',
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

/** Условието е изпълнено при тези стойности; `active` — вече видимите полета (по-ранните). */
function conditionMet(
  when: Condition,
  active: ReadonlySet<string>,
  valueOf: (key: string) => unknown,
): boolean {
  const has =
    active.has(when.field) && tokensOf(valueOf(when.field)).some((v) => when.values.includes(v));
  return when.not ? !has : has;
}

/**
 * Кои раздели и полета имат смисъл при тези стойности: без условие — винаги; с условие — когато то е
 * изпълнено и полето, от което зависи, само има смисъл („Numero pattini“ ← „Pattino retrattile: Sì“
 * ← „Porte: manuali“); полето на скрит раздел няма смисъл („Argano“ при хидравлична уредба).
 * Полето-условие стои по-рано в списъка (тестът го пази), затова стига един проход.
 */
export function activeParts(valueOf: (key: string) => unknown): {
  sections: Set<SectionKey>;
  fields: Set<string>;
} {
  const sections = new Set<SectionKey>();
  const fields = new Set<string>();
  for (const section of SECTIONS as readonly SectionDef[]) {
    if (section.when && !conditionMet(section.when, fields, valueOf)) continue;
    sections.add(section.key);
    for (const field of section.fields) {
      if (!field.when || conditionMet(field.when, fields, valueOf)) fields.add(field.key);
    }
  }
  return { sections, fields };
}

/** Полетата със смисъл при тези стойности (activeParts). */
export function activeFields(valueOf: (key: string) => unknown): Set<string> {
  return activeParts(valueOf).fields;
}
