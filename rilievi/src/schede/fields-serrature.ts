import {
  PORTE_AUTOMATICHE,
  PORTE_CON_OPERATORE,
  PORTE_CON_PATTINO,
  yes,
} from './field-conditions.js';
import type { SectionDef } from './field-types.js';

/**
 * Разделът „Serrature, sospensioni o operatore“ на картата (част от списъка в fields.ts): брави,
 * окачвания и оператор на вратите за смяна — само каквото е за вида врати от „Tipologia“ (собственикът,
 * октомври 2026): бравите и шейната — при ръчни и полуавтоматични, окачванията — при автоматични,
 * операторът на кабината — при полуавтоматични (на етажите са бравите, кабината е автоматична врата с
 * оператор — 22 октомври 2026) и автоматични (24 октомври). Бравите — брой и вид; шейната — видът ѝ;
 * окачванията — брой и листът 2SG; операторът — същият лист (src/ordini/: двата въпроса — една колона,
 * два слота; при автоматични с „Sì“ и на двата листът е един — на окачванията). Бележките — винаги.
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
      key: 'sospensioni',
      kind: 'yesno',
      wide: true,
      question: true,
      modulo: 'ordineSospensioni',
      when: PORTE_AUTOMATICHE,
    },
    { key: 'sospensioniNumero', kind: 'int', min: 0, max: 999, when: yes('sospensioni') },
    {
      key: 'operatore',
      kind: 'yesno',
      wide: true,
      question: true,
      modulo: 'ordineSospensioni',
      when: PORTE_CON_OPERATORE,
    },
    { key: 'serratureNote', kind: 'textarea', maxLength: 4000, wide: true },
  ],
} as const satisfies SectionDef;
