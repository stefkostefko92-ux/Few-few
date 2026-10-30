import type { Collegamento } from './collegamenti.js';

/**
 * Свързаните данни, добавени след първите (collegamenti-elenco.ts) — в реда на добавянето: редът е
 * редът на разминаванията и на отпечатъка на потвърждението, затова нова връзка е винаги в края.
 * Октомври 2026 (централата и Mastech): таблата помежду си (сервизи), машината (полюси, мощност,
 * окачване, шайба, предавателно число), шейната, марката на централата. Мощността и пускането на
 * централата на картата са махнати (21 октомври) — и връзките им с MoviLift. Elettroquadri (30
 * октомври) — в същите връзки (без нови).
 */
export const AGGIUNTI: readonly Collegamento[] = [
  {
    // Таблата помежду си — само при смяна на марката или модела (отворено е едно).
    key: 'servizi',
    tipo: 'numero',
    membri: [
      { luogo: 'oq', campo: 'nServizi' },
      { luogo: 'mn', campo: 'nServizi' },
      { luogo: 'mq', campo: 'numeroServizi' },
      { luogo: 'eg', campo: 'nServizi' },
      { luogo: 'el', campo: 'nServizi' },
      { luogo: 'eo', campo: 'nServizi' },
    ],
  },
  {
    key: 'poli',
    tipo: 'numero',
    membri: [
      { luogo: 'mn', campo: 'nPoli' },
      { luogo: 'mq', campo: 'numeroPoli' },
      { luogo: 'pa', campo: 'poli' },
    ],
  },
  {
    // В kW. „Pot. Mot.“ на MoviLift е без мерна единица — не е тук.
    key: 'potenzaMotore',
    tipo: 'numero',
    membri: [
      { luogo: 'mn', campo: 'potenzaKw' },
      { luogo: 'mq', campo: 'potenzaMotore' },
      { luogo: 'eg', campo: 'motoreKw' },
      { luogo: 'el', campo: 'motoreKw' },
      { luogo: 'eo', campo: 'motoreKw' },
      { luogo: 'pa', campo: 'potenzaKw' },
    ],
  },
  {
    // Окачването: „Taglia 1:2“ на листа за аргано е „2:1“ на NG120.
    key: 'taglia',
    tipo: 'scelta',
    membri: [
      { luogo: 'mn', voci: { taglia11: '1:1', taglia21: '2:1' } },
      { luogo: 'pa', voci: { taglia11: '1:1', taglia12: '2:1' } },
    ],
  },
  {
    key: 'diametroPuleggia',
    tipo: 'numero',
    membri: [
      { luogo: 'mn', campo: 'diametroPuleggia' },
      { luogo: 'pa', campo: 'diametroPuleggia' },
    ],
  },
  {
    key: 'rapportoRiduzione',
    tipo: 'numero',
    membri: [
      { luogo: 'mn', campo: 'rapportoRiduzione' },
      { luogo: 'pa', campo: 'rapportoRiduzione' },
    ],
  },
  {
    key: 'tensionePattino',
    tipo: 'numero',
    membri: [
      { luogo: 'om', campo: 'elettrPattinoV' },
      { luogo: 'mn', campo: 'tensionePattino' },
      { luogo: 'mq', campo: 'tensionePattino' },
      { luogo: 'eg', campo: 'pattinoV' },
      { luogo: 'eo', campo: 'pattinoV' },
    ],
  },
  {
    // Марката на централата; „Centralina“ на MoviLift може да е и моделът — само попълване.
    key: 'centralina',
    tipo: 'numero',
    confronto: false,
    membri: [
      { luogo: 'scheda', campo: 'centralinaMarca' },
      { luogo: 'om', campo: 'centralina' },
      { luogo: 'eo', campo: 'centralinaMarca' },
    ],
  },
];
