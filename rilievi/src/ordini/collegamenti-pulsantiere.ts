import type { Collegamento } from './collegamenti.js';
import { spunta } from './collegamenti-spunta.js';

/**
 * Бутониерите на DMG (3 ноември 2026): Pitagora (разделите „Pulsantiere di cabina / di piano“ — с
 * таблото) и QF Fixtures (поръчката на бутониерите) питат едно и също и могат да са отворени заедно.
 * Последни в списъка (след collegamenti-quadri.ts). Изборът, при който Fixtures е по-подробен и би
 * трябвало да се гадае („Dardo“ квадратен или кръгъл, „Matisse 7″ / 10,1″“, „Telefono Amigo + GSM“, моделът
 * и размерът на плочата), не е тук.
 */
const LIVELLI = [
  ['alto', 'palto'],
  ['intermedi', 'pintermedi'],
  ['basso', 'pbasso'],
] as const;

const SEGNALI = ['Gong', 'Presente', 'Allarme', 'FuoriServizio'] as const;

export const PULSANTIERE: readonly Collegamento[] = [
  {
    key: 'copMateriale',
    tipo: 'scelta',
    membri: [
      {
        luogo: 'dp',
        campo: 'materiale',
        voci: {
          inoxScotchBrite: 'INOX_SB',
          inoxMirror: 'INOX_MIRROR',
          g320: 'G320',
          pvdSatinato: 'PVD_SATINATO',
          pvdLucido: 'PVD_LUCIDO',
          lino: 'LINO',
        },
      },
      {
        luogo: 'db',
        campo: 'cMateriale',
        voci: {
          inoxScotchBrite: 'INOX_SB',
          inoxMirror: 'INOX_MIRROR',
          g320: 'G320',
          pvdSatinato: 'PVD_SATINATO',
          pvdLucido: 'PVD_LUCIDO',
          lino: 'LINO',
        },
      },
    ],
  },
  {
    key: 'copPulsanti',
    tipo: 'scelta',
    membri: [
      {
        luogo: 'dp',
        campo: 'pulsanti',
        voci: { macro: 'MACRO', disco: 'DISCO', sherman: 'SHERMAN', panzer: 'PANZER' },
      },
      {
        luogo: 'db',
        campo: 'pulsante',
        voci: { macro: 'MACRO', disco: 'DISCO', sherman: 'SHERMAN', panzer: 'PANZER' },
      },
    ],
  },
  {
    key: 'copIlluminazione',
    tipo: 'scelta',
    membri: (['dp', 'db'] as const).map((luogo) => ({
      luogo,
      campo: 'illuminazione',
      voci: {
        singolaRossa: 'SINGOLA_ROSSA',
        singolaBlu: 'SINGOLA_BLU',
        doppiaRossa: 'DOPPIA_ROSSA',
        doppiaBlu: 'DOPPIA_BLU',
      },
    })),
  },
  ...(['Apri', 'Chiudi', 'Allarme', 'Stop'] as const).map((nome) =>
    spunta(`servizio${nome}`, [
      ['dp', `servizio${nome}`],
      ['db', `servizio${nome}`],
    ]),
  ),
  ...([1, 2] as const).flatMap((n): Collegamento[] => [
    {
      key: `chiave${n}Tipo`,
      tipo: 'scelta',
      membri: [
        {
          luogo: 'dp',
          campo: `chiave${n}Tipo`,
          voci: { kaba: 'KABA', viro: 'VIRO', euro: 'EURO' },
        },
        {
          luogo: 'db',
          campo: `cChiave${n}Tipo`,
          voci: { kaba: 'KABA', viro: 'VIRO', euro: 'EURO' },
        },
      ],
    },
    {
      key: `chiave${n}Posizioni`,
      tipo: 'scelta',
      membri: [
        {
          luogo: 'dp',
          campo: `chiave${n}Pe`,
          voci: { p2e1: 'P2E1', p2e1rm: 'P2E1RM', p2e2: 'P2E2' },
        },
        {
          luogo: 'db',
          campo: `cChiave${n}Pe`,
          voci: { p2e1: 'P2E1', p2e1rm: 'P2E1RM', p2e2: 'P2E2' },
        },
      ],
    },
    {
      key: `chiave${n}Incisione`,
      tipo: 'numero',
      membri: [
        { luogo: 'dp', campo: `chiave${n}Incisione` },
        { luogo: 'db', campo: `cChiave${n}Incisione` },
      ],
    },
  ]),
  spunta('smartKey', [
    ['dp', 'smartKey'],
    ['db', 'cSmartKey'],
  ]),
  {
    key: 'smartKeyMaster',
    tipo: 'numero',
    membri: [
      { luogo: 'dp', campo: 'smartKeyMaster' },
      { luogo: 'db', campo: 'cSmartKeyMaster' },
    ],
  },
  {
    key: 'smartKeyUser',
    tipo: 'numero',
    membri: [
      { luogo: 'dp', campo: 'smartKeyUser' },
      { luogo: 'db', campo: 'cSmartKeyUser' },
    ],
  },
  {
    key: 'numeroCe',
    tipo: 'numero',
    membri: [
      { luogo: 'dp', campo: 'displayCe' },
      { luogo: 'db', campo: 'ce' },
    ],
  },
  // Бутониерите на етажите — най-горният, междинните, най-долният: ключ, гонг и трите сигнала.
  ...LIVELLI.flatMap(([dp, db]): Collegamento[] => [
    {
      key: `${dp}Chiave`,
      tipo: 'scelta',
      membri: [
        { luogo: 'dp', campo: `${dp}Chiave`, voci: { chiave: 'SI' } },
        { luogo: 'db', voci: { [`${db}Chiave`]: 'SI' } },
      ],
    },
    ...SEGNALI.map((segnale) =>
      spunta(`${dp}${segnale}`, [
        ['dp', `${dp}${segnale}`],
        ['db', `${db}${segnale}`],
      ]),
    ),
  ]),
];
