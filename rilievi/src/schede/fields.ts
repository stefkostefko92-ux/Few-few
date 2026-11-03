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
  AMI100_TIPO,
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
  IDRAULICO,
  NON_IDRAULICO,
  PORTE_SCELTE,
  SPAZI_RIDOTTI,
  yes,
} from './field-conditions.js';
import { SEZIONE_ARGANO } from './fields-argano.js';
import { SEZIONE_CENTRALINA } from './fields-centralina.js';
import { SEZIONE_SERRATURE } from './fields-serrature.js';

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
      // Един вид уредба и един вид врати (собственикът, октомври 2026) — радио, пази се като списък.
      { key: 'tipoImpianto', kind: 'checks', options: TIPO_IMPIANTO, single: true },
      { key: 'tipoPorte', kind: 'checks', options: TIPO_PORTE, single: true },
      // „Accessi: 1 / 2“ — двойният достъп като брой достъпи.
      { key: 'doppioAccesso', kind: 'yesno', risposte: ['no', 'si'], when: PORTE_SCELTE },
    ],
  },
  {
    // Таблото: сменя ли се (при No — контролът на челюстите в таблото, раздел „Argano“; 24 октомври
    // 2026); марката (Mastech — и моделът); при Pelazza, MoviLift и Mastech — модулът им за поръчка
    // (src/ordini/). Намалената яма и горното пространство — за таблото, не при хидравлична уредба (24
    // октомври); бележките — след модула (октомври 2026).
    key: 'quadro',
    fields: [
      { key: 'quadroSostituire', kind: 'yesno', question: true },
      { key: 'quadroMarca', kind: 'choice', options: QUADRO_MARCA },
      { key: 'quadroMarcaAltro', kind: 'text', maxLength: 120, when: ALTRA('quadroMarca') },
      {
        key: 'quadroModello',
        kind: 'choice',
        options: QUADRO_MODELLO,
        when: { field: 'quadroMarca', values: ['MASTECH'] },
      },
      { key: 'fossaRidotta', kind: 'yesno', when: NON_IDRAULICO },
      { key: 'testataRidotta', kind: 'yesno', when: NON_IDRAULICO },
      // При намалена яма или горно пространство — AMI 100: Mono UCM или Mono RTBS, всеки със своя лист
      // с данните за поръчката (src/ordini/; собственикът, 30 октомври 2026).
      { key: 'ami100', kind: 'yesno', question: true, modulo: 'ordineAmi', when: SPAZI_RIDOTTI },
      { key: 'ami100Tipo', kind: 'choice', options: AMI100_TIPO, when: yes('ami100') },
      {
        key: 'quadroOrdine',
        kind: 'yesno',
        wide: true,
        question: true,
        modulo: 'ordineQuadro',
        // Марките с модул за поръчка (src/ordini/registry.ts — тестът пази съвпадението).
        when: { field: 'quadroMarca', values: ['PELAZZA', 'MOVILIFT', 'MASTECH', 'ELETTROQUADRI'] },
      },
      { key: 'quadroNote', kind: 'textarea', maxLength: 4000, wide: true },
    ],
  },
  SEZIONE_ARGANO,
  SEZIONE_CENTRALINA,
  {
    // „Funi e tiranti“: въжетата, после тирантите — брой и вид за кабината и за противотежестта; при
    // хидравлична уредба противотежест няма — вторите тиранти са закрепените в ямата (собственикът,
    // октомври 2026).
    key: 'funi',
    fields: [
      { key: 'funiDiametroMm', kind: 'decimal', min: 0, max: 100, unit: 'mm' },
      { key: 'funiTrefoli', kind: 'int', min: 0, max: 100 },
      { key: 'funiNumero', kind: 'int', min: 0, max: 100 },
      { key: 'funiLunghezzaM', kind: 'decimal', min: 0, max: 10_000, unit: 'm' },
      { key: 'tirantiCabinaNumero', kind: 'int', min: 0, max: 100 },
      { key: 'tirantiCabinaTipo', kind: 'text', maxLength: 120 },
      { key: 'tirantiContrappesoNumero', kind: 'int', min: 0, max: 100, when: NON_IDRAULICO },
      { key: 'tirantiContrappesoTipo', kind: 'text', maxLength: 120, when: NON_IDRAULICO },
      { key: 'tirantiFossaNumero', kind: 'int', min: 0, max: 100, when: IDRAULICO },
      { key: 'tirantiFossaTipo', kind: 'text', maxLength: 120, when: IDRAULICO },
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
  SEZIONE_SERRATURE,
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
    // „Bottoniere“ — избира се при нужда: „Bottoniere da sostituire?“ и бележка на ръка — винаги, и при
    // „No“ (собственикът, 24 октомври 2026; засега само това). Бележката за бутониерите в работа и мерките
    // на старите — в „Note e lavori“.
    key: 'bottoniere',
    fields: [
      { key: 'bottoniereSostituire', kind: 'yesno', question: true },
      { key: 'bottoniereNote', kind: 'textarea', maxLength: 4000, wide: true },
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
  'arganoTipo',
  'kitControlloGanasceTipo',
  'controlloQuadroTipo',
  'arganoNote',
  'centralinaMarca',
  'tuboFlessibileNote',
  'centralinaNote',
  'tirantiCabinaTipo',
  'tirantiContrappesoTipo',
  'tirantiFossaTipo',
  'limitatoreTipo',
  'tenditore',
  'serratureTipo',
  'pattinoRetrattileTipo',
  'serratureNote',
  'noteQuadretto',
  'noteImpianto',
  'luceVanoNote',
  'noteBottoniere',
  'bottoniereNote',
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
 * Условието е изпълнено при тези стойности; `active` — вече видимите полета (по-ранните). С `also` стига
 * едно от полетата.
 */
function conditionMet(
  when: Condition,
  active: ReadonlySet<string>,
  valueOf: (key: string) => unknown,
): boolean {
  const has = [when.field, ...(when.also ?? [])].some(
    (field) => active.has(field) && tokensOf(valueOf(field)).some((v) => when.values.includes(v)),
  );
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
