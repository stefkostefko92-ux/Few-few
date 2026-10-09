// Registry of the shaft module (plan of the shaft, car, doors and counterweight), in the same form as the one of
// the calculation engine (src/calc/norme.ts): every number the layout takes from a standard, a law or a design
// choice lives in KV or DEFAULTS and is described by an entry, which goes into the engineer's checklist and into the
// report. Texts are in Italian: they go to the engineer and into the report. Only clause numbers and values, never
// the text of the standards.

import { letto } from '../calc/norme-fonti';
import type { Stato } from '../calc/norme';
import { VOCI_INGOMBRI } from './norme-ingombri';
import { VOCI_PORTE } from './norme-porte';
import { VOCI_VERT } from './norme-vert';
import type { Access, ShaftCheckId } from './types';
import type { BufferType } from './vertical';

export const KV = {
  // UNI EN 81-20:2020, 5.4.2.1.1 (Prospetto 6): rated load [kg] → maximum available car area [m²], linear in between
  areaTable: [[100, 0.37], [180, 0.58], [225, 0.7], [300, 0.9], [375, 1.1], [400, 1.17], [450, 1.3], [525, 1.45], [600, 1.6], [630, 1.66], [675, 1.75],
    [750, 1.9], [800, 2], [825, 2.05], [900, 2.2], [975, 2.35], [1000, 2.4], [1050, 2.5], [1125, 2.65], [1200, 2.8], [1250, 2.9], [1275, 2.95], [1350, 3.1],
    [1425, 3.25], [1500, 3.4], [1600, 3.56], [2000, 4.2], [2500, 5]] as const,
  areaPer100kgOver2500: 0.16,
  // UNI EN 81-20:2020, 5.4.2.3.1 (Prospetto 8): passengers → minimum available car area [m²]
  personsTable: [[1, 0.28], [2, 0.49], [3, 0.6], [4, 0.79], [5, 0.98], [6, 1.17], [7, 1.31], [8, 1.45], [9, 1.59], [10, 1.73], [11, 1.87], [12, 2.01],
    [13, 2.15], [14, 2.29], [15, 2.43], [16, 2.57], [17, 2.71], [18, 2.85], [19, 2.99], [20, 3.13]] as const,
  areaPerPersonOver20: 0.115,
  personMass: 75,
  // clearances in plan [mm]
  wallFacingEntranceMax: 150,
  sillGapMax: 35,
  carCwMin: 50,
  // the landing door's clear opening at most this far past the car door's on either side (registry porte.disassamento)
  landingShiftMax: 50,
  // DM 236/1989, 8.1.12: car width × depth and door clear width [mm]
  dm236Residential: [950, 1300, 800],
  dm236Public: [1100, 1400, 800],
  dm236Existing: [800, 1200, 750],
  // choices of the software
  doorStackT2: 1.5,
  doorStackC2: 2,
  doorFrame: 110,
  carDoorMargin: 50,
  carMinDepth: 800,
  cwMinLength: 400,
  cwMaxLength: 900,
  cwEndGap: 40,
  cwShoe: 20,
  sizeStep: 10,
  // cantilever sling: feet of the car rails inside the platform's depth; car rail foot to the counterweight rail foot
  cantRailEnd: 20,
  cantCwGap: 70,
  // cantilever sling: the car 10 mm clear of the clips on the car rails' feet (the clips' reach: src/shaft/rails.ts)
  cantClipGap: 10,
  // doors in plan: jambs of the landing door opening; car door operator by door kind, the longest of the catalogues
  // (2SG FLY, Fermator 40/10, Dapa LOWER): telescopic 1,5·L + 50, its closing side 25 mm past the opening; centre opening
  // 2·L + 60; 220 mm deep (the deepest of the drawings: 2SG FLY 220, Dapa 217, Wittur Hydra Plus 200)
  doorPortal: 50,
  // the portal's head over the clear opening on the landing (registry porte.imbotti)
  doorHead: 60,
  // the landing doors' own frame, the standard one (2SG): jambs, header over the clear opening, depth; the narrowest
  // jambs and header of a frame made to measure (registry porte.telaio)
  frameStd: [120, 220, 50],
  frameMin: 25,
  doorOpT2: [1.5, 50],
  doorOpC2: [2, 60],
  doorOpClose: 25,
  doorOpDepth: 220,
  // the operator of the supplier chosen (research/argano-geared/18-*.md): 2SG FLY/LIKE 2AT 1,5·A + 40 (the sill with
  // its overtravel; the operator is at most 1,5·A + 10) and 2AO 2·A + 20, 220 deep; Fermator 40/10 1,5·PL + 50 and
  // 2·PL + 50, 144 deep; Dapa LOWER 1,5·AP + 47 and 2·AP + 50, 217 deep
  doorOpMakers: {
    '2sg': { T2: [1.5, 40], C2: [2, 20], depth: 220 }, fermator: { T2: [1.5, 50], C2: [2, 50], depth: 144 }, dapa: { T2: [1.5, 47], C2: [2, 50], depth: 217 },
  },
  // niches in the walls: the wall left behind a niche, the counterweight's rails clear of a niche's sides, the recess
  // of a lamp; the lamps of the shaft 1,5 m over each floor and the top one 80 mm under the slab
  nicheBackMin: 50,
  nicheGap: 20,
  nicheLightH: 400,
  lampOverFloor: 1500,
  lampUnderSlab: 80,
  // landing call station: 150 mm from the door's portal on the landing's right, its top button's middle 1100 mm over the
  // floor (the height DM 236/1989 and UNI EN 81-70:2005 both allow); the panel 120 × 300 mm, 15 mm proud of the wall
  callOffset: 150,
  callHeight: 1100,
  callPanel: [120, 300, 15],
  // the top buttons of the call stations and of the car's panel over the floor (DM 236/1989, 8.1.12)
  callTopRange: [1100, 1400],
} as const;

export type CostanteVano = keyof typeof KV;

/** Allowances of the layout [mm]: typical values, editable on every design. */
export const DEFAULTS = {
  landingDepth: 80,
  sillGap: 30,
  carDoorDepth: 80,
  carWall: 35,
  railZone: 165,
  cwCarGap: 60,
  cwDepth: 140,
  cwWallGap: 80,
  rearGap: 60,
  shoeGap: 30,
  cwRailGap: 85,
} as const;

export type Allowance = keyof typeof DEFAULTS;

export type GruppoVano = 'cabina' | 'distanze' | 'accessibilita' | 'porte' | 'ingombri' | 'sezione' | 'locale' | 'carichi' | 'modello_vano';

export interface VoceVano {
  id: string;
  gruppo: GruppoVano;
  titolo: string;
  valore: string;
  riferimento: string;
  fonte: string;
  stato: Stato;
  costanti?: readonly CostanteVano[];
  verifiche?: readonly ShaftCheckId[];
  nota?: string;
  /** the clauses of the entry for one of its checks, where narrower than `riferimento` (the relazione's column) */
  rifVerifica?: Partial<Readonly<Record<ShaftCheckId, string>>>;
  /** the clauses the relazione cites when none of the entry's is of the lift's test standard (a check of one part only) */
  rifFuoriNorma?: string;
  /** about one buffer type: the relazione cites it only for the checks of the buffers of that type */
  ammortizzatore?: BufferType;
}

const T20 = 'UNI EN 81-20:2020';
const DM = 'DM 236/1989, 8.1.12, letto per intero su Normattiva il 2026-10-02 (ricerca, cap. 16, §4.1)';

export const VOCI_VANO: readonly VoceVano[] = [
  {
    id: 'cabina.superficie', gruppo: 'cabina', titolo: 'Superficie utile massima della cabina per portata',
    valore: '100 kg 0,37 m²; 180 kg 0,58; 225 kg 0,70; 300 kg 0,90; 375 kg 1,10; 400 kg 1,17; 450 kg 1,30; 525 kg 1,45; 600 kg 1,60; 630 kg 1,66; '
      + '675 kg 1,75; 750 kg 1,90; 800 kg 2,00; 825 kg 2,05; 900 kg 2,20; 975 kg 2,35; 1000 kg 2,40; 1050 kg 2,50; 1125 kg 2,65; 1200 kg 2,80; '
      + '1250 kg 2,90; 1275 kg 2,95; 1350 kg 3,10; 1425 kg 3,25; 1500 kg 3,40; 1600 kg 3,56; 2000 kg 4,20; 2500 kg 5,00; '
      + 'oltre 2500 kg +0,16 m² ogni 100 kg; interpolazione lineare',
    riferimento: 'UNI EN 81-20:2020, 5.4.2.1.1 (Prospetto 6)', fonte: letto(T20, 'pp. 63–64'), stato: 'confermato',
    costanti: ['areaTable', 'areaPer100kgOver2500'], verifiche: ['v_area'],
    nota: 'la norma misura la superficie a 1 m dal pavimento tra le pareti strutturali, senza finiture (5.4.2.1.2), conta le nicchie e conta per '
      + 'intero la rientranza dell’ingresso profonda più di 100 mm (5.4.2.1.3); il software usa larghezza × profondità interne: nicchie e '
      + 'rientranze vanno aggiunte a mano',
  },
  {
    id: 'cabina.passeggeri', gruppo: 'cabina', titolo: 'Numero di passeggeri',
    valore: 'il minore tra Q/75 arrotondato per difetto e il numero ammesso dalla superficie: 1 persona 0,28 m²; 2 0,49; 3 0,60; 4 0,79; 5 0,98; '
      + '6 1,17; 7 1,31; 8 1,45; 9 1,59; 10 1,73; 11 1,87; 12 2,01; 13 2,15; 14 2,29; 15 2,43; 16 2,57; 17 2,71; 18 2,85; 19 2,99; 20 3,13; '
      + 'oltre 20 +0,115 m² per persona',
    riferimento: 'UNI EN 81-20:2020, 5.4.2.3.1 (Prospetto 8)', fonte: letto(T20, 'p. 66'), stato: 'confermato',
    costanti: ['personsTable', 'areaPerPersonOver20', 'personMass'],
  },
  {
    id: 'distanze.parete.entrata', gruppo: 'distanze', titolo: 'Parete del vano di fronte all’entrata della cabina',
    valore: 'distanza orizzontale dalla soglia o dal telaio della porta di cabina ≤ 150 mm (qui: profondità della porta di piano + gioco tra le soglie)',
    riferimento: 'UNI EN 81-20:2020, 5.2.5.3.1', fonte: letto(T20, 'p. 33'), stato: 'confermato',
    costanti: ['wallFacingEntranceMax'], verifiche: ['v_wall'],
    nota: 'le deroghe della norma (fino a 0,20 m per un tratto alto non più di 0,50 m o con porte verticali di ascensori per merci; nessun '
      + 'limite con la porta di cabina bloccata meccanicamente) non sono usate: la verifica è più severa. Il software misura fino alla soglia; '
      + 'la figura 3 della norma porta il limite anche al telaio e al bordo di chiusura delle ante di cabina: con la porta scelta lo verifica '
      + 'l’ingegnere sui dati del fornitore.',
  },
  {
    id: 'distanze.soglie', gruppo: 'distanze', titolo: 'Gioco tra soglia di cabina e soglia di piano',
    valore: 'distanza orizzontale ≤ 35 mm',
    riferimento: 'UNI EN 81-20:2020, 5.3.4.1 (figura 3); 11.2.2 nella UNI EN 81-1 (1999, 2008)', fonte: letto(T20, 'p. 50'), stato: 'confermato',
    costanti: ['sillGapMax'], verifiche: ['v_sill'],
    nota: 'Non calcolato: tra il bordo d’attacco delle ante di cabina e le porte di piano al massimo 0,12 m (5.3.4.2; 11.2.3 nella UNI EN 81-1:2008), '
      + 'dato del fornitore delle porte.',
  },
  {
    id: 'distanze.contrappeso', gruppo: 'distanze', titolo: 'Distanza tra cabina e contrappeso',
    valore: '≥ 50 mm tra la cabina con i suoi componenti e il contrappeso con i suoi',
    riferimento: 'UNI EN 81-20:2020, 5.2.5.5.1 h)', fonte: letto(T20, 'p. 35'), stato: 'confermato',
    costanti: ['carCwMin'], verifiche: ['v_cw'],
    nota: 'il software misura tra le sagome di cabina e contrappeso: pattini e staffe non sono nel modello della pianta',
  },
  {
    id: 'accessibilita.residenziale', gruppo: 'accessibilita', titolo: 'Edifici residenziali nuovi: cabina e porta minime',
    valore: 'cabina larga 950 mm e profonda 1300 mm, porta di 800 mm sul lato corto; piattaforma davanti alla porta 1,50 × 1,50 m (fuori dal vano: da verificare in sito); '
      + 'pulsanti più alti delle bottoniere tra 1100 e 1400 mm dal pavimento',
    riferimento: 'DM 236/1989, 8.1.12', fonte: DM, stato: 'confermato',
    costanti: ['dm236Residential', 'callTopRange'], verifiche: ['v_acc_car', 'v_acc_door', 'v_acc_side', 'v_call'],
  },
  {
    id: 'accessibilita.non.residenziale', gruppo: 'accessibilita', titolo: 'Edifici non residenziali nuovi: cabina e porta minime',
    valore: 'cabina larga 1100 mm e profonda 1400 mm, porta di 800 mm sul lato corto; piattaforma davanti alla porta 1,50 × 1,50 m (fuori dal vano: da verificare in sito); '
      + 'pulsanti più alti delle bottoniere tra 1100 e 1400 mm dal pavimento',
    riferimento: 'DM 236/1989, 8.1.12', fonte: DM, stato: 'confermato',
    costanti: ['dm236Public', 'callTopRange'], verifiche: ['v_acc_car', 'v_acc_door', 'v_acc_side', 'v_call'],
  },
  {
    id: 'accessibilita.esistenti', gruppo: 'accessibilita', titolo: 'Adeguamento di edifici esistenti: cabina e porta minime',
    valore: 'cabina larga 800 mm e profonda 1200 mm, porta di 750 mm sul lato corto; piattaforma davanti alla porta 1,40 × 1,40 m (fuori dal vano: da verificare in sito); '
      + 'pulsanti più alti delle bottoniere tra 1100 e 1400 mm dal pavimento; solo se l’edificio esistente non consente una cabina più grande: '
      + 'una cabina sotto le misure del caso b) (larga 950 mm, profonda 1300 mm, porta di 800 mm) chiede la motivazione scritta nel progetto '
      + '(«Attenzione» se manca)',
    riferimento: 'DM 236/1989, 8.1.12 c)', fonte: DM, stato: 'confermato',
    costanti: ['dm236Existing', 'dm236Residential', 'callTopRange'], verifiche: ['v_acc_car', 'v_acc_door', 'v_acc_side', 'v_acc_c', 'v_call'],
    nota: 'Per un ascensore nuovo in un edificio esistente il caso è a) o b) secondo la destinazione; il c) è l’eccezione, scelta dal progettista.',
  },
  ...VOCI_INGOMBRI,
  {
    id: 'modello.passo', gruppo: 'modello_vano', titolo: 'Dimensioni proposte della cabina',
    valore: 'la cabina più grande che entra nel vano, a passi di 10 mm, con superficie entro il limite della portata; a parità di superficie, la più profonda',
    riferimento: '—', fonte: 'scelta del software', stato: 'scelta',
    costanti: ['sizeStep'],
  },
  {
    id: 'modello.quote', gruppo: 'modello_vano', titolo: 'Quote della pianta fissate a mano',
    valore: 'ogni quota della pianta (cabina, porte, operatore della porta di cabina, guide, contrappeso) si può fissare a mano al posto di '
      + 'quella proposta; la cabina resta fuori dalle zone di porte, guide e contrappeso, le guide del contrappeso nel loro spazio (laterale: '
      + 'fuori dalle zone delle porte che ha di fronte più il gioco d’estremità; arcata a zaino: tra i piedi delle guide di cabina meno il gioco '
      + 'delle staffe) e la luce di ogni porta dentro la cabina; altrimenti «Non conforme». Anche gli ammortizzatori si possono '
      + 'spostare: quelli di cabina restano con il piatto sotto la piattaforma e fuori dalla pianta dello spazio di rifugio in fossa '
      + '(UNI EN 81-20, 5.2.5.8.1), quello del contrappeso dentro la lunghezza del contrappeso (la stessa verifica vale per quelli messi dal '
      + 'software: ammortizzatori.posizione)',
    riferimento: '—', fonte: 'scelta del software', stato: 'scelta',
    verifiche: ['v_place', 'v_doorcar', 'v_buffer'],
  },
  {
    id: 'modello.limiti', gruppo: 'modello_vano', titolo: 'Limiti del modello del vano',
    valore: 'pianta, sezione A-A e locale macchina da un modello semplificato: arcata, operatori delle porte, ammortizzatori e macchina hanno '
      + 'posizioni e ingombri tipici, da sostituire con i dati dei fornitori; il rilievo dal disegno CAD va controllato in cantiere',
    riferimento: '—', fonte: 'limite del modello attuale', stato: 'scelta',
  },
  {
    id: 'modello.non.calcolate', gruppo: 'modello_vano', titolo: 'Verifiche che il software non calcola',
    valore: 'da fare a parte, con i dati dei fornitori: sollecitazioni e frecce delle staffe e delle guide del contrappeso, anche con la presa '
      + 'del suo paracadute quando c’è uno spazio accessibile sotto il vano (UNI EN 81-50:2020, 5.10: il software verifica le guide di cabina, '
      + 'sul foglio 1 delle tavole; il paracadute del contrappeso lo chiede e ne conta il carico P7: paracadute.contrappeso); il fondo della '
      + 'fossa e la soletta sopra un locale sotto la fossa (5000 N/m² con le reazioni P5–P8: progetto strutturale); puleggia del contrappeso '
      + 'in taglia 2:1 sotto il soffitto con il contrappeso nella posizione più alta; uno spazio accessibile sotto il vano che non sia il locale '
      + 'della macchina (il software lo conosce solo con la macchina sotto la fossa); distanza tra le parti fisse più alte della fossa e quelle '
      + 'più basse della cabina sugli ammortizzatori; sporgenze nel vano oltre 150 mm senza balaustra; movimento incontrollato della cabina '
      + '(UCM) e velocità eccessiva in salita con la nuova macchina; rigidità e sporgenze della lamiera sotto la soglia di piano (5.2.5.3.2 b)–c), '
      + 'dato del fornitore delle porte); porte di soccorso oltre 11 m tra due porte di piano (5.2.3.1: la verifica le chiede, il disegno '
      + 'non le ha); le soluzioni della UNI EN 81-21:2022 per testata, fossa, locale e porte ridotti (le verifiche in sezione seguono solo la UNI EN 81-20:2020). Il locale della '
      + 'macchina in basso è disegnato e verificato (altezza, porta, spazi davanti al quadro e accanto alla macchina) e le pulegge di rinvio '
      + 'appese sotto la soletta entrano nello spazio di rifugio sul tetto (spazi.tetto.appese)',
    riferimento: 'UNI EN 81-20:2020: guide e staffe 5.7.2–5.7.4 (con UNI EN 81-50:2020, 5.10); distanze in testata 5.2.5.7.2; spazi accessibili sotto '
      + 'il vano 5.2.5.4 e fondo della fossa 5.2.1.8.4; parti fisse in fossa 5.2.5.8.2; sporgenze oltre 0,15 m 5.2.5.2.2.2; velocità eccessiva '
      + 'in salita 5.6.6; movimento incontrollato 5.6.7', fonte: `${letto(T20, 'pp. 31–43, 89–97')}; analisi delle lacune del 2026-10-03`,
    stato: 'scelta',
  },
  ...VOCI_PORTE,
  ...VOCI_VERT,
];

const ACCESS_VOCE: Readonly<Record<Access, string | null>> = {
  none: null, dm236_existing: 'accessibilita.esistenti', dm236_residential: 'accessibilita.residenziale', dm236_public: 'accessibilita.non.residenziale',
};

/** The entries behind a design: all of them but the accessibility cases the design does not apply. */
export const vociOfDesign = (access: Access): VoceVano[] => VOCI_VANO.filter((v) => v.gruppo !== 'accessibilita' || v.id === ACCESS_VOCE[access]);
