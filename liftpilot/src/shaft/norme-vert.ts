// Registry of the section, the machine room and the loads on the building: every number these parts of the shaft
// design take from a standard or a design choice, with its entry for the engineer's checklist and the report.
// Italian texts, clause numbers and values only. Sources: summaries of EN 81-20/50 by makers and notified bodies
// (research of 30/09/2026, docs of the licensed text still to be checked).
import type { VoceVano } from './norme';
import { VOCI_SUPPORTO } from './norme-supporto';

export const KV_VERT = {
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
  // 5.2.5.8.2: pit floor to the lowest parts of the car ≥ 500 mm; apron (5.4.5) ≥ 750 mm and 100 mm clear
  pitClear: 500,
  apron: 750,
  apronClear: 100,
  // 5.4.7.4: balustrade on the car roof when the free distance to the wall is > 300 mm: 700 mm high up to 500 mm, 1100 above
  parapetGap1: 300,
  parapetGap2: 500,
  parapetH1: 700,
  parapetH2: 1100,
  // 5.2.5.5.1: screen of the counterweight in the pit up to ≥ 2000 mm above the pit floor
  cwScreen: 2000,
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
  // 5.2.5.7.3: a place where a person can stand: ≥ 0,12 m² with the smaller side ≥ 250 mm; drawn 400 × 300 unless set
  roofFreeArea: 0.12,
  roofFreeSide: 250,
  standDrawn: [400, 300],
  // 5.2.6.3.2.1 and 5.2.3: machine room: clear height of working areas, free area in front of the panel, access door [mm]
  roomH: 2100,
  panelFreeDepth: 700,
  panelFreeWidth: 500,
  doorMinW: 600,
  doorMinH: 2000,
  // 5.2.1.8 and UNI EN 81-50:2020, 5.10: 4 × the static load under each buffer; impact factor of the safety gear on
  // the rails (progressive 2, instantaneous roller type 3, instantaneous 5); running 1,2; rated load off centre by 1/8
  bufferFactor: 4,
  k1Progressive: 2,
  k1Roller: 3,
  k1Instant: 5,
  k2Running: 1.2,
  loadOffset: 0.125,
  // practice: dynamic coefficient on the machine's static load; travelling cables [kg/m]
  dynFactor: 1.5,
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
  // the machine's support (registry locale.basamento, locale.putrelle): pads under the mounts; the typical frame, beams,
  // plates and plinth; frame and plinth past the bedplate at each end; the beams' bearing in the walls [mm]; steel
  // S275 [MPa], γM0, E [MPa]; the beams' elastic deflection limit (span / this)
  supportPads: 30,
  supportFrame: 'UPN 200',
  supportBeam: 'IPE 200',
  supportPlate: 20,
  supportPlinth: 250,
  supportOverhang: 100,
  supportBearing: 150,
  // a maker's machine on our bedframe (registry locale.telaio): its least height under the feet, the sheave's rim over
  // its underside, past the machine at each end [mm]
  machineBed: 80,
  machineRimClear: 30,
  machineBedOverhang: 40,
  steelFyk: 275,
  steelGammaM0: 1.05,
  steelE: 210000,
  beamDeflection: 1500,
} as const;

export type CostanteVert = keyof typeof KV_VERT;

const EN = 'sintesi della UNI EN 81-20:2020 di costruttori e organismi notificati (KONE, Sodimas, MCCAA), fonti secondarie concordi';
const EN50 = 'sintesi della UNI EN 81-50:2020 (Elevator World, GMV, tesi UC3M), fonti secondarie';

export const VOCI_VERT: readonly VoceVano[] = [
  {
    id: 'spazi.rifugio', gruppo: 'sezione', titolo: 'Spazi di rifugio sul tetto di cabina e in fossa',
    valore: 'tipo 1 (in piedi) 400 × 500 mm in pianta, alto 2000 mm; tipo 2 (accucciato) 500 × 700 mm, alto 1000 mm; tipo 3 (disteso, solo in fossa) '
      + '700 × 1000 mm, alto 500 mm; in testata con la cabina nella posizione più alta, in fossa con la cabina sugli ammortizzatori compressi',
    riferimento: 'UNI EN 81-20:2020, 5.2.5.7.1 e 5.2.5.8.1 (Tabella 3)', fonte: EN, stato: 'da_verificare',
    verifiche: ['h_refuge', 'p_refuge'],
  },
  {
    id: 'spazi.salto', gruppo: 'sezione', titolo: 'Posizione più alta della cabina',
    valore: 'contrappeso sugli ammortizzatori completamente compressi, più il salto 0,035·v² m (v velocità nominale)',
    riferimento: 'UNI EN 81-20:2020, 5.2.5.6.1 (Tabella 2)', fonte: EN, stato: 'da_verificare',
    verifiche: ['h_refuge', 'h_clear'],
  },
  {
    id: 'spazi.testata.parti', gruppo: 'sezione', titolo: 'Distanze libere dal soffitto con la cabina nella posizione più alta',
    valore: '≥ 500 mm sopra le apparecchiature sul tetto di cabina (operatore); ≥ 100 mm sopra pattini, attacchi delle funi e traversa dell\'arcata; '
      + '≥ 300 mm sopra il corrimano della balaustra',
    riferimento: 'UNI EN 81-20:2020, 5.2.5.7.2', fonte: EN, stato: 'da_verificare',
    verifiche: ['h_clear'],
  },
  {
    id: 'spazi.fossa', gruppo: 'sezione', titolo: 'Distanze in fossa con la cabina sugli ammortizzatori compressi',
    valore: '≥ 500 mm dal pavimento della fossa alle parti più basse della cabina; grembiule alto ≥ 750 mm sotto la soglia di cabina, con ≥ 100 mm liberi '
      + 'dal pavimento della fossa',
    riferimento: 'UNI EN 81-20:2020, 5.2.5.8.2 e 5.4.5', fonte: EN, stato: 'da_verificare',
    verifiche: ['p_refuge', 'p_apron'],
  },
  {
    id: 'spazi.balaustra', gruppo: 'sezione', titolo: 'Balaustra sul tetto di cabina',
    valore: 'richiesta se la distanza libera dal tetto alla parete supera 300 mm: alta 700 mm fino a 500 mm di distanza, 1100 mm oltre',
    riferimento: 'UNI EN 81-20:2020, 5.4.7.4', fonte: EN, stato: 'da_verificare',
    verifiche: ['h_parapet'],
  },
  {
    id: 'spazi.tetto.superficie', gruppo: 'sezione', titolo: 'Superficie dove una persona può stare sul tetto di cabina',
    valore: 'area continua ≥ 0,12 m² con il lato minore ≥ 250 mm (disegnata 400 × 300 mm, modificabile sulla pianta in testata); sopra di essa '
      + 'deve esserci l\'altezza dello spazio di rifugio',
    riferimento: 'UNI EN 81-20:2020, 5.2.5.7.3', fonte: EN, stato: 'da_verificare',
    verifiche: ['h_stand'],
  },
  {
    id: 'contrappeso.schermo', gruppo: 'sezione', titolo: 'Schermo del contrappeso in fossa',
    valore: 'dal punto più basso del contrappeso sugli ammortizzatori compressi fino ad almeno 2000 mm sopra il pavimento della fossa '
      + '(altezza dello schermo modificabile sul progetto, mai sotto questo valore)',
    riferimento: 'UNI EN 81-20:2020, 5.2.5.5.1', fonte: EN, stato: 'da_verificare',
    verifiche: ['p_screen'],
  },
  {
    id: 'ammortizzatori.corsa', gruppo: 'sezione', titolo: 'Ammortizzatori ad accumulo di energia lineari (molle)',
    valore: 'ammessi fino a 1 m/s; corsa ≥ 0,135·v² m e comunque ≥ 65 mm; extracorsa della cabina e del contrappeso ≥ 0 (nessun minimo nella norma)',
    riferimento: 'UNI EN 81-20:2020, 5.8.2 (accumulo di energia, caratteristica lineare; sottoclausola da verificare sul testo)', fonte: EN, stato: 'da_verificare',
    verifiche: ['b_type', 'b_car', 'b_cw', 'b_runby'],
  },
  {
    id: 'ammortizzatori.poliuretano', gruppo: 'sezione', titolo: 'Ammortizzatori ad accumulo di energia non lineari (tamponi in poliuretano)',
    valore: 'ammessi fino a 1 m/s come le molle; nessuna corsa minima da formula: il campo di masse del certificato di esame di tipo per la velocità '
      + 'deve comprendere, per ogni tampone, la cabina vuota e a pieno carico (o il contrappeso); «completamente compresso» vuol dire compresso del '
      + '90 % dell\'altezza, quindi la corsa è 0,9·H negli spazi in fossa e in testata; tampone tipico alti 80 mm (P+S Diepocell D, Ø da 80 a 220 mm; '
      + 'ACLA AUTAN XL)',
    riferimento: 'UNI EN 81-20:2020, 5.8.2 (caratteristica non lineare) e UNI EN 81-50:2020, 5.5 (esame di tipo); sottoclausole da verificare sul testo',
    fonte: 'cataloghi P+S Diepocell (wwlift.de), ACLA AUTAN XL (acla.de), Stingl (corsa al 90 %); estratti di ricerca del 1° ottobre 2026', stato: 'da_verificare',
    verifiche: ['b_type', 'b_car', 'b_cw'],
  },
  {
    id: 'ammortizzatori.idraulici', gruppo: 'sezione', titolo: 'Ammortizzatori a dissipazione di energia (idraulici)',
    valore: 'a ogni velocità; corsa ≥ 0,0674·v² m (arresto per gravità al 115 % della velocità nominale); la corsa ridotta con il controllo del '
      + 'rallentamento non è considerata; ammortizzatori tipici: Oleo LSB10 fino a 1 m/s, alto 222,2 mm con corsa 73,4 mm; LSB16 fino a 1,6 m/s, '
      + 'alto 485,5 mm con corsa 173,5 mm',
    riferimento: 'UNI EN 81-20:2020, 5.8.2 (dissipazione di energia; sottoclausola da verificare sul testo)',
    fonte: 'catalogo Oleo LSB e SEB (oleo.co.uk), estratti di ricerca del 1° ottobre 2026', stato: 'da_verificare',
    verifiche: ['b_type', 'b_car', 'b_cw'],
  },
  {
    id: 'locale.macchina', gruppo: 'locale', titolo: 'Locale del macchinario',
    valore: 'altezza libera delle zone di lavoro ≥ 2100 mm (1800 mm sui percorsi); davanti al quadro una superficie libera profonda ≥ 700 mm e larga '
      + '≥ 500 mm o quanto il quadro; porta di accesso ≥ 600 × 2000 mm',
    riferimento: 'UNI EN 81-20:2020, 5.2.6.3.2.1 e 5.2.3', fonte: EN, stato: 'da_verificare',
    verifiche: ['m_height', 'm_panel', 'm_door'],
  },
  {
    id: 'carichi.fossa', gruppo: 'carichi', titolo: 'Carichi sul pavimento della fossa',
    valore: 'sotto ogni ammortizzatore 4 volte il carico statico: 4·g·(P+Q) per la cabina, 4·g·M_cw per il contrappeso, divisi tra gli ammortizzatori; '
      + 'sotto ogni guida di cabina la massa della guida più la reazione all\'intervento del paracadute k1·g·(P+Q)/2 (k1 = 2 progressivo, 3 istantaneo a rulli, '
      + '5 istantaneo); sotto ogni guida del contrappeso la massa della guida',
    riferimento: 'UNI EN 81-20:2020, 5.2.1.8; UNI EN 81-50:2020, 5.10', fonte: `${EN}; ${EN50}`, stato: 'da_verificare',
  },
  {
    id: 'guide.spinte', gruppo: 'carichi', titolo: 'Spinte sulle guide di cabina',
    valore: 'portata spostata di 1/8 della cabina dal centro, più lo scostamento della cabina dalle guide (arcata a zaino); intervento del paracadute: '
      + 'Fx = k1·g·(Q·xQ + P·xP)/(n·h) sulle facce delle lame, Fy = k1·g·(Q·yQ + P·yP)/((n/2)·h) sulle punte; marcia: k2 = 1,2; '
      + 'n = 2 guide, h = distanza tra i pattini, presa pari all\'ingombro verticale dell\'arcata; si riporta il caso più gravoso',
    riferimento: 'UNI EN 81-50:2020, 5.10', fonte: EN50, stato: 'da_verificare',
  },
  {
    id: 'carichi.macchina', gruppo: 'carichi', titolo: 'Carico della macchina sulla soletta',
    valore: 'carico statico sull\'asse (cabina, portata, contrappeso, funi, cavi; in taglia 2:1 la metà di cabina, portata e contrappeso) × 1,5 come '
      + 'coefficiente dinamico, modificabile nei dati dell\'impianto; sulla soletta anche la massa di macchina e telaio',
    riferimento: '—', fonte: 'prassi di progetto: la EN 81 non fissa un coefficiente dinamico per gli appoggi della macchina (in altre prassi 2,0)', stato: 'prassi',
  },
  {
    id: 'carichi.cavi', gruppo: 'carichi', titolo: 'Massa dei cavi flessibili',
    valore: '0,5 kg/m per metà della corsa più 3 m, se non data nei dati dell\'impianto (cavo piatto 24G0,75)',
    riferimento: '—', fonte: 'schede dei costruttori di cavi piatti (0,48–0,57 kg/m)', stato: 'stima',
  },
  {
    id: 'illuminazione', gruppo: 'locale', titolo: 'Illuminazione del vano e del locale del macchinario',
    valore: 'vano: illuminazione fissa di almeno 50 lux a 1 m sopra il tetto della cabina e sopra il pavimento della fossa, 20 lux altrove; '
      + 'locale del macchinario: almeno 200 lux al pavimento nelle zone di lavoro',
    riferimento: 'UNI EN 81-20:2020, 5.2.1.4', fonte: EN, stato: 'da_verificare',
  },
  {
    id: 'locale.temperatura', gruppo: 'locale', titolo: 'Temperatura dei locali del macchinario e degli armadi',
    valore: 'temperatura ambiente mantenuta tra +5 °C e +40 °C: ipotesi della norma, da garantire nell\'edificio',
    riferimento: 'UNI EN 81-20:2020, introduzione (ipotesi)', fonte: EN, stato: 'da_verificare',
  },
  {
    id: 'distanze.testata', gruppo: 'distanze', titolo: 'Pareti all\'ultimo piano e in testata diverse dal piano principale',
    valore: 'negli edifici esistenti le pareti del vano all\'ultima fermata e in testata possono stare altrove che al piano principale: cabina, '
      + `guide e contrappeso restano a piombo; la cabina con soglie e operatori delle porte e il contrappeso passano ad almeno ${KV_VERT.headRun} mm `
      + 'dalle pareti spostate (meno: «Attenzione»; dentro la parete: «Non conforme»); le porte di piano dell\'ultima fermata restano in linea con '
      + 'la cabina e la parete non entra nel loro spessore, i piedi delle guide e la staffa a ponte non entrano nelle pareti; le staffe arrivano '
      + 'alla parete dove sta (le staffe Panev si verificano anche lì); la distanza dalla parete di fronte all\'entrata (voce '
      + 'distanze.parete.entrata) vale anche in testata',
    riferimento: 'UNI EN 81-20:2020, 5.2.5.3.1 (parete di fronte all\'entrata); il resto scelta del software',
    fonte: 'scelta del software: il margine di marcia va confermato con l\'installatore', stato: 'scelta', verifiche: ['v_head'],
  },
  {
    id: 'guide.staffe', gruppo: 'carichi', titolo: 'Numero e posizione delle staffe delle guide',
    valore: `una staffa ogni ${KV_VERT.bracketPitch} mm di guida, più una all'inizio e una alla fine: per guida ⌊L / ${KV_VERT.bracketPitch}⌋ + 2 `
      + `(L la lunghezza della guida); la prima a ${KV_VERT.bracketFirst} mm dal piede della guida, l'ultima a ${KV_VERT.bracketLast} mm dalla `
      + 'sua sommità, le altre a passo uguale tra le due; una staffa che cadrebbe sulla piastra di una giunzione (guide da 5 m dal fondo della '
      + `fossa) si sposta appena oltre la piastra. Il passo inserito nei dati dell'impianto sostituisce i ${KV_VERT.bracketPitch} mm`,
    riferimento: 'regola di montaggio indicata dal committente', fonte: 'scelta del committente', stato: 'scelta',
    nota: 'il passo delle staffe va confermato con la verifica delle guide (UNI EN 81-50:2020, 5.10), che usa la distanza tra le staffe',
  },
  {
    id: 'foglio.stime', gruppo: 'carichi', titolo: 'Lunghezze stimate nel foglio dei dati',
    valore: 'guide dal pavimento della fossa fino a 50 mm sotto la soletta del vano; fune del limitatore: due volte l\'altezza dalla fossa al limitatore, '
      + 'posto 800 mm sopra il pavimento del locale; funi di trazione: taglia × (corsa + 2 × tratto oltre la corsa), più deviazione o rinvii',
    riferimento: '—', fonte: 'stima del software, da sostituire con le misure di cantiere', stato: 'stima',
  },
  ...VOCI_SUPPORTO,
];

/** Constants of this registry, for the test that every one has its entry. */
export const COSTANTI_VERT: Readonly<Record<string, readonly CostanteVert[]>> = {
  'spazi.rifugio': ['refugeH', 'refugePlan'],
  'spazi.salto': ['jumpK'],
  'spazi.testata.parti': ['headEquip', 'headShoe', 'headBalustrade'],
  'spazi.fossa': ['pitClear', 'apron', 'apronClear'],
  'spazi.balaustra': ['parapetGap1', 'parapetGap2', 'parapetH1', 'parapetH2'],
  'spazi.tetto.superficie': ['roofFreeArea', 'roofFreeSide', 'standDrawn'],
  'contrappeso.schermo': ['cwScreen'],
  'ammortizzatori.corsa': ['springMaxV', 'strokeK', 'strokeMin'],
  'ammortizzatori.poliuretano': ['puStroke', 'puTypical'],
  'ammortizzatori.idraulici': ['oilStrokeK', 'oilTypical'],
  'locale.macchina': ['roomH', 'panelFreeDepth', 'panelFreeWidth', 'doorMinW', 'doorMinH'],
  'carichi.fossa': ['bufferFactor', 'k1Progressive', 'k1Roller', 'k1Instant'],
  'guide.spinte': ['k2Running', 'loadOffset'],
  'carichi.macchina': ['dynFactor'],
  'carichi.cavi': ['cableKgM'],
  illuminazione: ['wellLux', 'wellLuxElse', 'roomLux'],
  'locale.temperatura': ['tempMin', 'tempMax'],
  'foglio.stime': ['railTopGap', 'governorAbove'],
  'guide.staffe': ['bracketPitch', 'bracketFirst', 'bracketLast'],
  'distanze.testata': ['headRun'],
  'locale.basamento': ['supportPads', 'supportFrame', 'supportBeam', 'supportPlate', 'supportPlinth', 'supportOverhang', 'supportBearing'],
  'locale.telaio': ['machineBed', 'machineRimClear', 'machineBedOverhang'],
  'locale.putrelle': ['steelFyk', 'steelGammaM0', 'steelE', 'beamDeflection'],
};
