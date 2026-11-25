import { answered, IDRAULICO, no, yes } from './field-conditions.js';
import {
  CENTRALINA_AVVIO,
  CENTRALINA_IN_OPERA,
  KIT_A3_ALTRO,
  KIT_A3_HYDRONIC,
  KIT_A3_VALVOLA,
  SARACINESCA,
  TIPO_PISTONE,
} from './field-options.js';
import type { Condition, SectionDef } from './field-types.js';

/**
 * Разделът „Centralina“ на картата (част от списъка в fields.ts) — при хидравлична уредба, на мястото на
 * аргано и ограничителя. „Centralina da sostituire?“ (колоната е `centralinaDaFare` отпреди), марката и
 * моделът при всеки отговор. По листовете на собственика (3 ноември 2026): при „Sì“ — данните за новата
 * централа (мотор, помпа, пускане, електровентили, тръба, бутало, ход, масло); при „No“ — „Installare
 * kit A3?“ (колоната е `emendamentoA3`), а при неговото „Sì“ — видът на централата, която остава
 * (Hydronic или друга) с частите на кита за нея, и гъвкавата тръба. Накрая — бележките за фитингите и
 * тръбите и бележките на раздела. Махнатите от 21 октомври данни (задвижване, налягане, отделни
 * бутала…) остават в колоните си със старите отговори — проверката не ги чете, записът не ги пипа.
 */
const SI = yes('centralinaDaFare');
const HYDRONIC: Condition = { field: 'centralinaInOpera', values: ['HYDRONIC'] };
const ALTRA: Condition = { field: 'centralinaInOpera', values: ['ALTRO'] };

export const SEZIONE_CENTRALINA = {
  key: 'centralina',
  when: IDRAULICO,
  fields: [
    { key: 'centralinaDaFare', kind: 'yesno', wide: true, question: true },
    { key: 'centralinaMarca', kind: 'text', maxLength: 120, when: answered('centralinaDaFare') },
    { key: 'centralinaMotoreV', kind: 'int', min: 0, max: 1_000, unit: 'volt', when: SI },
    { key: 'centralinaMotoreHp', kind: 'decimal', min: 0, max: 1_000, unit: 'hp', when: SI },
    { key: 'centralinaPompaLMin', kind: 'decimal', min: 0, max: 10_000, unit: 'lmin', when: SI },
    { key: 'centralinaAvvio', kind: 'choice', options: CENTRALINA_AVVIO, when: SI },
    { key: 'centralinaTensioneValvole', kind: 'text', maxLength: 40, when: SI },
    { key: 'centralinaDiametroTubazione', kind: 'text', maxLength: 40, when: SI },
    { key: 'centralinaMarcaPistone', kind: 'text', maxLength: 120, when: SI },
    { key: 'centralinaDiametroStelo', kind: 'decimal', min: 0, max: 1_000, unit: 'mm', when: SI },
    { key: 'centralinaCorsaImpianto', kind: 'decimal', min: 0, max: 1_000, unit: 'm', when: SI },
    { key: 'centralinaTipoPistone', kind: 'choice', options: TIPO_PISTONE, when: SI },
    { key: 'centralinaLitriOlio', kind: 'decimal', min: 0, max: 100_000, unit: 'litri', when: SI },
    { key: 'emendamentoA3', kind: 'yesno', question: true, when: no('centralinaDaFare') },
    {
      key: 'centralinaInOpera',
      kind: 'choice',
      options: CENTRALINA_IN_OPERA,
      when: yes('emendamentoA3'),
    },
    // Hydronic: частите на кита и напрежението на бобините (по листа — само при Hydronic).
    { key: 'kitA3Hydronic', kind: 'checks', options: KIT_A3_HYDRONIC, wide: true, when: HYDRONIC },
    { key: 'kitA3TensioneBobine', kind: 'text', maxLength: 40, when: HYDRONIC },
    // Друга централа: вентилът по дебита, частите на кита, шибърът — ASS/2 или ASS/3.
    { key: 'kitA3Valvola', kind: 'choice', options: KIT_A3_VALVOLA, wide: true, when: ALTRA },
    { key: 'kitA3Altro', kind: 'checks', options: KIT_A3_ALTRO, wide: true, when: ALTRA },
    {
      key: 'kitA3Saracinesca',
      kind: 'choice',
      options: SARACINESCA,
      when: { field: 'kitA3Altro', values: ['SARACINESCA'] },
    },
    { key: 'tuboFlessibile', kind: 'yesno', when: yes('emendamentoA3') },
    // Свободен текст (собственикът, 9 ноември 2026): „1/2\"“, „DN 25“, „25,4 mm“; ключът пази стария „Mm“.
    { key: 'tuboFlessibileDiametroMm', kind: 'text', maxLength: 40, when: yes('tuboFlessibile') },
    {
      key: 'tuboFlessibileLunghezzaM',
      kind: 'decimal',
      min: 0,
      max: 1_000,
      unit: 'm',
      when: yes('tuboFlessibile'),
    },
    {
      key: 'tuboFlessibileNote',
      kind: 'textarea',
      maxLength: 4000,
      wide: true,
      when: yes('tuboFlessibile'),
    },
    {
      key: 'centralinaNoteRaccordi',
      kind: 'textarea',
      maxLength: 4000,
      wide: true,
      when: answered('centralinaDaFare'),
    },
    { key: 'centralinaNote', kind: 'textarea', maxLength: 4000, wide: true },
  ],
} as const satisfies SectionDef;
