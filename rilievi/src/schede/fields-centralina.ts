import { ALTRA, answered, IDRAULICO, no, yes } from './field-conditions.js';
import {
  CENTRALINA_ALIMENTAZIONE,
  CENTRALINA_AVVIAMENTO,
  CENTRALINA_AZIONAMENTO,
  CENTRALINA_MOTORE,
  OLIO_LIVELLO,
  OLIO_STATO,
  TUBAZIONE,
} from './field-options.js';
import type { SectionDef } from './field-types.js';

/**
 * Разделът „Centralina“ на картата (част от списъка в fields.ts) — при хидравлична уредба, на мястото на
 * аргано и ограничителя. Полетата са на Асансьорчика (октомври 2026): при „Sì“ — каквото доставчикът
 * иска за нова централа, при „No“ — състоянието на тази, която остава; видът на задвижването и
 * клапанът на цилиндъра — и в двата клона.
 */
export const SEZIONE_CENTRALINA = {
  key: 'centralina',
  when: IDRAULICO,
  fields: [
    { key: 'centralinaDaFare', kind: 'yesno', wide: true, question: true },
    {
      key: 'centralinaAzionamento',
      kind: 'choice',
      options: CENTRALINA_AZIONAMENTO,
      when: answered('centralinaDaFare'),
    },
    { key: 'centralinaParacadute', kind: 'yesno', when: answered('centralinaDaFare') },
    { key: 'centralinaPistoni', kind: 'int', min: 1, max: 4, when: yes('centralinaDaFare') },
    {
      key: 'centralinaDiametroPistoneMm',
      kind: 'decimal',
      min: 0,
      max: 1_000,
      unit: 'mm',
      when: yes('centralinaDaFare'),
    },
    {
      key: 'centralinaCorsaM',
      kind: 'decimal',
      min: 0,
      max: 1_000,
      unit: 'm',
      when: yes('centralinaDaFare'),
    },
    {
      key: 'centralinaVelocita',
      kind: 'decimal',
      min: 0,
      max: 10,
      unit: 'ms',
      when: yes('centralinaDaFare'),
    },
    {
      key: 'centralinaPressioneBar',
      kind: 'decimal',
      min: 0,
      max: 1_000,
      unit: 'bar',
      when: yes('centralinaDaFare'),
    },
    {
      key: 'centralinaPortataPompa',
      kind: 'decimal',
      min: 0,
      max: 10_000,
      unit: 'lmin',
      when: yes('centralinaDaFare'),
    },
    {
      key: 'centralinaPotenzaKw',
      kind: 'decimal',
      min: 0,
      max: 1_000,
      unit: 'kw',
      when: yes('centralinaDaFare'),
    },
    {
      key: 'centralinaAlimentazione',
      kind: 'choice',
      options: CENTRALINA_ALIMENTAZIONE,
      when: yes('centralinaDaFare'),
    },
    {
      key: 'centralinaAlimentazioneAltro',
      kind: 'text',
      maxLength: 60,
      when: ALTRA('centralinaAlimentazione'),
    },
    {
      key: 'centralinaAvviamento',
      kind: 'choice',
      options: CENTRALINA_AVVIAMENTO,
      when: yes('centralinaDaFare'),
    },
    {
      key: 'centralinaTubazione',
      kind: 'choice',
      options: TUBAZIONE,
      when: yes('centralinaDaFare'),
    },
    {
      key: 'centralinaTubazioneM',
      kind: 'decimal',
      min: 0,
      max: 1_000,
      unit: 'm',
      when: yes('centralinaDaFare'),
    },
    { key: 'centralinaAttacco', kind: 'text', maxLength: 60, when: yes('centralinaDaFare') },
    {
      key: 'centralinaDistanzaM',
      kind: 'decimal',
      min: 0,
      max: 1_000,
      unit: 'm',
      when: yes('centralinaDaFare'),
    },
    {
      key: 'centralinaAccesso',
      kind: 'text',
      maxLength: 200,
      wide: true,
      when: yes('centralinaDaFare'),
    },
    { key: 'centralinaCorseOra', kind: 'int', min: 0, max: 1_000, when: yes('centralinaDaFare') },
    {
      key: 'centralinaNote',
      kind: 'textarea',
      maxLength: 4000,
      wide: true,
      when: yes('centralinaDaFare'),
    },
    { key: 'centralinaMarca', kind: 'text', maxLength: 120, when: no('centralinaDaFare') },
    {
      key: 'centralinaMotore',
      kind: 'choice',
      options: CENTRALINA_MOTORE,
      when: no('centralinaDaFare'),
    },
    { key: 'centralinaBloccoValvole', kind: 'text', maxLength: 120, when: no('centralinaDaFare') },
    { key: 'emendamentoA3', kind: 'yesno', when: no('centralinaDaFare') },
    { key: 'centralinaDiscesaEmergenza', kind: 'yesno', when: no('centralinaDaFare') },
    {
      key: 'centralinaOlioLivello',
      kind: 'choice',
      options: OLIO_LIVELLO,
      when: no('centralinaDaFare'),
    },
    {
      key: 'centralinaOlioStato',
      kind: 'choice',
      options: OLIO_STATO,
      when: no('centralinaDaFare'),
    },
  ],
} as const satisfies SectionDef;
