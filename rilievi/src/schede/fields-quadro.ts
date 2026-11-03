import { ALTRA, NON_IDRAULICO, yes } from './field-conditions.js';
import {
  FOSSA_INTERVENTI,
  QUADRO_MARCA,
  QUADRO_MODELLO,
  TESTATA_INTERVENTI,
} from './field-options.js';
import type { SectionDef } from './field-types.js';

/**
 * Разделът „Quadro“ на картата (част от списъка в fields.ts). Таблото: сменя ли се (при No — контролът
 * на челюстите в таблото, раздел „Argano“; 24 октомври 2026); марката (Mastech — и моделът); при марка с
 * модул — поръчката (src/ordini/). Намалената яма и горното пространство — само при електрическа уредба,
 * в реда на листа на собственика (3 ноември 2026): първо горното пространство, после ямата, всяко със
 * списък на решенията; „AMI 100 Mono RTBS“ в който и да е от двата отваря листа за поръчката му
 * (src/ordini/registry.ts — без досегашния въпрос „Installare AMI 100?“ и без Mono UCM). Бележките —
 * след модулите (октомври 2026).
 */
export const SEZIONE_QUADRO = {
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
    { key: 'testataRidotta', kind: 'yesno', question: true, when: NON_IDRAULICO },
    {
      key: 'testataInterventi',
      kind: 'checks',
      options: TESTATA_INTERVENTI,
      wide: true,
      when: yes('testataRidotta'),
    },
    { key: 'fossaRidotta', kind: 'yesno', question: true, when: NON_IDRAULICO },
    {
      key: 'fossaInterventi',
      kind: 'checks',
      options: FOSSA_INTERVENTI,
      wide: true,
      // Листът на AMI 100 Mono RTBS — след двата списъка (отваря го и отметката горе).
      modulo: 'ordineAmi',
      when: yes('fossaRidotta'),
    },
    {
      key: 'grembiuleNote',
      kind: 'text',
      maxLength: 300,
      wide: true,
      when: { field: 'fossaInterventi', values: ['GREMBIULE_3_STADI'] },
    },
    {
      key: 'quadroOrdine',
      kind: 'yesno',
      wide: true,
      question: true,
      modulo: 'ordineQuadro',
      // Марките с модул за поръчка (src/ordini/registry.ts — тестът пази съвпадението).
      when: {
        field: 'quadroMarca',
        values: ['PELAZZA', 'MOVILIFT', 'DMG', 'MASTECH', 'ELETTROQUADRI'],
      },
    },
    { key: 'quadroNote', kind: 'textarea', maxLength: 4000, wide: true },
  ],
} as const satisfies SectionDef;
