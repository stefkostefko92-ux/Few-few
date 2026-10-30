import type { Collegamento } from './collegamenti.js';

/**
 * Свързаните данни — втората част на първия списък (collegamenti-elenco.ts, след въжетата): адресът,
 * матрикулата, марката, видът на уредбата, операторът (между таблата), токът и оборотите на мотора.
 * Отделени, за да не расте файлът на списъка; редът е същият (след първата част, преди добавените).
 */
export const IMPIANTO: readonly Collegamento[] = [
  {
    key: 'indirizzo',
    tipo: 'numero',
    membri: [
      { luogo: 'scheda', campo: 'indirizzo' },
      { luogo: 'pa', campo: 'indirizzo' },
    ],
  },
  {
    key: 'matricola',
    tipo: 'numero',
    membri: [
      { luogo: 'scheda', campo: 'matricola' },
      { luogo: 'pa', campo: 'matricola' },
    ],
  },
  {
    key: 'marca',
    tipo: 'numero',
    membri: [
      { luogo: 'scheda', campo: 'marca' },
      { luogo: 'pa', campo: 'marca' },
    ],
  },
  {
    // „Idraulico“ в „Tipo di Quadro“ на Pelazza; електрическата и MRL нямат своя отметка там.
    key: 'tipoImpianto',
    tipo: 'scelta',
    membri: [
      {
        luogo: 'scheda',
        campo: 'tipoImpianto',
        voci: { ELETTRICO: 'ELETTRICO', IDRAULICO: 'IDRAULICO', GEARLESS: 'GEARLESS' },
      },
      { luogo: 'oq', voci: { tqIdraulico: 'IDRAULICO' } },
    ],
  },
  {
    // Операторът — таблата помежду си, само при смяна на марката или модела (отворено е едно). „Modello“
    // на Pelazza често е по-подробен от марката („Selcom Midi Supra“) — само попълване.
    key: 'operatoreMarca',
    tipo: 'numero',
    confronto: false,
    membri: [
      { luogo: 'oq', campo: 'opModello' },
      { luogo: 'om', campo: 'marcaOpA' },
      { luogo: 'mq', campo: 'modelloOperatore1' },
      { luogo: 'eg', campo: 'operatoreMarca' },
      { luogo: 'el', campo: 'operatoreTipo' },
      { luogo: 'eo', campo: 'operatoreMarca' },
    ],
  },
  {
    // Токът на мотора: „In (A)“ на Pelazza, „Amp.“ в „Fune“ на MoviLift, „Corrente (A)“ на аргано;
    // Elettroquadri — „In“ на мотора (geared), „AMP“ (gearless; oleodinamico — моторът на централата).
    key: 'correnteMotore',
    tipo: 'numero',
    membri: [
      { luogo: 'oq', campo: 'motIn' },
      { luogo: 'om', campo: 'amp' },
      { luogo: 'mn', campo: 'correnteNominale' },
      { luogo: 'mq', campo: 'correnteMotore' },
      { luogo: 'eg', campo: 'motoreIn' },
      { luogo: 'el', campo: 'motoreAmp' },
      { luogo: 'eo', campo: 'motoreAmp' },
      { luogo: 'pa', campo: 'ampere' },
    ],
  },
  {
    key: 'giriMotore',
    tipo: 'numero',
    membri: [
      { luogo: 'om', campo: 'numGiri' },
      { luogo: 'pa', campo: 'giri' },
    ],
  },
];
