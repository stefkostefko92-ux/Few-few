// The linked data added after the first ones (collegamenti-elenco.ts) — in the order they were added: the order is the
// order of the discrepancies and of the confirmation's fingerprint, so a new link always goes at the end. October 2026
// (the hydraulic power unit and Mastech): the panels among themselves (services), the machine (poles, power, roping,
// sheave, reduction ratio), the retiring cam, the power unit's make. The power and the start of the sheet's power unit
// were taken off (21 October) — and their links with MoviLift. Ported 1:1 from rilievi (src/ordini/collegamenti-aggiunti.ts,
// commit 988f3cf37).
import type { Collegamento } from './collegamenti';

export const AGGIUNTI: readonly Collegamento[] = [
  {
    // The panels among themselves — only when the make or the model changes (one is open).
    key: 'servizi',
    tipo: 'numero',
    membri: [
      { luogo: 'oq', campo: 'nServizi' },
      { luogo: 'mn', campo: 'nServizi' },
      { luogo: 'mq', campo: 'numeroServizi' },
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
    // In kW. MoviLift's «Pot. Mot.» has no unit — not here.
    key: 'potenzaMotore',
    tipo: 'numero',
    membri: [
      { luogo: 'mn', campo: 'potenzaKw' },
      { luogo: 'mq', campo: 'potenzaMotore' },
      { luogo: 'pa', campo: 'potenzaKw' },
    ],
  },
  {
    // The roping: the argano sheet's «Taglia 1:2» is NG120's «2:1».
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
    ],
  },
  {
    // The power unit's make; MoviLift's «Centralina» may be the model too — prefill only.
    key: 'centralina',
    tipo: 'numero',
    confronto: false,
    membri: [
      { luogo: 'scheda', campo: 'centralinaMarca' },
      { luogo: 'om', campo: 'centralina' },
    ],
  },
];
