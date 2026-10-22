import {
  PORTE_AUTOMATICHE,
  PORTE_CON_PATTINO,
  PORTE_SEMIAUTOMATICHE,
  yes,
} from './field-conditions.js';
import type { SectionDef } from './field-types.js';

/**
 * Разделът „Serrature o sospensioni“ на картата (част от списъка в fields.ts): брави и окачвания на
 * вратите за смяна — само каквото е за вида врати от „Tipologia“ (собственикът, октомври 2026):
 * бравите и шейната — при ръчни и полуавтоматични, операторът на кабината — при полуавтоматични (на
 * етажите са бравите, кабината е автоматична врата с оператор — 22 октомври 2026), окачванията — при
 * автоматични. Бравите — брой и вид; шейната — видът ѝ; операторът — листът 2SG; окачванията — брой и
 * листът 2SG, в който е и операторът (src/ordini/: двата въпроса — една колона, два слота). Бележките —
 * винаги.
 */
export const SEZIONE_SERRATURE = {
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
      key: 'operatore',
      kind: 'yesno',
      wide: true,
      question: true,
      modulo: 'ordineSospensioni',
      when: PORTE_SEMIAUTOMATICHE,
    },
    {
      key: 'sospensioni',
      kind: 'yesno',
      wide: true,
      question: true,
      modulo: 'ordineSospensioni',
      when: PORTE_AUTOMATICHE,
    },
    { key: 'sospensioniNumero', kind: 'int', min: 0, max: 999, when: yes('sospensioni') },
    { key: 'serratureNote', kind: 'textarea', maxLength: 4000, wide: true },
  ],
} as const satisfies SectionDef;
