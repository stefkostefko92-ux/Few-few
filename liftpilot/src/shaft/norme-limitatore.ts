// Registry of where the overspeed governor and its rope stand (governor.ts): the rope beside the car in the shaft, clear
// of the car, the walls, the car rail with its bracket and the sling's upright, its clamped strand within the reach of
// the safety gear's lever; the governor on the room's floor clear of the machine, the control panel and the main switch,
// with its free area. The constants are spread into KV_VERT (norme-vert.ts), the entries into VOCI_VERT. Same form as
// norme.ts; Italian texts, clause numbers and values only (the numbers written as literals: the registry test compares
// them).
import { letto } from '../calc/norme-fonti';
import type { VoceVano } from './norme';

export const KV_GOV = {
  // the governor's rope clear of the car, of the walls and of the car rail with its bracket and the sling's upright,
  // by this much at least [mm]; the upright round the car rail's axis, this far either side of it [mm]
  govGap: 50,
  govStile: 60,
  // the strand clamped to the car at most this far from the car rail's axis, where the safety gear's lever reaches [mm]
  govReach: 400,
} as const;

export const VOCI_LIMITATORE: readonly VoceVano[] = [
  {
    id: 'limitatore.posto', gruppo: 'ingombri', titolo: 'Posizione del limitatore di velocità e della sua fune',
    valore: 'la fune scorre a piombo su una parete laterale senza porte né contrappeso, nello spazio tra la cabina e la parete accanto alla guida '
      + 'di cabina: lontana almeno 50 mm dalla cabina, dalle pareti e dalla guida con la sua staffa e il montante dell’arcata (preso largo 60 mm '
      + 'per parte dall’asse della guida); il ramo agganciato alla cabina entro 400 mm dall’asse della guida, dove arriva la leva del paracadute. '
      + 'Il limitatore nel locale sta sopra la sua fune, fuori dall’ingombro dell’argano con il suo basamento, del quadro e dell’interruttore '
      + 'generale, dentro il locale, con accanto una superficie libera di 500 × 600 mm per la manutenzione. Lato, distanza dalla parete e ramo '
      + 'agganciato si scelgono a mano; altrimenti il software mette la fune a metà dello spazio accanto alla cabina, 145 mm dietro l’asse della '
      + 'guida, sull’ultima parete libera',
    riferimento: 'nessuna distanza della fune del limitatore nella norma (UNI EN 81-20:2020, 5.6.2.2.1); 50 mm come tra cabina e contrappeso in '
      + 'UNI EN 81-1:2008, 11.3; con la balaustra sul tetto 100 mm dentro il bordo, i 0,10 m di 5.4.7.4 d) sono rispettati; superficie libera per '
      + 'la manutenzione delle parti in movimento: UNI EN 81-20:2020, 5.2.6.3.2.1 b)',
    fonte: `scelta del software (50, 60 e 400 mm); ${letto('UNI EN 81-20:2020', 'pp. 43, 71–72, 82–83')}; ${letto('UNI EN 81-1:2008', 'p. 67')}`, stato: 'scelta',
    verifiche: ['v_gov', 'v_govrail', 'm_gov', 'm_govfree'],
  },
];

/** Constants of this registry, for the test that every one has its entry. */
export const COSTANTI_LIMITATORE = { 'limitatore.posto': ['govGap', 'govStile', 'govReach'] } as const;
