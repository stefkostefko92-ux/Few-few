// Registry of the details of the shaft a lift designer draws and the installer builds from the drawings (round 36): the
// pit's access ladder and its controls with their signs, the emergency doors past 11 m, the plate under each landing
// sill, the counterweight's screen in plan, the clearance on the counterweight's sign, and the car rails' generic
// bracket. The constants are spread into KV_VERT (norme-vert.ts), the entries into VOCI_VERT. Same form as norme.ts;
// Italian texts, clause numbers and values only (UNI EN 81-20:2020 as the client supplied it, read on 2026-10-06).
import { letto } from '../calc/norme-fonti';
import type { VoceVano } from './norme';

const T20 = 'UNI EN 81-20:2020';

export const KV_FOSSA = {
  // 5.2.2.4: up to this pit depth a door or a ladder in the well (annex F) gives the access, deeper a door [mm]; annex F:
  // the stiles at least 1100 mm over the sill in use (F.2.3), rungs at least 280 mm clear (F.3.2 a)), 200 mm free behind
  // each rung (F.5 a)), at rest at most 800 mm from the landing's access edge (F.5 b)), in use the rungs' middle at most
  // 600 mm from it (F.5 c))
  pitLadderMax: 2500,
  ladderOverSill: 1100,
  ladderRung: 280,
  ladderBehind: 200,
  ladderRest: 800,
  ladderUse: 600,
  // 5.2.1.5.1 a)–d): a pit up to 1600 mm deep has one stop at least 400 mm over the lowest landing and at most 2000 mm
  // over the pit floor; deeper, two: the upper at least 1000 mm over the landing, the lower at most 1200 mm over the
  // pit floor, reachable from a refuge; each at most 750 mm across from the inner edge of the door's frame; the
  // inspection station operable within 300 mm of a refuge; the well light's switch at most 750 mm from the frame and at
  // least 1000 mm over the access level [mm]
  stopPitOne: 1600,
  stopOverLanding: 400,
  stopOverPit: 2000,
  stopUpper: 1000,
  stopLower: 1200,
  pitReach: 750,
  inspReach: 300,
  lightOver: 1000,
  // the ladder and the pit's control box as the drawings show them (the software's): the ladder 370 wide (300 clear
  // between 35 mm stiles, the most of F.3.1 a)) and 100 deep, its round rungs 30 mm across (within F.3.2 c)) 280 mm
  // apart (within the constant pitch of F.3.2 b)) from the one flush with the landing sill (F.5 d)) down; the box 150
  // wide, 80 deep, 120 high, its stop 500 mm and the light's switch 1100 mm over the lowest landing [mm]
  ladderW: 370,
  ladderD: 100,
  ladderStile: 35,
  ladderRungD: 30,
  ladderPitch: 280,
  pitBoxW: 150,
  pitBoxD: 80,
  pitBoxH: 120,
  stopAt: 500,
  lightAt: 1100,
  // 5.2.3.1 and 5.2.3.2 d): more than 11 m between consecutive landing sills ask for emergency doors, at least 1800 mm
  // high and 500 mm wide [mm]
  emergencyRise: 11000,
  emergencyH: 1800,
  emergencyW: 500,
  // 5.3.8.1: the unlocking zone up to 200 mm over and under the landing (350 with car and landing doors driven together);
  // 5.2.5.3.2: under each landing sill a smooth surface joined to it, at least half the zone + 50 mm high and as wide as
  // the car's clear entrance + 25 mm each side, projections at most 5 mm, then joined to the next door's lintel or a
  // bevel at least 60° to the horizontal with at least 20 mm of horizontal projection [mm, °]
  unlockMax: 200,
  unlockCoupled: 350,
  toeOver: 50,
  toeSide: 25,
  toeProj: 5,
  toeBevelAngle: 60,
  toeBevel: 20,
  // 5.2.5.5.1 c)–e): the counterweight's screen with its lower edge at most 300 mm over the pit floor, at least as wide as
  // the counterweight, the space over 300 mm between its rails and a wall closed too; drawn past the counterweight and
  // its rails by 40 mm (the software's) [mm]
  cwScreenLow: 300,
  cwScreenWall: 300,
  cwScreenPast: 40,
  // 5.2.5.7.1: the clearance counterweight–buffer on the sign, rounded down to this step (the software's) [mm]
  cwGapStep: 5,
  // the car rails' bracket where no catalogue's is chosen (the software's, as the plan and the 3D draw it): an angle
  // 100 high, 90 wide, 8 thick on a wall plate 160 × 200 × 12 with 2 anchors M12; past 150 mm from the wall two angles
  // clamped by 4 bolts M12 in slots [mm]
  carBracketLeg: 100,
  carBracketFlange: 90,
  carBracketT: 8,
  carBracketPlateW: 160,
  carBracketPlateH: 200,
  carBracketPlateT: 12,
  carBracketAnchor: 12,
  carBracketOnePiece: 150,
} as const;

export const COSTANTI_FOSSA = {
  'fossa.accesso': ['pitLadderMax', 'ladderOverSill', 'ladderRung', 'ladderBehind', 'ladderRest', 'ladderUse'],
  'fossa.comandi': ['stopPitOne', 'stopOverLanding', 'stopOverPit', 'stopUpper', 'stopLower', 'pitReach', 'inspReach', 'lightOver'],
  'fossa.posizioni': ['ladderW', 'ladderD', 'ladderStile', 'ladderRungD', 'ladderPitch', 'pitBoxW', 'pitBoxD', 'pitBoxH', 'stopAt', 'lightAt'],
  'porte.soccorso': ['emergencyRise', 'emergencyH', 'emergencyW'],
  'porte.sottosoglia': ['unlockMax', 'unlockCoupled', 'toeOver', 'toeSide', 'toeProj', 'toeBevelAngle', 'toeBevel'],
  'contrappeso.schermo.pianta': ['cwScreenLow', 'cwScreenWall', 'cwScreenPast'],
  'contrappeso.cartello': ['cwGapStep'],
  'guide.staffe.cabina': ['carBracketLeg', 'carBracketFlange', 'carBracketT', 'carBracketPlateW', 'carBracketPlateH', 'carBracketPlateT', 'carBracketAnchor',
    'carBracketOnePiece'],
} as const;

export const VOCI_FOSSA: readonly VoceVano[] = [
  {
    id: 'fossa.accesso', gruppo: 'sezione', titolo: 'Accesso alla fossa: scala nel vano',
    valore: 'fossa profonda fino a 2500 mm: porta di accesso oppure scala dentro il vano, comoda da raggiungere dalla porta di piano più bassa; più '
      + 'profonda: porta di accesso. Scala custodita in fossa, di alluminio o acciaio: in uso i montanti arrivano ad almeno 1100 mm sopra la soglia di '
      + 'piano, pioli larghi almeno 280 mm con almeno 200 mm liberi dietro fino alla parete; a riposo a non più di 800 mm dal bordo dell’accesso, in '
      + 'uso la mezzeria dei pioli a non più di 600 mm e il primo piolo il più possibile a filo della soglia di piano; a riposo fuori dagli spazi '
      + 'di rifugio (se può urtare parti in moto fuori dal riposo, un contatto di sicurezza)',
    riferimento: 'UNI EN 81-20:2020, 5.2.2.4 e appendice F (F.2.3, F.3.2, F.5)', fonte: letto(T20, 'pp. 28–29, 151–152'), stato: 'confermato',
  },
  {
    id: 'fossa.comandi', gruppo: 'sezione', titolo: 'Dotazioni della fossa: arresto, ispezione, presa, luce, cartello',
    valore: 'fossa profonda fino a 1600 mm: un dispositivo di arresto (STOP) almeno 400 mm sopra il pavimento della fermata più bassa e non oltre '
      + '2000 mm dal fondo della fossa; più profonda: due, quello alto almeno 1000 mm sopra la fermata, quello basso non oltre 1200 mm dal fondo e '
      + 'manovrabile da uno spazio di rifugio; ogni arresto a non più di 750 mm in orizzontale dal bordo interno del telaio della porta di accesso; '
      + 'comando d’ispezione manovrabile da non oltre 300 mm da uno spazio di rifugio; una presa di corrente; comando della luce del vano a non più '
      + 'di 750 mm dal telaio e almeno 1000 mm sopra il pavimento di accesso; in fossa un cartello, leggibile dall’accesso, con il numero di persone '
      + 'ammesse e la postura dello spazio di rifugio',
    riferimento: 'UNI EN 81-20:2020, 5.2.1.5.1 a)–d) e 5.2.5.8.1 (cartello)', fonte: letto(T20, 'pp. 25–26, 40'), stato: 'confermato',
  },
  {
    id: 'fossa.posizioni', gruppo: 'sezione', titolo: 'Scala e pulsantiera della fossa nei disegni',
    valore: 'la scala disegnata larga 370 mm e profonda 100 mm, con montanti da 35 mm (il massimo di F.3.1 a)) e pioli tondi da 30 mm (entro '
      + 'F.3.2 c)), in uso con i montanti fino a 1100 mm sopra la soglia e i pioli a passo di 280 mm '
      + 'dal primo, a filo della soglia, in giù fino al fondo; la pulsantiera della fossa (arresto, presa, comando della luce) larga 150 mm, '
      + 'profonda 80 mm, alta 120 mm per apparecchio, con l’arresto 500 mm e il comando della luce 1100 mm sopra la fermata più bassa (fossa oltre '
      + '1600 mm: l’arresto alto 1000 mm sopra la fermata e quello basso sotto la pulsantiera, con il bordo superiore 1200 mm sopra il fondo); '
      + 'ognuna contro una parete, il più vicino possibile al bordo dell’accesso di quella fermata (la scala entro il limite di uso, la pulsantiera '
      + 'entro quello dell’arresto), fuori dalla cabina con le soglie, dagli operatori delle porte se con la cabina sugli ammortizzatori compressi '
      + 'scendono fino a 100 mm sopra la scala o la pulsantiera, dal contrappeso e dalla sua protezione con tutto lo spazio che chiude fino alla '
      + 'parete, dalle guide con le staffe, dalla porta di '
      + 'piano (la scala, che sale sopra la soglia, anche dal telaio con le ante impacchettate, e dalla lamiera sottosoglia), dalla fune del '
      + 'limitatore e, per la scala in fossa, dagli ammortizzatori, dallo spazio di rifugio e dal tenditore del limitatore; '
      + 'senza un posto libero il disegno non la mette e la nota '
      + 'lo dice',
    riferimento: '—', fonte: 'scelta del software: tipo, misure e posizione definitivi del fornitore della scala e del quadro', stato: 'scelta',
  },
  {
    id: 'porte.soccorso', gruppo: 'porte', titolo: 'Porte di soccorso tra due porte di piano lontane',
    valore: 'più di 11000 mm tra le soglie di due porte di piano consecutive (piani contigui con porte, qualunque accesso): porte di soccorso intermedie '
      + 'alte almeno 1800 mm e larghe almeno 500 mm, oppure cabine adiacenti con porta di soccorso',
    riferimento: 'UNI EN 81-20:2020, 5.2.3.1 e 5.2.3.2 d)', fonte: letto(T20, 'p. 29'), stato: 'confermato', verifiche: ['v_emerg'],
    nota: 'il software non modella le porte di soccorso né le cabine adiacenti: oltre 11 m la verifica non passa e il progetto va completato a parte',
  },
  {
    id: 'porte.sottosoglia', gruppo: 'porte', titolo: 'Lamiera sotto la soglia di piano',
    valore: 'zona di sbloccaggio non oltre 200 mm sopra e sotto il piano (350 mm con porte di cabina e di piano motorizzate insieme); sotto ogni '
      + 'soglia di piano una superficie liscia e dura unita alla soglia, alta almeno metà della zona di sbloccaggio + 50 mm e larga almeno la luce '
      + 'dell’accesso di cabina + 25 mm per lato, sporgenze non oltre 5 mm; sotto, unita all’architrave della porta successiva oppure con uno smusso '
      + 'ad almeno 60° sull’orizzontale e almeno 20 mm di proiezione orizzontale. Il disegno la mette sotto il bordo della soglia di ogni porta di '
      + 'piano, alta la zona di sbloccaggio indicata + 50 mm (senza: 200 + 50 = 250 mm, «Attenzione»), con lo smusso fino al muro',
    riferimento: 'UNI EN 81-20:2020, 5.2.5.3.2 e 5.3.8.1', fonte: letto(T20, 'pp. 34, 58'), stato: 'confermato', verifiche: ['p_toe'],
    nota: 'la zona di sbloccaggio sta sopra e sotto il piano: la metà della zona è la sua estensione da un lato (200 mm al massimo), lettura dal lato '
      + 'della sicurezza; rigidità (300 N su 5 cm²) e finitura sono del fornitore delle porte',
  },
  {
    id: 'contrappeso.schermo.pianta', gruppo: 'sezione', titolo: 'Protezione del contrappeso in fossa: bordo inferiore e larghezza',
    valore: 'bordo inferiore non oltre 300 mm dal fondo della fossa; larga almeno quanto il contrappeso; se tra le guide del contrappeso e una parete '
      + 'ci sono più di 300 mm, la protezione arriva anche alla parete. Il disegno la mette davanti al contrappeso e alle sue guide, 40 mm oltre da '
      + 'ogni lato, fino alla parete dove resterebbero più di 300 mm; davanti a una porta di piano su quella parete si ferma prima della soglia, '
      + 'della lamiera sottosoglia e delle ante impacchettate (resta aperta la sola profondità della soglia)',
    riferimento: 'UNI EN 81-20:2020, 5.2.5.5.1 c)–e)', fonte: letto(T20, 'p. 35'), stato: 'confermato', verifiche: ['p_screenlo', 'p_screenw'],
    nota: 'p_screenlo e p_screenw sono informazioni, non verifiche: il bordo e la larghezza sono quelli che il disegno dà accanto ai valori della '
      + 'norma; la protezione montata si controlla al collaudo',
  },
  {
    id: 'contrappeso.cartello', gruppo: 'sezione', titolo: 'Gioco massimo tra contrappeso e ammortizzatore (cartello)',
    valore: 'il cartello sulla protezione del contrappeso o accanto riporta il gioco massimo ammesso tra contrappeso e ammortizzatore con la cabina '
      + 'al piano più alto: l’extracorsa del progetto più il margine più piccolo delle verifiche che il gioco riduce (spazio di rifugio sul tetto, '
      + 'anche sotto le pulegge e gli attacchi appesi nel vano, '
      + 'distanze libere dal soffitto, parte più alta della cabina sotto ciò che pende sopra, corsa guidata del contrappeso con la cabina sugli '
      + 'ammortizzatori e, finché passano, gli avvisi della traversa sotto il soffitto e della corsa guidata della cabina), arrotondato per difetto '
      + 'a 5 mm: con quel gioco nessuna verifica del progetto cambia esito',
    riferimento: 'UNI EN 81-20:2020, 5.2.5.7.1', fonte: `${letto(T20, 'pp. 37–38')}; il calcolo del margine è del software`, stato: 'confermato',
    verifiche: ['h_cwgap'],
  },
  {
    id: 'guide.staffe.cabina', gruppo: 'ingombri', titolo: 'Staffe delle guide di cabina (generiche)',
    valore: 'una squadra alta 100 mm, larga 90 mm, spessa 8 mm, su una piastra a muro 160 × 200 × 12 mm con 2 tasselli M12; oltre 150 mm dal muro '
      + 'due squadre serrate da 4 bulloni M12 in asola; la guida sulla piastra con due graffe; il disegno dà il tipo, la distanza dal muro al piede '
      + 'della guida e le quote delle staffe; la reazione di ogni staffa per la verifica degli ancoraggi è la spinta sulla guida del foglio 1',
    riferimento: '—', fonte: 'scelta del software, da dimensionare a parte con il fornitore e con la verifica degli ancoraggi', stato: 'scelta',
  },
];
