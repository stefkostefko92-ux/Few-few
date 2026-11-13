import type { Collegamento } from './collegamenti.js';
import { spunta } from './collegamenti-spunta.js';

/**
 * Таблата помежду си (3 ноември 2026) — след collegamenti-scheda.ts: никога не са отворени заедно, затова
 * връзката им служи при смяна на марката или модела — написаното в едното табло отива в другото.
 */
export const QUADRI: readonly Collegamento[] = [
  {
    // Марката на мотора; Pitagora пише и модела — само попълване.
    key: 'motoreMarca',
    tipo: 'numero',
    confronto: false,
    membri: [
      { luogo: 'dp', campo: 'motoreMarca' },
      { luogo: 'mn', campo: 'motore' },
      { luogo: 'eg', campo: 'motoreMarca' },
      { luogo: 'gt', campo: 'motoreMarca' },
    ],
  },
  {
    // „Inverter“ на MoviLift може да е марката или моделът — само попълване.
    key: 'vvvfMarca',
    tipo: 'numero',
    confronto: false,
    membri: [
      { luogo: 'om', campo: 'inverter' },
      { luogo: 'eg', campo: 'vvvfMarca' },
      { luogo: 'el', campo: 'vvvfMarca' },
    ],
  },
  {
    // Екранираният кабел на мотора, в метри.
    key: 'cavoSchermato',
    tipo: 'numero',
    membri: [
      { luogo: 'oq', campo: 'cavoSchermatoMt' },
      { luogo: 'om', campo: 'cavoSchermato' },
      { luogo: 'mn', campo: 'cavoMotoreM' },
      { luogo: 'eg', campo: 'cavoSchermatoMt' },
    ],
  },
  {
    key: 'fotocellulaVolt',
    tipo: 'numero',
    membri: [
      { luogo: 'oq', campo: 'fotocellulaVolt' },
      { luogo: 'om', campo: 'fotocellulaV' },
      { luogo: 'gt', campo: 'barrieraTensione' },
    ],
  },
  {
    key: 'pattiniNumero',
    tipo: 'numero',
    membri: [
      { luogo: 'oq', campo: 'circuitoPattiniN' },
      { luogo: 'eg', campo: 'pattinoN' },
      { luogo: 'eo', campo: 'pattinoN' },
    ],
  },
  {
    key: 'valvoleNumero',
    tipo: 'numero',
    membri: [
      { luogo: 'om', campo: 'elettroValvN' },
      { luogo: 'dp', campo: 'valvoleN' },
      { luogo: 'eo', campo: 'elettrovalvoleN' },
      { luogo: 'gt', campo: 'nValvole' },
    ],
  },
  {
    key: 'forzaMotrice',
    tipo: 'numero',
    membri: [
      { luogo: 'mq', campo: 'forzaMotrice' },
      { luogo: 'eg', campo: 'forzaMotrice' },
      { luogo: 'el', campo: 'forzaMotriceV' },
      { luogo: 'eo', campo: 'forzaMotrice' },
    ],
  },
  {
    key: 'correnteFreno',
    tipo: 'numero',
    membri: [
      { luogo: 'mn', campo: 'correnteFreno' },
      { luogo: 'eg', campo: 'frenoIn' },
    ],
  },
  {
    key: 'ventilazioneVolt',
    tipo: 'numero',
    membri: [
      { luogo: 'oq', campo: 'ventVca' },
      { luogo: 'eg', campo: 'ventilazioneForzataV' },
      { luogo: 'el', campo: 'ventilazioneForzataV' },
    ],
  },
  {
    key: 'precablato',
    tipo: 'scelta',
    membri: [
      { luogo: 'oq', voci: { precablato: 'SI' } },
      { luogo: 'om', campo: 'fornitura', voci: { precablato: 'SI' } },
      { luogo: 'dp', campo: 'cablaggio', voci: { precablato: 'SI' } },
      { luogo: 'mn', voci: { precablaggioSi: 'SI' } },
      { luogo: 'eg', voci: { precablaggio: 'SI' } },
      { luogo: 'eo', voci: { precablaggio: 'SI' } },
      { luogo: 'gt', voci: { precablato: 'SI' } },
    ],
  },
  {
    // Универсална или събирателна (само надолу / в двете посоки) — „prenotazione“ на Pelazza под
    // simplex, duplex и triplex.
    key: 'manovra',
    tipo: 'scelta',
    membri: [
      {
        luogo: 'oq',
        voci: {
          manUniversale: 'UNIVERSALE',
          simplexSoloDiscesa: 'DISCESA',
          simplexSalitaDiscesa: 'COMPLETA',
          duplexSoloDiscesa: 'DISCESA',
          duplexSalitaDiscesa: 'COMPLETA',
          triplexSoloDiscesa: 'DISCESA',
          triplexSalitaDiscesa: 'COMPLETA',
        },
      },
      {
        luogo: 'dp',
        campo: 'manovra',
        voci: {
          universale: 'UNIVERSALE',
          collettivoDiscesa: 'DISCESA',
          collettivoCompleto: 'COMPLETA',
        },
      },
      {
        luogo: 'mn',
        voci: {
          manUniversale: 'UNIVERSALE',
          manCollettivaDiscesa: 'DISCESA',
          manCollettivaCompleta: 'COMPLETA',
        },
      },
      ...(['eg', 'el', 'eo'] as const).map((luogo) => ({
        luogo,
        voci: {
          manovraUniversale: 'UNIVERSALE',
          collettivaDiscesa: 'DISCESA',
          collettivaCompleta: 'COMPLETA',
        },
      })),
      {
        luogo: 'gt',
        voci: {
          universale: 'UNIVERSALE',
          prenotazioneDiscesa: 'DISCESA',
          prenotazioneCompleta: 'COMPLETA',
        },
      },
    ],
  },
  {
    // Една, две или три кабини; „Multiplex“ на Pitagora е две или повече — не е тук.
    key: 'funzionamento',
    tipo: 'scelta',
    membri: [
      { luogo: 'oq', voci: { manSimplex: 'SIMPLEX', manDuplex: 'DUPLEX', manTriplex: 'TRIPLEX' } },
      { luogo: 'dp', campo: 'funzionamento', voci: { simplex: 'SIMPLEX' } },
      { luogo: 'mn', voci: { manSimplex: 'SIMPLEX', manDuplex: 'DUPLEX' } },
      ...(['eg', 'el', 'eo'] as const).map((luogo) => ({
        luogo,
        voci: { manovraSimplex: 'SIMPLEX', manovraDuplex: 'DUPLEX', manovraTriplex: 'TRIPLEX' },
      })),
      { luogo: 'gt', voci: { duplex: 'DUPLEX', triplex: 'TRIPLEX' } },
    ],
  },
  {
    // Основната норма: EN 81-1/2 (95/16) или EN 81-20/50.
    key: 'normaEn81',
    tipo: 'scelta',
    membri: [
      { luogo: 'oq', voci: { normaEn8120: 'EN8120' } },
      { luogo: 'dp', campo: 'normativa', voci: { en8112: 'EN811', en8120: 'EN8120' } },
      { luogo: 'mn', voci: { en811: 'EN811' } },
      { luogo: 'mq', voci: { en811: 'EN811' } },
      { luogo: 'eg', voci: { normaEn811: 'EN811', norma8120: 'EN8120' } },
      { luogo: 'el', voci: { en811: 'EN811' } },
      { luogo: 'eo', voci: { normaEn811: 'EN811', norma8120: 'EN8120' } },
      { luogo: 'gt', voci: { en811: 'EN811', en8120: 'EN8120' } },
    ],
  },
  spunta('norma8121', [
    ['mq', 'en8121'],
    ['eg', 'norma8121'],
    ['eo', 'norma8121'],
    ['gt', 'en8121'],
  ]),
  spunta('norma8128', [
    ['mn', 'en8128'],
    ['eg', 'norma8128'],
    ['el', 'en8128'],
    ['eo', 'norma8128'],
  ]),
  spunta('norma8170', [
    ['oq', 'normaEn8170'],
    ['om', 'en8170'],
    ['mn', 'en8170'],
    ['mq', 'en8170'],
    ['eg', 'norma8170'],
    ['el', 'en8170'],
    ['eo', 'norma8170'],
    ['gt', 'en8170'],
  ]),
  spunta('norma8172', [
    ['oq', 'normaEn8172'],
    ['mn', 'en8172'],
    ['mq', 'en8172'],
    ['eg', 'norma8172'],
    ['el', 'en8172'],
    ['eo', 'norma8172'],
    ['gt', 'en8172'],
  ]),
  spunta('norma8173', [
    ['oq', 'normaEn8173'],
    ['mq', 'en8173'],
    ['eg', 'norma8173'],
    ['el', 'en8173'],
    ['eo', 'norma8173'],
    ['gt', 'en8173'],
  ]),
  spunta('legge13', [
    ['oq', 'normaLegge13'],
    ['om', 'legge13'],
    ['dp', 'segnalazioneDm236'],
    ['mn', 'dm236'],
    ['mq', 'dm236'],
    ['eg', 'dm236'],
    ['el', 'dm236'],
    ['eo', 'dm236'],
  ]),
  spunta('norma9516', [
    ['mn', 'normativa9516'],
    ['mq', 'normativa9516'],
    ['el', 'n9516'],
  ]),
  spunta('dm2005', [
    ['dp', 'dm2005'],
    ['mq', 'dm2005'],
  ]),
  spunta('sintesiVocale', [
    ['oq', 'cabSintesiVocale'],
    ['om', 'sintesiVoc'],
    ['dp', 'sintesiVocale'],
    ['eg', 'sintesiVocale'],
    ['eo', 'sintesiVocale'],
    ['gt', 'sintesiVocale'],
  ]),
  spunta('manovraOspedaliera', [
    ['oq', 'manovraOspedaliera'],
    ['eg', 'manovraOspedaliera'],
    ['eo', 'manovraOspedaliera'],
  ]),
  spunta('fondoMobile', [
    ['oq', 'fondoMobile'],
    ['om', 'fondoMobile'],
  ]),
  spunta('sovraccarico', [
    ['oq', 'cabSovraccarico'],
    ['om', 'sovraccarico'],
    ['mn', 'cabSovraccarico'],
    ['mq', 'cabSovraccarico'],
    ['el', 'sovraccarico'],
    ['gt', 'segnSovraccarico'],
  ]),
  spunta('pienoCarico', [
    ['oq', 'fondoPienoCarico'],
    ['mn', 'cabPienoCarico'],
    ['mq', 'cabPienoCarico'],
    ['el', 'pienoCarico'],
  ]),
];
