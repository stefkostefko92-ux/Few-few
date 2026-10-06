// Registry of the simulation: the numbers the replay in time takes from a standard or chooses itself, with their
// entries for the engineer's checklist. The forces come from the calculation engine (src/calc/model.ts) and its
// registry; here only what the time adds: the motion profile, the door times, the speed on the buffers and their
// stiffness. Italian texts, clause numbers and values only.
import type { Stato } from '../calc/norme';
import { letto } from '../calc/norme-fonti';
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
    riferimento: 'UNI EN 81-50:2020, 5.11.1 e 5.11.2.3.2 (μ della frenatura)', fonte: 'scelta del software', stato: 'scelta',
  },
  {
    id: 'sim.porte', titolo: 'Tempi delle porte',
    valore: `apertura ${it(KS.doorOpen)} s, chiusura ${it(KS.doorClose)} s, sosta a porte aperte ${it(KS.dwell)} s, partenza ${it(KS.startDelay)} s `
      + 'dopo la chiusura',
    riferimento: '—', fonte: 'scelta del software (solo animazione)', stato: 'scelta', costanti: ['doorOpen', 'doorClose', 'dwell', 'startDelay'],
    nota: 'La norma non dà tempi: per le porte automatiche orizzontali dà l\'energia cinetica (≤ 10 J, ≤ 4 J con il dispositivo di protezione '
      + 'escluso) e la forza contro la chiusura (≤ 150 N) (UNI EN 81-20:2020, 5.3.6.2.2.1), dati del fornitore delle porte.',
  },
  {
    id: 'sim.ammortizzatori', titolo: 'Urto sugli ammortizzatori',
    valore: `velocità d'urto ${it(KS.bufferSpeed)} volte la nominale; molle e tamponi in poliuretano come ammortizzatori lineari con la corsa piena `
      + `a ${KV_VERT.bufferFactor} volte il carico statico (lo stesso valore dei carichi sulla fossa; per i tamponi la corsa utile è ${it(KV_VERT.puStroke)}·H); `
      + 'ammortizzatori idraulici con decelerazione costante v₀²/(2·corsa) su tutta la corsa; la cabina e il contrappeso si separano all\'urto',
    riferimento: 'UNI EN 81-20:2020, 5.8.2.1.1.1–5.8.2.1.1.2 (urto al 115 %; corsa piena con un carico statico tra 2,5 e 4 volte: il software prende 4), '
      + '5.8.2.1.2.2 (90 %), 5.8.2.2.1 e 5.8.2.2.3 a)', fonte: letto('UNI EN 81-20:2020', 'pp. 98–99'), stato: 'scelta',
    costanti: ['bufferSpeed'], nota: 'la rigidezza è una scelta del software coerente con i carichi sulla fossa (il tampone in poliuretano reale non è lineare: '
      + 'valori indicativi); la verifica della corsa resta quella della sezione. Le decelerazioni mostrate non sono una verifica: per i tamponi non '
      + 'lineari la norma vuole media ≤ 1 gn, oltre 2,5 gn per non più di 0,04 s, picco ≤ 6 gn e rimbalzo ≤ 1 m/s (5.8.2.1.2.1), per gli idraulici '
      + 'media ≤ 1 gn e oltre 2,5 gn per non più di 0,04 s (5.8.2.2.3); si provano per tipo (certificato del fornitore)',
  },
  {
    id: 'sim.bloccata', titolo: 'Cabina bloccata: rotazione in salita',
    valore: `la macchina gira in salita a ${it(KS.stallSpeed)} m/s finché il contrappeso poggia sui suoi ammortizzatori; poi le funi devono slittare `
      + '(T1/T2 ≥ e^(f·α), μ della cabina bloccata)',
    riferimento: 'UNI EN 81-50:2020, 5.11.2.2.3', fonte: 'motore di calcolo; velocità scelta dal software', stato: 'scelta', costanti: ['stallSpeed'],
    nota: 'La simulazione mostra il contrappeso sugli ammortizzatori con la cabina in alto; la norma chiede anche la cabina vuota in basso, '
      + 'che il calcolo verifica (tr_stall).',
  },
  {
    id: 'sim.passo', titolo: 'Passo di campionamento',
    valore: `${it(KS.step)} s; tra due campioni i valori sono interpolati linearmente`,
    riferimento: '—', fonte: 'scelta del software', stato: 'scelta', costanti: ['step'],
  },
];
