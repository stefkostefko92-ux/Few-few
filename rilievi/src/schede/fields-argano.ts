import { NON_IDRAULICO, no, yes } from './field-conditions.js';
import type { SectionDef } from './field-types.js';

/**
 * Разделът „Argano“ на картата (част от списъка в fields.ts) — не при хидравлична уредба (там е
 * централата). „Argano da sostituire?“: при Sì — листът с данните на машината, за всеки вид аргано
 * (src/ordini/); при No — видът на аргано, което остава, и комплектът за контрол на челюстите — с вида
 * му на ръка. Контролът в таблото на управление — само когато таблото остава („Quadro di manovra da
 * sostituire? No“), при всяко аргано; „Stop argano da installare?“ — винаги (собственикът, 24 октомври
 * 2026). Контактите (17 октомври) и челюстите на спирачката (24 октомври) не се питат — колоните пазят
 * старите отговори. Бележките — винаги.
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
    { key: 'kitControlloGanasce', kind: 'yesno', when: no('arganoPreventivo') },
    {
      key: 'kitControlloGanasceTipo',
      kind: 'text',
      maxLength: 120,
      when: yes('kitControlloGanasce'),
    },
    { key: 'controlloQuadro', kind: 'yesno', when: no('quadroSostituire') },
    { key: 'controlloQuadroTipo', kind: 'text', maxLength: 120, when: yes('controlloQuadro') },
    { key: 'stopArgano', kind: 'yesno' },
    { key: 'arganoNote', kind: 'textarea', maxLength: 4000, wide: true },
  ],
} as const satisfies SectionDef;
