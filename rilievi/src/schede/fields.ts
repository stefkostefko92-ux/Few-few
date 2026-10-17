/**
 * Полетата на схемата — ЕДИНСТВЕНИЯТ източник: формата, проверката, страницата, печатът и PDF-ът се
 * строят оттук. Редът на разделите е този от отпечатаната карта, номериран от собственика (октомври
 * 2026): табелата, място, вид, табло, аргано (или централата при хидравлична уредба), въжета и
 * тиранти, ограничител, кабели, брави и окачвания, аларма и аварийна връзка, бележки — фирмата може да
 * го смени (src/aziende/sezioni.ts); полетата в раздела остават в този ред. Модулите на доставчиците са
 * в src/ordini/. Етикетите са в речника: `scheda.field.<key>`, `scheda.section.<key>`,
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
} from './field-conditions.js';
import { SEZIONE_ARGANO } from './fields-argano.js';
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
    // Видът на вратите решава какво се пита в „Serrature o sospensioni“. Марката, светлият отвор и
    // напрежението на оператора — махнати (собственикът, октомври 2026; колоните остават със старите
    // отговори, проверката не ги чете), шейната е при бравите.
    key: 'tipologia',
    fields: [
      { key: 'tipoImpianto', kind: 'checks', options: TIPO_IMPIANTO },
      { key: 'tipoPorte', kind: 'checks', options: TIPO_PORTE },
      // „Accessi: 1 / 2“ — двойният достъп като брой достъпи.
      { key: 'doppioAccesso', kind: 'yesno', risposte: ['no', 'si'], when: PORTE_SCELTE },
    ],
  },
  {
    // Таблото за поръчка: марката (Mastech — и моделът); при Pelazza, MoviLift и Mastech — модулът им
    // за поръчка (src/ordini/). Намалената яма и горното пространство — за таблото; бележките — след
    // модула (октомври 2026).
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
      { key: 'quadroNote', kind: 'textarea', maxLength: 4000, wide: true },
    ],
  },
  SEZIONE_ARGANO,
  SEZIONE_CENTRALINA,
  {
    // „Funi e tiranti“: въжетата, после тирантите — брой и вид за кабината и за противотежестта
    // (собственикът, октомври 2026).
    key: 'funi',
    fields: [
      { key: 'funiDiametroMm', kind: 'decimal', min: 0, max: 100, unit: 'mm' },
      { key: 'funiTrefoli', kind: 'int', min: 0, max: 100 },
      { key: 'funiNumero', kind: 'int', min: 0, max: 100 },
      { key: 'funiLunghezzaM', kind: 'decimal', min: 0, max: 10_000, unit: 'm' },
      { key: 'tirantiCabinaNumero', kind: 'int', min: 0, max: 100 },
      { key: 'tirantiCabinaTipo', kind: 'text', maxLength: 120 },
      { key: 'tirantiContrappesoNumero', kind: 'int', min: 0, max: 100 },
      { key: 'tirantiContrappesoTipo', kind: 'text', maxLength: 120 },
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
    // Брави и окачвания на вратите за смяна — само каквото е за вида врати от „Tipologia“ (собственикът,
    // октомври 2026): бравите и шейната — при ръчни, окачванията — при автоматични, при полуавтоматични
    // — всичко. Бравите — брой и вид; шейната — видът ѝ; окачванията — брой и листът 2SG, в който е и
    // операторът на кабината (src/ordini/). Бележките — винаги.
    key: 'serrature',
    fields: [
      { key: 'serrature', kind: 'yesno', when: PORTE_CON_PATTINO },
      { key: 'serratureNumero', kind: 'int', min: 0, max: 999, when: yes('serrature') },
      { key: 'serratureTipo', kind: 'text', maxLength: 120, when: yes('serrature') },
      // „Pattino retrattile da cambiare“ (беше в „Tipologia“). Блокировката, донивелирането и броят
      // шейни — махнати (2026).
      { key: 'pattinoRetrattile', kind: 'yesno', when: PORTE_CON_PATTINO },
      {
        key: 'pattinoRetrattileTipo',
        kind: 'text',
        maxLength: 120,
        when: yes('pattinoRetrattile'),
      },
      {
        key: 'sospensioni',
        kind: 'yesno',
        wide: true,
        question: true,
        modulo: 'ordineSospensioni',
        when: PORTE_CON_OPERATORE,
      },
      { key: 'sospensioniNumero', kind: 'int', min: 0, max: 999, when: yes('sospensioni') },
      { key: 'serratureNote', kind: 'textarea', maxLength: 4000, wide: true },
    ],
  },
  {
    // „Allarme e telesoccorso“ — заедно, портиерната накрая (собственикът, октомври 2026). Аварийната
    // връзка — какво има да се монтира; заменя „Telesoccorso esistente“ и състоянието му (колоните им
    // остават със старите отговори, проверката не ги чете).
    key: 'allarme',
    fields: [
      { key: 'telesoccorsoInstallare', kind: 'yesno' },
      { key: 'perifericaInstallare', kind: 'yesno' },
      { key: 'cornettaInstallare', kind: 'yesno' },
      { key: 'allarmePortineria', kind: 'yesno' },
      { key: 'displayPortineria', kind: 'yesno' },
    ],
  },
  {
    key: 'note',
    fields: [
      { key: 'noteQuadretto', kind: 'textarea', maxLength: 4000, wide: true },
      { key: 'noteImpianto', kind: 'textarea', maxLength: 4000, wide: true },
      // „Luce vano da sostituire“ — в бележките (собственикът го премести от „Tipologia“); при Sì —
      // бележка на ръка (октомври 2026).
      { key: 'luceVanoSostituire', kind: 'yesno' },
      {
        key: 'luceVanoNote',
        kind: 'textarea',
        maxLength: 4000,
        wide: true,
        when: yes('luceVanoSostituire'),
      },
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
  'quadroNote',
  'kitControlloGanasceTipo',
  'controlloQuadroTipo',
  'arganoNote',
  'centralinaMarca',
  'tirantiCabinaTipo',
  'tirantiContrappesoTipo',
  'limitatoreTipo',
  'tenditore',
  'serratureTipo',
  'pattinoRetrattileTipo',
  'serratureNote',
  'noteQuadretto',
  'noteImpianto',
  'luceVanoNote',
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
