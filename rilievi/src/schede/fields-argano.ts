import { NON_IDRAULICO, no, yes } from './field-conditions.js';
import type { SectionDef } from './field-types.js';

/**
 * Разделът „Argano“ на картата (част от списъка в fields.ts) — не при хидравлична уредба (там е
 * централата). „Argano da sostituire?“: при Sì — листът с данните на машината, за всеки вид аргано
 * (src/ordini/); при No — какво се сменя или добавя на спирачката: челюстите и контактите, комплектът
 * за контрол на челюстите и контролът в таблото на управление — с вида им на ръка (собственикът,
 * октомври 2026). Бележките — винаги.
 */
export const SEZIONE_ARGANO = {
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
    { key: 'kitControlloGanasce', kind: 'yesno', when: no('arganoPreventivo') },
    {
      key: 'kitControlloGanasceTipo',
      kind: 'text',
      maxLength: 120,
      when: yes('kitControlloGanasce'),
    },
    { key: 'controlloQuadro', kind: 'yesno', when: no('arganoPreventivo') },
    { key: 'controlloQuadroTipo', kind: 'text', maxLength: 120, when: yes('controlloQuadro') },
    { key: 'arganoNote', kind: 'textarea', maxLength: 4000, wide: true },
  ],
} as const satisfies SectionDef;
