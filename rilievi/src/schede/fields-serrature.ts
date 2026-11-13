import { OPERATORE_MODULO } from './field-options.js';
import {
  ALTRA,
  PORTE_AUTOMATICHE,
  PORTE_CON_OPERATORE,
  PORTE_CON_PATTINO,
  PORTE_MANUALI,
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
 * При ръчни врати — до шейната и „Contatti antine da sostituire?“ и „Blocca portine da installare?“
 * (собственикът, 10 ноември 2026). Операторът (10 ноември 2026): „Vuoi cambiare operatore?“ → „Vuoi
 * compilare modulo d'ordine?“ → кой: 2SG (тогава листът) или друг (написан на ръка).
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
    { key: 'contattiAntine', kind: 'yesno', when: PORTE_MANUALI },
    // Не `bloccaPortine` — колоната на махнатия въпрос от октомври пази старите отговори.
    { key: 'bloccaPortineDaInstallare', kind: 'yesno', when: PORTE_MANUALI },
    {
      key: 'sospensioni',
      kind: 'yesno',
      wide: true,
      question: true,
      modulo: 'ordineSospensioni',
      when: PORTE_AUTOMATICHE,
    },
    { key: 'sospensioniNumero', kind: 'int', min: 0, max: 999, when: yes('sospensioni') },
    { key: 'operatore', kind: 'yesno', wide: true, question: true, when: PORTE_CON_OPERATORE },
    { key: 'operatoreOrdine', kind: 'yesno', wide: true, question: true, when: yes('operatore') },
    {
      key: 'operatoreModulo',
      kind: 'choice',
      options: OPERATORE_MODULO,
      // Листът на 2SG — при „2SG“ (registry.ts, `apertura`), след „Altro“ и полето му.
      modulo: 'ordineSospensioni',
      when: yes('operatoreOrdine'),
    },
    {
      key: 'operatoreModuloAltro',
      kind: 'text',
      maxLength: 120,
      when: ALTRA('operatoreModulo'),
    },
    { key: 'serratureNote', kind: 'textarea', maxLength: 4000, wide: true },
  ],
} as const satisfies SectionDef;
