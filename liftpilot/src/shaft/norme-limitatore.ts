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
  // 5.6.2.2.1.3 c): the pitch diameter of the governor's sheaves at least this many times the rope's nominal diameter
  govSheaveRatio: 30,
  // a machine below with its pulleys hung under the slab: the governor on a bracket from the side wall, its axle this
  // far under the slab (the 3D's) [mm]
  govUnderCeiling: 420,
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
      + 'guida, sull’ultima parete libera — o sull’altra parete libera quando solo lì il limitatore resta fuori dall’ingombro dell’argano nel '
      + 'locale (l’argano girato con il motore verso la cabina può arrivare sopra la fune)',
    riferimento: 'nessuna distanza della fune del limitatore nella norma (UNI EN 81-20:2020, 5.6.2.2.1); 50 mm come tra cabina e contrappeso in '
      + 'UNI EN 81-1:2008, 11.3; con la balaustra sul tetto 100 mm dentro il bordo, i 0,10 m di 5.4.7.4 d) sono rispettati; superficie libera per '
      + 'la manutenzione delle parti in movimento: UNI EN 81-20:2020, 5.2.6.3.2.1 b)',
    fonte: `scelta del software (50, 60 e 400 mm); ${letto('UNI EN 81-20:2020', 'pp. 43, 71–72, 82–83')}; ${letto('UNI EN 81-1:2008', 'p. 67')}`, stato: 'scelta',
    verifiche: ['v_gov', 'v_govrail', 'm_gov', 'm_govfree'],
    nota: 'con l’arcata a zaino, o senza una parete laterale libera, il software non mette il limitatore: la verifica della fune resta '
      + '«Attenzione» senza valore e il limitatore va posizionato a mano',
  },
  {
    id: 'limitatore.fune', gruppo: 'ingombri', titolo: 'Pulegge del limitatore e diametro della fune',
    valore: 'diametro primitivo delle pulegge del limitatore almeno 30 volte il diametro nominale della sua fune (dai dati del modello: '
      + 'diametro della puleggia e fune)',
    riferimento: 'UNI EN 81-20:2020, 5.6.2.2.1.3 c)', fonte: letto('UNI EN 81-20:2020', 'p. 83'), stato: 'confermato',
    nota: 'un modello con la fune più grossa del rapporto (fune «in deroga» del costruttore) non passa: si sceglie un altro modello o la fune che '
      + 'il rapporto ammette, salvo una deroga documentata dal certificato del costruttore',
    verifiche: ['v_govdd'],
  },
  {
    id: 'limitatore.vano', gruppo: 'ingombri', titolo: 'Macchina in basso: limitatore di velocità nel vano',
    valore: 'con le pulegge di rinvio appese sotto la soletta il limitatore sta nel vano, su una mensola fissata alla parete laterale della sua '
      + 'fune, con l’asse a 420 mm sotto il soffitto, fuori dalla pianta della cabina; non è raggiungibile da fuori del vano: si ordina con '
      + 'l’intervento comandato a distanza via cavo da fuori del vano (dal quadro), raggiungibile per ispezione e manutenzione dal tetto di '
      + 'cabina, con il ritorno automatico in posizione normale quando la cabina o il contrappeso salgono e le parti elettriche ripristinabili '
      + 'a distanza; la fune del limitatore va dal soffitto del vano alla fossa. Con il locale delle pulegge sopra il vano il limitatore sta '
      + 'in quel locale. Il carico del limitatore (P4) va sulla parete della mensola',
    riferimento: 'UNI EN 81-20:2020, 5.6.2.2.1.4 a), b) e c) 1)–3), 5.6.2.2.1.5', fonte: `scelta del software (420 mm); ${letto('UNI EN 81-20:2020', 'p. 83')}`,
    stato: 'scelta',
    nota: 'la mensola, il cavo del comando a distanza e il ripristino sono del costruttore del limitatore: da confermare sulla sua scheda',
  },
];

/** Constants of this registry, for the test that every one has its entry. */
export const COSTANTI_LIMITATORE = { 'limitatore.posto': ['govGap', 'govStile', 'govReach'], 'limitatore.fune': ['govSheaveRatio'], 'limitatore.vano': ['govUnderCeiling'] } as const;
