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
  // 5.6.2.2.1.1 a): the tripping speed at least this many times the rated speed, and below the safety gear's limit — an
  // instantaneous one 0,80 m/s, one with a roller 1 m/s, a progressive one 1,5 m/s up to a rated speed of 1 m/s and
  // 1,25·v + 0,25/v over it [m/s]
  govTripMin: 1.15,
  govTripInstant: 0.8,
  govTripRoller: 1,
  govTripProgressive: 1.5,
  govTripProgressiveV: 1,
  govTripK: 1.25,
  govTripC: 0.25,
  // a machine below with its pulleys hung under the slab: the governor on a bracket from the side wall, its axle this
  // far under the slab (the 3D's) [mm]
  govUnderCeiling: 420,
} as const;

/** The governor rope's distance: none in the standard, the software's choice by analogy with another clause. */
const GOV_ROPE = 'nessuna distanza della fune del limitatore nella norma (UNI EN 81-20:2020, 5.6.2.2.1); 50 mm scelta del software, come tra '
  + 'cabina e contrappeso in UNI EN 81-1:2008, 11.3; con la balaustra sul tetto 100 mm dentro il bordo, i 0,10 m di 5.4.7.4 d) sono rispettati';

export const VOCI_LIMITATORE: readonly VoceVano[] = [
  {
    id: 'limitatore.posto', gruppo: 'ingombri', titolo: 'Posizione del limitatore di velocità e della sua fune',
    valore: 'la fune scorre a piombo su una parete laterale senza porte né contrappeso, nello spazio tra la cabina e la parete accanto alla guida di '
      + 'cabina: lontana almeno 50 mm dalla cabina, dalle pareti e dalla guida con la sua staffa e il montante dell’arcata (preso largo 60 mm per '
      + 'parte dall’asse della guida); il ramo agganciato alla cabina entro 400 mm dall’asse della guida, dove arriva la leva del paracadute. Il '
      + 'limitatore nel locale sta sopra la sua fune, fuori dall’ingombro dell’argano con il suo basamento, del quadro e dell’interruttore '
      + 'generale, dentro il locale, con accanto una superficie libera di 500 × 600 mm per la manutenzione (accanto a un lato più corto di 500 mm '
      + 'la superficie va oltre i suoi spigoli, entro i muri); il limitatore esistente rilevato con le funi attraverso la soletta ha il loro foro '
      + 'sopra l’interno del vano (a cavallo di un muro: attenzione; fuori dal vano: non passa, misura da ricontrollare). Lato, distanza dalla '
      + 'parete e ramo agganciato si scelgono a mano; altrimenti il software mette la fune a metà dello spazio accanto alla cabina, 145 mm dietro '
      + 'l’asse della guida, sull’ultima parete libera — o sull’altra parete libera quando solo lì il limitatore resta fuori dall’ingombro '
      + 'dell’argano nel locale (l’argano girato con il motore verso la cabina può arrivare sopra la fune)',
    riferimento: `${GOV_ROPE}; superficie libera per la manutenzione delle parti in movimento: UNI EN 81-20:2020, 5.2.6.3.2.1 b)`,
    fonte: `scelta del software (50, 60 e 400 mm); ${letto('UNI EN 81-20:2020', 'pp. 43, 71–72, 82–83')}; ${letto('UNI EN 81-1:2008', 'p. 67')}`, stato: 'scelta',
    verifiche: ['v_gov', 'v_govrail', 'm_gov', 'm_govfree', 'm_govdrop'],
    // each check its own source: the rope's distance by analogy, the strand's reach and the governor's place in the room
    // the software's (the plan's geometry), the free area beside it the standard's
    rifVerifica: {
      v_gov: GOV_ROPE, v_govrail: 'scelta del software, dove arriva la leva del paracadute (nessuna distanza nella norma: UNI EN 81-20:2020, 5.6.2.2.1)',
      m_gov: '—', m_govfree: 'UNI EN 81-20:2020, 5.2.6.3.2.1 b)', m_govdrop: '—',
    },
    nota: 'con l’arcata a zaino, o senza una parete laterale libera, il software non mette il limitatore: la verifica della fune resta '
      + '«Attenzione» senza valore e il limitatore va posizionato a mano',
  },
  {
    id: 'limitatore.fune', gruppo: 'ingombri', titolo: 'Pulegge del limitatore e diametro della fune',
    valore: 'diametro primitivo delle pulegge del limitatore almeno 30 volte il diametro nominale della sua fune (dai dati del modello: '
      + 'diametro della puleggia e fune); dato del fornitore, da verificare: il carico minimo di rottura della fune almeno 8 volte la forza '
      + 'di trazione che il limitatore produce nella fune all’intervento (μ massimo 0,2 per i limitatori ad aderenza), e quella forza non '
      + 'sotto il doppio della forza che fa prendere il paracadute né sotto 300 N',
    riferimento: 'UNI EN 81-20:2020, 5.6.2.2.1.3 c); 5.6.2.2.1.3 b) e 5.6.2.2.1.1 d) (dati del fornitore)', fonte: letto('UNI EN 81-20:2020', 'pp. 82–83'), stato: 'confermato',
    nota: 'un modello con la fune più grossa del rapporto (fune «in deroga» del costruttore) non passa: si sceglie un altro modello o la fune che '
      + 'il rapporto ammette, salvo una deroga documentata dal certificato del costruttore. La forza all’intervento è del limitatore e la forza di '
      + 'presa del paracadute è del paracadute, entrambi componenti con esame di tipo: il software non le conosce e non verifica il coefficiente '
      + 'della fune (il carico P4 dei dati dell’impianto è quello sulla soletta, non questa forza); lo dice la relazione fra le verifiche che '
      + 'il software non calcola',
    verifiche: ['v_govdd'],
  },
  {
    id: 'limitatore.scatto', gruppo: 'ingombri', titolo: 'Velocità d’intervento del limitatore da tarare',
    valore: 'almeno 1,15 volte la velocità nominale e sotto il limite del paracadute di cabina: 0,80 m/s con presa istantanea, 1 m/s con presa '
      + 'istantanea a rullo, 1,5 m/s con presa progressiva fino a una velocità nominale di 1 m/s, 1,25·v + 0,25/v oltre; il foglio 1, la relazione '
      + 'e la distinta dei materiali la danno per la velocità e il paracadute dei dati dell’impianto (senza paracadute indicato: progressivo); '
      + 'un modello del limitatore scelto a mano che non copre la velocità nominale (fuori dal campo del costruttore) non si prende e resta '
      + 'quello della serie per la velocità',
    riferimento: 'UNI EN 81-20:2020, 5.6.2.2.1.1 a) 1)–4); la velocità tarata sulla targa del limitatore: 5.6.2.2.1.8 d)',
    fonte: letto('UNI EN 81-20:2020', 'pp. 82 e 84'), stato: 'confermato',
    nota: 'la velocità d’intervento di un modello la tara il costruttore del limitatore: il software non la conosce e dà il campo da chiedere '
      + 'nell’ordine; la norma consiglia, oltre 1 m/s, di tararla il più vicino possibile al limite superiore e, con velocità basse, a quello inferiore',
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
export const COSTANTI_LIMITATORE = {
  'limitatore.posto': ['govGap', 'govStile', 'govReach'], 'limitatore.fune': ['govSheaveRatio'], 'limitatore.vano': ['govUnderCeiling'],
  'limitatore.scatto': ['govTripMin', 'govTripInstant', 'govTripRoller', 'govTripProgressive', 'govTripProgressiveV', 'govTripK', 'govTripC'],
} as const;
