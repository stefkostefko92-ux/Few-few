import { NON_IDRAULICO, no, yes } from './field-conditions.js';
import type { SectionDef } from './field-types.js';

/**
 * Разделът „Argano“ на картата (част от списъка в fields.ts) — не при хидравлична уредба (там е
 * централата). „Argano da sostituire?“: при Sì — листът с данните на машината, за всеки вид аргано
 * (src/ordini/); при No — видът на аргано, което остава, и какво се сменя или добавя на спирачката:
 * челюстите, комплектът за контрол на челюстите и контролът в таблото на управление — с вида им на ръка
 * (собственикът, октомври 2026; контактите на спирачката не се питат от 17 октомври — колоната пази
 * старите отговори). Бележките — винаги.
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
    { key: 'arganoTipo', kind: 'text', maxLength: 120, when: no('arganoPreventivo') },
    { key: 'ganasceFreno', kind: 'yesno', when: no('arganoPreventivo') },
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
