// Registry of the values the software fills in from the data entered once (src/lib/lift/derive.ts): the travel, the
// estimate of the car mass, the rope lengths and distances of the layout, the machine proposed. Each one is shown as
// automatic on the screen and can be overwritten. Italian texts: they go to the engineer.
import type { Stato } from '@/calc/norme';

export const KL = {
  // estimate of the empty car mass when it is not entered: P = ratio · Q, rounded up to the step [kg]
  carMassRatio: 1.1,
  carMassStep: 10,
  // height of the sheave axis above the machine room floor, per metre of sheave diameter (machine on its bedframe)
  sheaveAxisPerD: 0.9,
} as const;

export type CostanteImpianto = keyof typeof KL;

export interface VoceImpianto {
  id: string;
  titolo: string;
  valore: string;
  riferimento: string;
  fonte: string;
  stato: Stato;
  costanti?: readonly CostanteImpianto[];
  nota?: string;
}

const it = (x: number): string => String(x).replace('.', ',');

export const VOCI_IMPIANTO: readonly VoceImpianto[] = [
  {
    id: 'impianto.corsa', titolo: 'Corsa', valore: 'somma delle altezze tra i piani, dal più basso al più alto',
    riferimento: '—', fonte: 'dati dei piani inseriti', stato: 'derivazione',
  },
  {
    id: 'impianto.portata', titolo: 'Portata e velocità',
    valore: 'la portata inserita, oppure quella della cabina più grande che entra nel vano (Tabella 6); la velocità è una sola per il vano e per la macchina',
    riferimento: 'UNI EN 81-20:2020, 5.4.2.1', fonte: 'progetto del vano', stato: 'derivazione',
  },
  {
    id: 'impianto.massa.cabina', titolo: 'Massa della cabina non inserita',
    valore: `P = ${it(KL.carMassRatio)}·Q arrotondata per eccesso a ${KL.carMassStep} kg: valore di partenza per far girare il calcolo`,
    riferimento: 'ricerca, capitoli 3 e 6 (origine della massa della cabina)', fonte: 'scelta del software, senza fonte', stato: 'stima',
    costanti: ['carMassRatio', 'carMassStep'],
    nota: 'va sostituita con la massa del libretto o con quella ricavata dalla prova di bilanciamento; la sensibilità ±10% ne mostra l\'effetto',
  },
  {
    id: 'impianto.L0', titolo: 'Fune oltre la corsa (L0)',
    valore: `dalla sommità dell'arcata con la cabina all'ultimo piano fino all'asse della puleggia: testata − sommità dell'arcata + solaio del locale + `
      + `asse della puleggia a ${it(KL.sheaveAxisPerD)}·D sul pavimento del locale (macchina in basso o senza locale: fino al soffitto del vano)`,
    riferimento: '—', fonte: 'dati verticali del vano; altezza dell\'asse scelta dal software', stato: 'scelta', costanti: ['sheaveAxisPerD'],
  },
  {
    id: 'impianto.dx', titolo: 'Distanza orizzontale della puleggia di rinvio (dx)',
    valore: 'calata tra la fune di cabina e quella del contrappeso in pianta − D/2 − Dp/2: la puleggia di trazione sopra la cabina, il rinvio sopra '
      + 'il contrappeso',
    riferimento: 'ricerca, capitolo 5.3', fonte: 'pianta del vano', stato: 'derivazione',
  },
  {
    id: 'impianto.Hv', titolo: 'Macchina in basso: altezza fino alle pulegge in alto (Hv)',
    valore: 'corsa + testata: la macchina al livello del piano più basso, le pulegge sotto il soffitto del vano',
    riferimento: 'ricerca, capitolo 5', fonte: 'dati verticali del vano', stato: 'derivazione',
  },
  {
    id: 'impianto.macchina', titolo: 'Macchina proposta',
    valore: 'la prima opzione del dimensionamento (capitolo 8): puleggia, funi, rapporto, gola, motore e freno che passano ogni verifica; con le '
      + 'ipotesi del gruppo (poli, giri, rendimenti, inerzie) inserite',
    riferimento: 'ricerca, capitolo 8', fonte: 'motore di calcolo', stato: 'scelta',
    nota: 'una griglia di calcolo, non un catalogo: il modello reale va scelto dal costruttore con questi valori',
  },
];
