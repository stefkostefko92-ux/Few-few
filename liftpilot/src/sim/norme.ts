// Registry of the simulation: the numbers the replay in time takes from a standard or chooses itself, with their
// entries for the engineer's checklist. The forces come from the calculation engine (src/calc/model.ts) and its
// registry; here only what the time adds: the motion profile, the door times, the speed on the buffers and their
// stiffness. Italian texts, clause numbers and values only.
import type { Stato } from '../calc/norme';
import { KV_VERT } from '../shaft/norme-vert';

export const KS = {
  // jerk of the motion profile [m/s³]: a design datum (ISO 18738-1 measures ride quality, sets no limits)
  jerk: 1,
  // doors [s]: opening, closing, time open at a floor; start after the doors are closed
  doorOpen: 2.5,
  doorClose: 3,
  dwell: 3,
  startDelay: 0.5,
  // UNI EN 81-20:2020, 5.8.2.2.1: buffers for 115 % of the rated speed
  bufferSpeed: 1.15,
  // speed of the machine turning upwards with the counterweight on its buffers (car stalled) [m/s]
  stallSpeed: 0.3,
  // sampling step of the replay [s]
  step: 0.02,
} as const;

export type CostanteSim = keyof typeof KS;

export interface VoceSim {
  id: string;
  titolo: string;
  valore: string;
  riferimento: string;
  fonte: string;
  stato: Stato;
  costanti?: readonly CostanteSim[];
  nota?: string;
}

const it = (x: number): string => String(x).replace('.', ',');

export const VOCI_SIM: readonly VoceSim[] = [
  {
    id: 'sim.forze', titolo: 'Forze nella simulazione',
    valore: 'tiri delle funi, T1/T2, e^(f·α), coppie e decelerazione del freno con le stesse funzioni della verifica (modello delle funi del '
      + 'motore di calcolo), valutate istante per istante con la posizione e l\'accelerazione della cabina',
    riferimento: 'UNI EN 81-50:2020, 5.11 (aderenza); ricerca, capitolo 4', fonte: 'motore di calcolo (src/calc/model.ts)', stato: 'derivazione',
    nota: 'agli estremi della corsa e alle accelerazioni della verifica i valori coincidono con quelli della verifica (test automatico)',
  },
  {
    id: 'sim.profilo', titolo: 'Profilo del moto tra i piani',
    valore: `profilo a strappo limitato: velocità nominale, accelerazione di progetto e strappo ${it(KS.jerk)} m/s³; se il tragitto è corto, la `
      + 'velocità più alta che ci sta',
    riferimento: 'ISO 18738-1:2012 (misura della qualità di marcia, nessun limite)', fonte: 'scelta del software', stato: 'scelta',
    costanti: ['jerk'], nota: 'accelerazione e strappo sono dati di progetto dell\'azionamento, non limiti normativi',
  },
  {
    id: 'sim.aderenza.marcia', titolo: 'Limite di aderenza mostrato durante la marcia',
    valore: 'e^(f·α) con il coefficiente d\'attrito della frenatura (μ ridotto con la velocità delle funi): il confronto è indicativo (oltre il '
      + 'limite: avviso, non verifica fallita), la verifica resta quella dei casi della norma',
    riferimento: 'UNI EN 81-50:2020, 5.11.2.2', fonte: 'scelta del software', stato: 'scelta',
  },
  {
    id: 'sim.porte', titolo: 'Tempi delle porte',
    valore: `apertura ${it(KS.doorOpen)} s, chiusura ${it(KS.doorClose)} s, sosta a porte aperte ${it(KS.dwell)} s, partenza ${it(KS.startDelay)} s `
      + 'dopo la chiusura',
    riferimento: '—', fonte: 'scelta del software (solo animazione)', stato: 'scelta', costanti: ['doorOpen', 'doorClose', 'dwell', 'startDelay'],
  },
  {
    id: 'sim.ammortizzatori', titolo: 'Urto sugli ammortizzatori',
    valore: `velocità d'urto ${it(KS.bufferSpeed)} volte la nominale; ammortizzatore lineare con la corsa piena a ${KV_VERT.bufferFactor} volte il carico `
      + 'statico (lo stesso valore dei carichi sulla fossa); la cabina e il contrappeso si separano all\'urto',
    riferimento: 'UNI EN 81-20:2020, 5.8.2.2', fonte: 'sintesi della norma di costruttori e organismi notificati (fonti secondarie)', stato: 'da_verificare',
    costanti: ['bufferSpeed'], nota: 'la rigidezza è una scelta del software coerente con i carichi sulla fossa; la verifica della corsa resta quella della sezione',
  },
  {
    id: 'sim.bloccata', titolo: 'Cabina bloccata: rotazione in salita',
    valore: `la macchina gira in salita a ${it(KS.stallSpeed)} m/s finché il contrappeso poggia sui suoi ammortizzatori; poi le funi devono slittare `
      + '(T1/T2 ≥ e^(f·α), μ della cabina bloccata)',
    riferimento: 'UNI EN 81-50:2020, 5.11.2', fonte: 'motore di calcolo; velocità scelta dal software', stato: 'scelta', costanti: ['stallSpeed'],
  },
  {
    id: 'sim.passo', titolo: 'Passo di campionamento',
    valore: `${it(KS.step)} s; tra due campioni i valori sono interpolati linearmente`,
    riferimento: '—', fonte: 'scelta del software', stato: 'scelta', costanti: ['step'],
  },
];
