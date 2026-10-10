// Registry of the section, the machine room and the loads on the building: every number these parts of the shaft
// design take from a standard or a design choice, with its entry for the engineer's checklist and the report.
// Italian texts, clause numbers and values only. Sources: the texts of UNI EN 81-20/50:2020 the client supplied, read on
// 2026-10-06, and the makers' catalogues where an entry says so.
import { letto } from '../calc/norme-fonti';
import type { VoceVano } from './norme';
import { COSTANTI_FOSSA, KV_FOSSA, VOCI_FOSSA } from './norme-fossa';
import { COSTANTI_GUIDE, KV_GUIDE, VOCI_GUIDE } from './norme-guide';
import { COSTANTI_HEB, KV_HEB, VOCI_HEB } from './norme-heb';
import { COSTANTI_LIMITATORE, KV_GOV, VOCI_LIMITATORE } from './norme-limitatore';
import { COSTANTI_LOCALE, KV_LOCALE, VOCI_LOCALE } from './norme-locale';
import { VOCI_SPAZI } from './norme-spazi';
import { VOCI_AMMORTIZZATORI } from './norme-ammortizzatori';
import { VOCI_SUPPORTO } from './norme-supporto';

const T20 = 'UNI EN 81-20:2020', T50 = 'UNI EN 81-50:2020';

export const KV_VERT = {
  ...KV_GUIDE,
  ...KV_FOSSA,
  ...KV_GOV,
  ...KV_HEB,
  ...KV_LOCALE,
  // UNI EN 81-20:2020, Tabella 3: refuge spaces by type, height and plan [mm] (type 3 in the pit only)
  refugeH: { 1: 2000, 2: 1000, 3: 500 },
  refugePlan: { 1: [400, 500], 2: [500, 700], 3: [700, 1000] },
  // 5.2.5.6.1 (Tabella 2): jump of the car 0,035·v² [m] past the counterweight on its compressed buffer
  jumpK: 0.035,
  // 5.2.5.7.2: from the car roof's highest parts to the ceiling: equipment 500, guide shoes / rope hitch / crosshead 100,
  // top of the balustrade 300 [mm]
  headEquip: 500,
  headShoe: 100,
  headBalustrade: 300,
  // 5.2.5.8.2: pit floor to the lowest parts of the car ≥ 500 mm; apron (5.4.5): vertical part ≥ 750 mm ending in a bevel
  // at ≥ 60° to the horizontal with a horizontal projection ≥ 20 mm, its lowest edge 100 mm clear
  pitClear: 500,
  apron: 750,
  apronBevel: 20,
  apronBevelAngle: 60,
  apronClear: 100,
  // 5.4.7.2 b) and 5.4.7.4: balustrade on the car roof when the roof's outer edge is > 300 mm from the wall; 700 mm high
  // when the handrail's inner edge is up to 500 mm from the wall, 1100 above. The balustrade as the 3D draws it: its
  // outer face 100 mm in from the roof's edge (within the 150 mm of 5.4.7.4 c)), a 30 mm handrail
  parapetGap1: 300,
  parapetGap2: 500,
  parapetH1: 700,
  parapetH2: 1100,
  parapetEdge: 100,
  parapetBar: 30,
  // 5.2.5.5.1: screen of the counterweight in the pit up to ≥ 2000 mm above the pit floor
  cwScreen: 2000,
  // 5.2.5.6.2 with 5.2.5.6.1.1 (and UNI EN 81-1, 5.7.1.2): the counterweight's guided travel left past its highest point,
  // the car on its fully compressed buffers plus the jump: ≥ 0,1 + 0,035·v² [m]
  cwGuided: 0.1,
  cwGuidedV2: 0.035,
  // 5.2.5.6.2: the car's guided travel left past its highest point (that position has the jump already) ≥ 0,1 [m]
  carGuided: 0.1,
  // 5.8.2: energy accumulation buffers (linear: springs; non-linear: polyurethane pads) up to 1 m/s; linear: stroke
  // ≥ 0,135·v² m and ≥ 65 mm; non-linear: fully compressed at 90 % of the height; energy dissipation (hydraulic): any
  // speed, stroke ≥ 0,0674·v² m. Typical buffers of the catalogues: P+S Diepocell D pads 80 mm high; Oleo LSB10 and
  // LSB16 [height, stroke] (registry ammortizzatori.*)
  springMaxV: 1,
  strokeK: 0.135,
  strokeMin: 65,
  puStroke: 0.9,
  puTypical: 80,
  oilStrokeK: 0.0674,
  oilTypical: [[222.2, 73.4], [485.5, 173.5]],
  // 5.2.5.7.3: a place where a person can stand: ≥ 0,12 m² with the smaller side > 250 mm; drawn 400 × 300 unless set
  roofFreeArea: 0.12,
  roofFreeSide: 250,
  standDrawn: [400, 300],
  // the crosshead of a central sling over the roof: this far either side of the rails' axis, this high under the sling's
  // top; the operator of a car door takes this strip of the roof on its entrance's side [mm] (registry spazi.tetto.arcata)
  crossheadHalf: 105,
  crossheadH: 170,
  roofOperator: 150,
  // 5.3.2.1 and 5.4.1: clear height of the entrances (landing and car doors) and inside the car [mm]
  entranceH: 2000,
  carInnerH: 2000,
  // 5.2.1.8 and UNI EN 81-50:2020, 5.10: 4 × the static load under each buffer; impact factor of the safety gear on
  // the rails (progressive 2, instantaneous roller type 3, instantaneous 5); running 1,2; rated load off centre by 1/8
  bufferFactor: 4,
  k1Progressive: 2,
  k1Roller: 3,
  k1Instant: 5,
  k2Running: 1.2,
  loadOffset: 0.125,
  // 5.2.1.8.1 and annex E.1 (informative): the dynamic coefficient on the machine's static load; travelling cables [kg/m]
  dynFactor: 2,
  cableKgM: 0.5,
  // 5.2.1.4: fixed lighting of the well (1 m above the car roof and the pit floor, elsewhere) and of the machinery
  // spaces at floor level in the working areas [lux]
  wellLux: 50,
  wellLuxElse: 20,
  roomLux: 200,
  // assumption of the standard for the machinery spaces and the control cabinets [°C]
  tempMin: 5,
  tempMax: 40,
  // estimates of the data sheet: rails end under the slab; the governor pulley above the machine room floor [mm]
  railTopGap: 50,
  governorAbove: 800,
  // brackets along a rail: one every pitch, one more at the start and one at the end; the first over the rail's foot
  // and the last under its top [mm] (the rule the client fits them by)
  bracketPitch: 2000,
  bracketFirst: 600,
  bracketLast: 200,
  // walls of an old building that stand elsewhere at the top floor and in the headroom: the least clearance of the car
  // and the counterweight running past them [mm]
  headRun: 25,
  // the machine's support (registry locale.basamento, locale.putrelle): the typical frame, beams,
  // plates and plinth; frame and plinth past the bedplate at each end, and kept that far off the walls when the
  // software sets their length; the beams' bearing in the walls [mm]; steel
  // S275 [MPa], γM0, E [MPa]; the beams' elastic deflection limit (span / this)
  supportFrame: 'UPN 200',
  supportBeam: 'IPE 200',
  supportPlate: 20,
  supportPlinth: 250,
  supportOverhang: 100,
  supportWallGap: 30,
  supportBearing: 150,
  // the diverting pulley in the machine room, never in the shaft (registry locale.rinvio): in the machine's bedplate as
  // the makers' (SICOR XTE3022/XTE6026: the pulley's axis 320 mm over the floor, the top 736 mm), its rim at least 60 mm
  // over the floor and 176 mm under the top; legs of 80 mm square tube on dampers 28 mm high, beams UPN 160, 100 mm past
  // the machine and the pulley at each end, 655 mm wide at least [mm]
  rinvioAxis: 320,
  rinvioRim: 60,
  rinvioTop: 736,
  rinvioOver: 176,
  rinvioLeg: 80,
  rinvioPads: 28,
  rinvioBeam: 'UPN 160',
  rinvioOverhang: 100,
  rinvioWidth: 655,
  // a maker's machine on our bedframe (registry locale.telaio): its least height under the feet, the sheave's rim over
  // its underside, past the machine at each end; the third iron past the sheave, its flange clear of the sheave's outer
  // face [mm]
  machineBed: 80,
  machineRimClear: 30,
  machineBedOverhang: 40,
  machineIronClear: 20,
  // a machine replacement (registry locale.calate): the existing rope drops measured in the room and those the
  // calculation's new machine hangs its ropes at may differ by this much [mm]
  dropTol: 10,
  steelFyk: 275,
  steelGammaM0: 1.05,
  steelE: 210000,
  beamDeflection: 1500,
} as const;

export type CostanteVert = keyof typeof KV_VERT;

export const VOCI_VERT: readonly VoceVano[] = [
  ...VOCI_SPAZI,
  ...VOCI_AMMORTIZZATORI,
  ...VOCI_LOCALE,
  {
    id: 'carichi.fossa', gruppo: 'carichi', titolo: 'Carichi sul pavimento della fossa',
    valore: 'sotto ogni ammortizzatore 4 volte il carico statico: 4·g·(P+Q) per la cabina, 4·g·M_cw per il contrappeso, divisi tra gli ammortizzatori; '
      + 'sotto ogni guida di cabina la massa della guida più la reazione all’intervento del paracadute k1·g·(P+Q)/2 (k1 = 2 progressivo, 3 istantaneo a rulli, '
      + '5 istantaneo); sotto ogni guida del contrappeso la massa della guida',
    riferimento: 'UNI EN 81-20:2020, 5.2.1.8.4–5.2.1.8.6, 5.7.2.3.5 e Prospetto 14 (k1)', fonte: letto(T20, 'pp. 27, 94–96'), stato: 'confermato',
    nota: 'non calcolato: con spazi accessibili sotto il vano (5.2.5.4) il contrappeso ha il paracadute, sotto le sue guide va anche '
      + 'k1·g·M_cw/n e il fondo della fossa regge almeno 5000 N/m². In P il software conta anche il cavo flessibile (metà corsa + 3 m, '
      + 'come sull’asse della macchina), come vuole la 5.2.1.8.5; la compensazione, se c’è, la aggiunge l’ingegnere',
  },
  {
    id: 'guide.spinte', gruppo: 'carichi', titolo: 'Spinte sulle guide di cabina',
    valore: 'portata spostata di 1/8 della cabina dal centro, più lo scostamento della cabina dalle guide (arcata a zaino); intervento del paracadute: '
      + 'Fx = k1·g·(Q·xQ + P·xP)/(n·h) sulle facce delle lame, Fy = k1·g·(Q·yQ + P·yP)/((n/2)·h) sulle punte; marcia: k2 = 1,2; '
      + 'n = 2 guide, h = distanza tra i pattini, presa pari all’ingombro verticale dell’arcata; si riporta il caso più gravoso',
    riferimento: 'UNI EN 81-50:2020, appendice C (informativa), C.2.1.1 e C.2.2.1; UNI EN 81-20:2020, 5.7.2.3.4 (portata su 3/4 della superficie: '
      + '1/8) e Prospetto 14 (k1; k2 = 1,2)', fonte: `${letto(T50, 'pp. 77–79')}; ${letto(T20, 'pp. 94–96')}`, stato: 'confermato',
    nota: 'h, la distanza tra i pattini, è una stima del software (l’ingombro verticale dell’arcata)',
  },
  {
    id: 'carichi.macchina', gruppo: 'carichi', titolo: 'Carico della macchina sulla soletta',
    valore: 'carico statico sull’asse (cabina, portata, contrappeso, funi, cavi; in taglia 2:1 la metà di cabina, portata e contrappeso) × 2 come '
      + 'coefficiente dinamico; sulla soletta anche la massa di macchina e telaio',
    riferimento: 'UNI EN 81-20:2020, 5.2.1.8.1 e appendice E.1 (informativa: l’effetto dinamico delle masse in moto con un fattore 2); il DPR '
      + '1497/1963, art. 5.1, per gli impianti costruiti secondo esso chiedeva 1,5 volte il carico statico delle funi', fonte: letto(T20, 'pp. 26, 148'), stato: 'confermato',
  },
  {
    id: 'arcata.carichi', gruppo: 'carichi', titolo: 'Arcata esistente sotto la cabina nuova o la portata nuova: verifica per i nuovi carichi',
    valore: 'nella modifica che lascia l’arcata esistente e cambia la cabina o la portata, T* (cabina con arcata, porte e operatore più la portata) '
      + 'e la portata si confrontano con i carichi documentati: se vanno oltre i limiti (con la UNI 10411-1 T* o la portata oltre il prospetto 1, con '
      + 'la UNI 10411-11 qualunque aumento di T*) o non si possono confrontare perché i carichi documentati mancano, l’arcata va verificata per i '
      + 'nuovi carichi con i dati del suo costruttore o il calcolo del tecnico; il software non ha il modello dell’arcata: «Attenzione» senza valore. '
      + 'Con T* che diminuisce valgono gli ammortizzatori e il paracadute progressivo per i nuovi carichi (verifiche del carico nell’esito)',
    riferimento: 'UNI 10411-1:2024, 6.1 e 6.9; UNI 10411-11:2024, 6.1, 6.9 e 22',
    fonte: `${letto('UNI 10411-1:2024', 'pp. 7–8')}; ${letto('UNI 10411-11:2024', 'pp. 7–8 e 15')}`, stato: 'confermato',
    verifiche: ['sl_frame'],
    nota: 'la UNI 10411-11:2024 (6.1) esclude la 6.9 quando aumenta solo il carico lato contrappeso; con l’arcata sostituita la verifica non si fa',
  },
  {
    id: 'carichi.cavi', gruppo: 'carichi', titolo: 'Massa dei cavi flessibili',
    valore: '0,5 kg/m per metà della corsa più 3 m (cavo piatto 24G0,75), sul basamento dell’argano, nella relazione e nel foglio 1',
    riferimento: '—', fonte: 'schede dei costruttori di cavi piatti (0,48–0,57 kg/m)', stato: 'stima',
  },
  {
    id: 'illuminazione', gruppo: 'locale', titolo: 'Illuminazione del vano e del locale del macchinario',
    valore: 'vano: luce fissa, almeno 50 lux a un metro dal tetto di cabina e dal fondo della fossa, 20 lux nel resto; locale del macchinario: '
      + 'almeno 200 lux al pavimento dove si lavora e 50 lux sui percorsi; 50 lux anche sull’accesso al macchinario',
    riferimento: 'UNI EN 81-20:2020, 5.2.1.4.1 a)–c), 5.2.1.4.2 e 5.2.2.2', fonte: letto(T20, 'p. 25'), stato: 'confermato',
  },
  {
    id: 'locale.temperatura', gruppo: 'locale', titolo: 'Temperatura dei locali del macchinario e degli armadi',
    valore: 'temperatura ambiente mantenuta tra +5 °C e +40 °C: ipotesi della norma, da garantire nell’edificio',
    riferimento: 'UNI EN 81-20:2020, 0.4.16 (ipotesi della norma, vale anche per il vano)', fonte: letto(T20, 'p. 14'), stato: 'confermato',
  },
  {
    id: 'distanze.testata', gruppo: 'distanze', titolo: 'Pareti all’ultimo piano e in testata diverse dal piano principale',
    valore: 'negli edifici esistenti le pareti del vano all’ultima fermata e in testata possono stare altrove che al piano principale: cabina, '
      + `guide e contrappeso restano a piombo; la cabina con soglie e operatori delle porte e il contrappeso passano ad almeno ${KV_VERT.headRun} mm `
      + 'dalle pareti spostate (meno: «Attenzione»; dentro la parete: «Non conforme»); le porte di piano dell’ultima fermata restano in linea con '
      + 'la cabina e la parete non entra nel loro spessore, i piedi delle guide e la staffa a ponte non entrano nelle pareti; le staffe arrivano '
      + 'alla parete dove sta (le staffe Panev si verificano anche lì); la distanza dalla parete di fronte all’entrata (voce '
      + 'distanze.parete.entrata) vale anche in testata',
    riferimento: 'UNI EN 81-20:2020, 5.2.5.3.1 (parete di fronte all’entrata); il resto scelta del software',
    fonte: 'scelta del software: il margine di marcia va confermato con l’installatore', stato: 'scelta', verifiche: ['v_head'],
  },
  {
    id: 'guide.staffe', gruppo: 'carichi', titolo: 'Numero e posizione delle staffe delle guide',
    valore: `una staffa ogni ${KV_VERT.bracketPitch} mm di guida, più una all’inizio e una alla fine: per guida ⌊L / ${KV_VERT.bracketPitch}⌋ + 2 `
      + `(L la lunghezza della guida); la prima a ${KV_VERT.bracketFirst} mm dal piede della guida, l’ultima a ${KV_VERT.bracketLast} mm dalla `
      + 'sua sommità, le altre a passo uguale tra le due; una staffa che cadrebbe sulla piastra di una giunzione (guide da 5 m dal fondo della '
      + 'fossa) si sposta appena oltre la piastra, dal lato dove resta sulla guida; l’ultimo spezzone non è mai più corto di metà della piastra '
      + 'più lunga, del suo franco e di una staffa (altrimenti si accorcia il primo); dalla quota dell’ultimo piano in su le staffe vanno alle '
      + `pareti della testata e le piante le contano a parte. Il passo inserito nei dati dell’impianto sostituisce i ${KV_VERT.bracketPitch} mm`,
    riferimento: 'regola di montaggio indicata dal committente', fonte: 'scelta del committente', stato: 'scelta',
    nota: 'il foglio 1 delle tavole riporta l’interasse massimo tra le staffe montate, lo stesso l della verifica delle guide di cabina (UNI EN '
      + '81-50:2020, 5.10); le quote di ogni staffa dal fondo della fossa sono nel foglio dello sviluppo delle guide',
  },
  {
    id: 'foglio.stime', gruppo: 'carichi', titolo: 'Lunghezze stimate nel foglio dei dati',
    valore: 'guide dal pavimento della fossa fino a 50 mm sotto la soletta del vano; fune del limitatore: due volte l’altezza dalla fossa al limitatore, '
      + 'posto 800 mm sopra il pavimento del locale, arrotondata al metro superiore; funi di sospensione: la lunghezza di taglio (voce impianto.funi.taglio)',
    riferimento: '—', fonte: 'stima del software, da sostituire con le misure di cantiere', stato: 'stima',
  },
  ...VOCI_SUPPORTO,
  ...VOCI_GUIDE,
  ...VOCI_LIMITATORE,
  ...VOCI_HEB,
  ...VOCI_FOSSA,
];

/** Constants of this registry, for the test that every one has its entry. */
export const COSTANTI_VERT: Readonly<Record<string, readonly CostanteVert[]>> = {
  'spazi.rifugio': ['refugeH', 'refugePlan'],
  'spazi.salto': ['jumpK'],
  'spazi.testata.parti': ['headEquip', 'headShoe', 'headBalustrade'],
  'spazi.fossa': ['pitClear', 'apron', 'apronBevel', 'apronBevelAngle', 'apronClear'],
  'spazi.balaustra': ['parapetGap1', 'parapetGap2', 'parapetH1', 'parapetH2', 'parapetEdge', 'parapetBar'],
  'spazi.tetto.superficie': ['roofFreeArea', 'roofFreeSide', 'standDrawn'],
  'spazi.tetto.arcata': ['crossheadHalf', 'crossheadH', 'roofOperator'],
  'spazi.altezze': ['entranceH', 'carInnerH'],
  'contrappeso.schermo': ['cwScreen'],
  'contrappeso.guidato': ['cwGuided', 'cwGuidedV2', 'carGuided'],
  'ammortizzatori.corsa': ['springMaxV', 'strokeK', 'strokeMin'],
  'ammortizzatori.poliuretano': ['puStroke', 'puTypical'],
  'ammortizzatori.idraulici': ['oilStrokeK', 'oilTypical'],
  'carichi.fossa': ['bufferFactor', 'k1Progressive', 'k1Roller', 'k1Instant'],
  'guide.spinte': ['k2Running', 'loadOffset'],
  'carichi.macchina': ['dynFactor'],
  'carichi.cavi': ['cableKgM'],
  illuminazione: ['wellLux', 'wellLuxElse', 'roomLux'],
  'locale.temperatura': ['tempMin', 'tempMax'],
  'foglio.stime': ['railTopGap', 'governorAbove'],
  'guide.staffe': ['bracketPitch', 'bracketFirst', 'bracketLast'],
  'distanze.testata': ['headRun'],
  'locale.basamento': ['supportFrame', 'supportBeam', 'supportPlate', 'supportPlinth', 'supportOverhang', 'supportWallGap', 'supportBearing'],
  'locale.telaio': ['machineBed', 'machineRimClear', 'machineBedOverhang', 'machineIronClear'],
  'locale.rinvio': ['rinvioAxis', 'rinvioRim', 'rinvioTop', 'rinvioOver', 'rinvioLeg', 'rinvioPads', 'rinvioBeam', 'rinvioOverhang', 'rinvioWidth'],
  'locale.putrelle': ['steelFyk', 'steelGammaM0', 'steelE', 'beamDeflection'],
  'locale.calate': ['dropTol'],
  ...COSTANTI_GUIDE,
  ...COSTANTI_LIMITATORE,
  ...COSTANTI_LOCALE,
  ...COSTANTI_HEB,
  ...COSTANTI_FOSSA,
};
