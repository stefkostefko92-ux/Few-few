// Registry of the machine room's floor: its height, the free areas in front of the control panel and beside the machine,
// the ways to them from the door, the door, the openings over the well; the panel clear of what stands on the floor and
// where the software puts it (room-floor.ts, room-panel.ts); the room of the diverting pulleys of a machine below. The
// constants and the entries are spread into KV_VERT and VOCI_VERT (norme-vert.ts); same form as norme.ts, Italian texts,
// clause numbers and values only (the numbers as written here: the registry test compares them with KV_VERT).
import { letto } from '../calc/norme-fonti';
import type { VoceVano } from './norme';

const T20 = 'UNI EN 81-20:2020';

export const KV_LOCALE = {
  // 5.2.6.3.2.1 and 5.2.3: machine room: clear height of working areas, free area in front of the panel, access door [mm]
  roomH: 2100,
  panelFreeDepth: 700,
  panelFreeWidth: 500,
  // 5.2.6.3.2.1: free area for the maintenance of moving parts and the manual emergency operation [mm]
  maintW: 500,
  maintD: 600,
  // 5.2.6.3.2.2: access routes to the free areas ≥ 0,50 m wide (0,40 m allowed where nothing moves: not used)
  routeW: 500,
  doorMinW: 600,
  doorMinH: 2000,
  // 5.2.6.3.3 and 5.2.6.7.2: the openings over the well with upstands at least this high over the floor [mm]
  slabKerb: 50,
  // 5.2.6.7.1 and 5.2.3.2 b): the room of the diverting pulleys (machine below): clear height of its ways, its access
  // door's height (the width as the machine room's), free height over unprotected pulleys [mm]
  pulleyRoomH: 1500,
  pulleyDoorH: 1400,
  pulleyAbove: 300,
  // UNI 10411-1:2024, 9.2 and UNI EN 81-21:2022, 5.9: an existing machine room under this height takes the measures of
  // EN 81-21, with this clear height under the padding of the ceiling [mm]
  existingRoomMin: 2000,
  existingRoomPad: 1800,
  // where the software puts the control panel (registry locale.quadro.posto): clear of what stands on the floor by this
  // much where it can, tried every this much along the walls [mm]
  panelSideGap: 100,
  panelStep: 50,
  // 5.2.6.3.2.3: free height over the machine's unguarded rotating parts (the sheave, the handwheel, a diverting pulley
  // in the room) [mm]
  rotatingAbove: 300,
  // where the software wants the free area beside the machine (registry locale.volantino): within this distance of the
  // handwheel, where the manual emergency operation is done [mm]
  wheelReach: 300,
  // an existing room lower than existingRoomMin (registry locale.esistente.altezza): the padding under its ceiling the
  // software counts [mm]
  existingPadding: 50,
  // the slab's openings (registry locale.fori): this far clear of the ropes and of a pulley dipping into the slab, each
  // with an upstand this thick round it [mm]
  holeGap: 30,
  kerbW: 100,
  // the new support's bearings this far at least from the edge of an existing opening of the slab (m_holes) [mm]
  holeBearing: 100,
  // the lifting hook over the machine (registry locale.gancio): its rated load the heaviest piece rounded up to this step
  // and at least this much [kg]; its eye this far under the ceiling [mm]
  hookStep: 500,
  hookMin: 1000,
  hookDrop: 150,
  // a 2:1 roping's rope hitches on the slab (registry locale.attacchi): a square steel plate under the slab, this wide
  // and thick [mm]
  hitchPlate: 180,
  hitchPlateT: 20,
  // 5.10.8.2: the switch of the room's light within this distance of the access [mm] (registry locale.impianti)
  lightSwitchMax: 1000,
} as const;

export const VOCI_LOCALE: readonly VoceVano[] = [
  {
    id: 'locale.macchina', gruppo: 'locale', titolo: 'Locale del macchinario',
    valore: 'altezza libera delle zone di lavoro ≥ 2100 mm (1800 mm sui percorsi); davanti al quadro una superficie libera profonda ≥ 700 mm e larga '
      + '≥ 500 mm o quanto il quadro; per la manutenzione delle parti in movimento e la manovra di emergenza una superficie libera di almeno '
      + '500 × 600 mm (il software la cerca accanto all’argano, fino a muri, quadro, limitatore e interruttore generale, sul lato del volantino se ci sta: '
      + 'locale.volantino; la disegna in pianta con i percorsi dalla porta); almeno 300 mm liberi in verticale sopra le parti rotanti non protette '
      + '(la puleggia di frizione con le funi, il volantino, la puleggia di rinvio nel locale); '
      + 'percorsi dalla porta alle superfici libere larghi ≥ 500 mm (il software chiede 500 mm ovunque, anche dove la norma ammette 0,40 m) e alti '
      + '≥ 1800 mm; porta di accesso ≥ 600 × 2000 mm, che non si apre verso l’interno del locale; aperture nella soletta sopra il vano ridotte al '
      + 'minimo, con manicotti o bordi che sporgono almeno 50 mm dal pavimento',
    riferimento: 'UNI EN 81-20:2020, 5.2.6.3.2.1 (2,10 m e superfici libere), 5.2.6.3.2.2 (percorsi: 0,50 m di larghezza, 1,80 m di altezza), '
      + '5.2.6.3.2.3 (0,30 m sopra le parti rotanti non protette), 5.2.3.2 a) (porta), 5.2.3.3 a) (verso di apertura) e 5.2.6.3.3 (aperture)',
    fonte: `${letto(T20, 'pp. 29–30, 43')}; le superfici libere anche in UNI EN 81-1:1999, 6.3.2.1 (edizione 2008: 6.3.3.1)`,
    stato: 'confermato',
    nota: 'davanti al quadro il software verifica la profondità libera fino a ciò che sta sul pavimento (l’argano con il basamento e il rinvio, il '
      + 'limitatore, l’interruttore generale) e che la parete sia lunga almeno quanto il maggiore tra 500 mm e il quadro; la larghezza dei '
      + 'percorsi la misura dalla porta su una griglia di circa 20 mm, per difetto; l’altezza dei percorsi segue quella del locale; il verso di '
      + 'apertura della porta non è un dato del progetto (i disegni la danno apribile verso l’esterno); lo spazio sopra le parti rotanti lo misura '
      + 'dal loro punto più alto al soffitto più basso (avvertimento: con le parti protette da un carter il tecnico lo indica e la verifica non '
      + 'serve; fino a LIFT 1.28.0 e ROOM 1.12.0 non era verificato). Con la modifica di un impianto esistente (UNI 10411-1/-11:2024, 9.2) la superficie davanti al '
      + 'quadro entra nell’esito anche quando cambia solo la macchina, che le può stare davanti; l’altezza e la porta del locale restano '
      + '«esistente» (la 9.2 ammette l’altezza attuale: le condizioni sono tra i punti da verificare in sito). Con la macchina in basso le '
      + 'stesse verifiche valgono per il suo locale, accanto al vano o sotto la fossa, con l’argano come ciò che sta sul pavimento; un locale '
      + 'sopra il vano non ha la macchina (con i rinvii è il locale delle pulegge, locale.pulegge)',
    verifiche: ['m_height', 'm_panel', 'm_free', 'm_route', 'm_door', 'm_above'],
  },
  {
    id: 'locale.esistente', gruppo: 'locale', titolo: 'Locale del macchinario esistente nella modifica',
    valore: 'con la macchina nuova il locale segue la UNI EN 81-20 5.2.6.3 attorno alle apparecchiature sostituite o aggiunte; l’altezza libera '
      + 'esistente sulle zone di lavoro può restare sotto 2100 mm se non si riduce; con la UNI 10411-1, sotto 2000 mm zone segnalate, materiale '
      + 'ammortizzante al soffitto e almeno 1800 mm liberi sotto di esso (UNI EN 81-21:2022, 5.9); con la UNI 10411-11 resta l’altezza esistente',
    riferimento: 'UNI 10411-1:2024, 9.1–9.2; UNI 10411-11:2024, 9.2; UNI EN 81-21:2022, 5.9',
    fonte: `${letto('UNI 10411-1:2024', 'p. 9')}; ${letto('UNI 10411-11:2024', 'p. 9')}; ${letto('UNI EN 81-21:2022', 'p. 23')}`, stato: 'confermato',
    nota: 'nella nota del foglio della sostituzione; nell’esito l’altezza e la porta restano «esistente», la superficie davanti al quadro entra '
      + 'quando cambia la macchina',
  },
  {
    id: 'locale.pulegge', gruppo: 'locale', titolo: 'Locale delle pulegge di rinvio (macchina in basso)',
    valore: 'percorsi alti almeno 1500 mm fino alle apparecchiature, una superficie libera di 500 × 600 mm dove si lavora, almeno 300 mm liberi '
      + 'sopra le pulegge non protette; porta di accesso ≥ 600 × 1400 mm, che non si apre verso l’interno; un dispositivo di arresto presso ogni '
      + 'accesso; aperture sopra il vano con manicotti o bordi di almeno 50 mm; né quadro né interruttore generale, che stanno nel locale della '
      + 'macchina',
    riferimento: 'UNI EN 81-20:2020, 5.2.6.7.1 (altezza e superfici), 5.2.6.7.2 (aperture), 5.2.3.2 b) (porta), 5.2.1.5.2 c) (arresto) e '
      + '5.10.5.1.2 (interruttore generale)',
    fonte: letto(T20, 'pp. 26, 29, 49'), stato: 'confermato',
    nota: 'con la macchina in basso e i rinvii in un locale sopra il vano, il software verifica l’altezza e la porta di quel locale con questi '
      + 'valori e lo spazio sopra le pulegge, con i loro assi dove li mette il software (impianto.basso.schema; avvertimento: non serve con le '
      + 'pulegge protette); non verifica la superficie libera. Fino a LIFT 1.23.0 quel locale era verificato come un locale del macchinario (2100 mm, porta 600 × 2000 mm, quadro) e '
      + 'il locale della macchina in basso solo per l’ingombro',
    verifiche: ['m_pheight', 'm_pdoor', 'm_pabove'],
  },
  {
    id: 'locale.quadro', gruppo: 'locale', titolo: 'Il quadro di manovra fuori dall’ingombro dell’argano',
    valore: 'il quadro, con la larghezza e la profondità inserite, sta dentro il locale e non entra nell’ingombro in pianta di ciò che sta sul '
      + 'pavimento: l’argano sul suo basamento con il telaio del rinvio o il supporto del rinvio, il limitatore di velocità, l’interruttore '
      + 'generale; la distanza minima tra i contorni non è negativa',
    riferimento: '—',
    fonte: 'geometria del progetto: la pianta del locale, il quadro inserito o posto dal software, gli ingombri dell’argano, del basamento, del '
      + 'rinvio e del limitatore come li disegna la pianta del locale',
    stato: 'derivazione', verifiche: ['m_quadro'],
  },
  {
    id: 'locale.quadro.posto', gruppo: 'locale', titolo: 'Dove il software mette il quadro di manovra',
    valore: 'con la posizione del quadro lasciata al software il quadro sta contro una parete: fuori dall’ingombro dell’argano, del limitatore e '
      + 'dell’interruttore generale, se si può ad almeno 100 mm da essi e dalla luce della porta (il suo telaio); né il quadro né la superficie '
      + 'libera davanti a esso davanti alla porta '
      + '(la luce della porta per 700 mm dentro il locale); la superficie libera davanti al quadro profonda ≥ 700 mm, quella accanto all’argano '
      + 'conservata, percorsi di almeno 500 mm dalla porta a entrambe. Tra i posti che lo permettono, provati ogni 50 mm lungo le pareti, quello '
      + 'più vicino alla porta a piedi, poi quello con la superficie libera più profonda; se nessuno va bene, quello con meno mancanze, e le '
      + 'verifiche dicono quali. L’interruttore generale sta accanto alla porta, 150 mm oltre lo stipite (prima della porta se la parete finisce)',
    riferimento: 'UNI EN 81-20:2020, 5.2.6.3.2.1 a) e 5.2.6.3.2.2 (superficie davanti al quadro e percorsi), 5.10.5.2 (interruttore generale '
      + 'raggiungibile dall’ingresso) e 5.12.1.6.1 e) (la macchina visibile dai comandi della manovra elettrica di emergenza: nel locale senza '
      + 'pareti divisorie del software lo è); il resto scelta del software',
    fonte: `${letto(T20, 'pp. 43, 117, 129')}; la vicinanza alla porta, la distanza laterale e il passo sono scelte del software`,
    stato: 'scelta',
  },
  {
    id: 'locale.volantino', gruppo: 'locale', titolo: 'La superficie libera accanto all’argano presso il volantino',
    valore: 'la superficie libera di 500 × 600 mm per la manutenzione serve anche la manovra manuale di emergenza: il software la prende sul lato '
      + 'dell’argano dove arriva entro 300 mm dal volantino (all’estremità del motore, o dove lo mette la scheda del costruttore) se lì è '
      + 'profonda quanto serve, altrimenti sul lato più libero; quando nessuna superficie libera arriva entro 300 mm dal volantino la verifica '
      + 'avverte (margine = 300 mm meno la distanza)',
    riferimento: 'UNI EN 81-20:2020, 5.2.6.3.2.1 b) (superficie libera dove servono manutenzione e manovra manuale di emergenza, 5.9.2.3.1); '
      + 'la distanza dal volantino è una scelta del software',
    fonte: `${letto(T20, 'p. 43')}; il volantino e la leva di sblocco del freno dalle schede dei costruttori o dall’argano generico del software`,
    stato: 'scelta', verifiche: ['m_wheel'],
    nota: 'la leva di sblocco del freno sta accanto al freno, fra riduttore e motore: il tecnico conferma che si manovra dalla stessa superficie',
  },
  {
    id: 'locale.esistente.altezza', gruppo: 'locale', titolo: 'Altezza del locale esistente sotto 2,0 m (modifica con la UNI 10411-1)',
    valore: 'nella modifica collaudata con la UNI 10411-1 il software verifica l’altezza libera del locale esistente: almeno 2000 mm passa; fra 1800 mm '
      + 'più lo spessore del materiale ammortizzante (50 mm, se non indicato) e 2000 mm avverte — zone segnalate a strisce gialle e nere o con un '
      + 'cartello, materiale ammortizzante sotto il soffitto e almeno 1800 mm liberi sotto di esso; sotto non passa. Con la UNI 10411-11 l’altezza '
      + 'esistente resta e la verifica non entra nell’esito; per un impianto nuovo vale la verifica dell’altezza di 2100 mm',
    riferimento: 'UNI 10411-1:2024, 9.2; UNI EN 81-21:2022, 5.9; UNI 10411-11:2024, 9.2',
    fonte: `${letto('UNI 10411-1:2024', 'p. 9')}; ${letto('UNI EN 81-21:2022', 'p. 23')}; lo spessore di 50 mm del materiale ammortizzante è una `
      + 'scelta del software, da sostituire con quello del prodotto posato',
    stato: 'scelta', verifiche: ['m_hexist'],
    nota: 'fino a ROOM 1.12.0 e LIFT 1.28.0 le misure della UNI EN 81-21 erano solo nella nota del foglio, stampata sempre; ora la nota le dice '
      + 'quando il locale è più basso di 2000 mm',
  },
  {
    id: 'locale.fori', gruppo: 'locale', titolo: 'Fori nella soletta: misura, posizione e bordi',
    valore: 'ogni foro della soletta sopra il vano (funi di trazione, puleggia di rinvio che vi scende, attacchi delle funi in taglia 2:1) ha '
      + 'i lati a 30 mm dalle funi nelle due posizioni estreme della cabina e dalla puleggia; fori più vicini di 80 mm diventano uno; '
      + 'ogni foro ha un bordo alto 50 mm sul pavimento finito e spesso 100 mm tutto attorno; la pianta del locale dà di ogni foro la misura '
      + '(«FORO L × P»: L lungo x, P lungo y del locale; con la linea delle calate obliqua lungo e di traverso le calate) e la posizione del centro '
      + 'dai muri interni del vano (x dal muro di sinistra, y dal muro dell’accesso A, come nel rilievo); la sezione B-B disegna e quota i bordi; '
      + 'nella sostituzione le aperture esistenti rilevate sono disegnate tratteggiate e gli appoggi del nuovo basamento ne stanno ad almeno 100 mm '
      + 'dal bordo (m_holes, avviso: un’apertura si può chiudere)',
    riferimento: 'UNI EN 81-20:2020, 5.2.6.3.3 (aperture ridotte al minimo, bordi di almeno 50 mm); il gioco e lo spessore del bordo sono scelte '
      + 'del software',
    fonte: `${letto(T20, 'p. 43')}; gioco di 30 mm come il 3D che taglia la soletta; bordo in calcestruzzo o lamiera, da adattare in sito`,
    stato: 'scelta', verifiche: ['m_holes'],
  },
  {
    id: 'locale.gancio', gruppo: 'locale', titolo: 'Gancio di sollevamento sopra l’argano',
    valore: 'un gancio di sollevamento fissato al soffitto sopra il baricentro dell’argano (al centro del suo ingombro in pianta), quotato in '
      + 'pianta da due muri del locale; la portata è il pezzo più pesante da sollevare — l’argano con il suo telaio, il telaio con il rinvio del '
      + 'costruttore, nella sostituzione anche l’argano esistente — arrotondato per eccesso al multiplo di 500 kg, almeno 1000 kg; l’occhio del '
      + 'gancio 150 mm sotto il soffitto: la sezione B-B quota l’altezza libera sotto di esso',
    riferimento: 'UNI EN 81-20:2020, 5.2.1.7 (ganci o punti di ancoraggio con la portata indicata, ben posizionati); posizione, arrotondamento '
      + 'e minimo sono scelte del software',
    fonte: `${letto(T20, 'p. 26')}; portate commerciali dei ganci e dei golfari da soffitto`,
    stato: 'scelta',
    nota: 'la portata va marcata sul gancio; il gancio e il suo ancoraggio nel solaio li verifica il tecnico strutturale (con un gancio esistente '
      + 'la portata targata va confrontata con quella del disegno); il tecnico può prescriverne un’altra',
  },
  {
    id: 'locale.attacchi', gruppo: 'locale', titolo: 'Attacchi delle funi in taglia 2:1',
    valore: 'in taglia 2:1 le funi finiscono negli attacchi sulla soletta del locale: una piastra d’acciaio sotto la soletta, quadrata di 180 mm '
      + 'e spessa 20 mm, con tirafondi passanti e una contropiastra sul pavimento del locale; i carichi P2 (lato cabina) e P3 (lato contrappeso) '
      + 'agiscono lì, separati da P1 (il basamento dell’argano); la pianta del locale li segna e quota il loro centro dai muri interni del vano',
    riferimento: 'UNI EN 81-20:2020, 5.2.1.8.1 (carichi sull’edificio) e 5.5.2.3.1 (attacchi delle funi ai punti fissi dei tratti morti); dimensioni scelta del software',
    fonte: 'scelta del software (attacchi delle funi sulla soletta come nella pratica italiana), da verificare dal tecnico strutturale',
    stato: 'scelta',
    nota: 'attacchi su una trave o sul telaio dell’argano sono un’alternativa: il tecnico lo indica, e allora P2 e P3 vanno nel carico del basamento',
  },
  {
    id: 'locale.impianti', gruppo: 'locale', titolo: 'Luce, interruttori, prese, aerazione e canaline nel locale',
    valore: 'la pianta del locale disegna con la loro legenda: i punti luce sopra le zone di lavoro (almeno 200 lx al pavimento, illuminazione), '
      + 'l’interruttore della luce presso l’accesso, entro 1000 mm dalla porta, accanto all’interruttore generale; una presa 2P+PE per ogni area '
      + 'di lavoro (accanto all’argano e accanto al quadro); la griglia di aerazione; le canaline dal quadro all’argano e al vano, coperte dove si '
      + 'cammina',
    riferimento: 'UNI EN 81-20:2020, 5.2.1.4.2 (luce), 5.2.1.5.2 a)–b) (interruttore a ogni accesso, una presa per area di lavoro), 5.10.7.2 '
      + '(prese 2P+PE), 5.10.8.2 (interruttore entro 1 m dall’accesso), 5.2.1.3 (ventilazione) e 5.2.6.3.2.5 (canaline a pavimento coperte); '
      + 'le posizioni sono una proposta del software',
    fonte: letto(T20, 'pp. 25–26, 43, 119'),
    stato: 'scelta',
  },
];

/** Constants of this registry, for the test that every one has its entry. */
export const COSTANTI_LOCALE = {
  'locale.macchina': ['roomH', 'panelFreeDepth', 'panelFreeWidth', 'maintW', 'maintD', 'routeW', 'doorMinW', 'doorMinH', 'slabKerb', 'rotatingAbove'],
  'locale.pulegge': ['pulleyRoomH', 'pulleyDoorH', 'pulleyAbove'],
  'locale.esistente': ['existingRoomMin', 'existingRoomPad'],
  'locale.quadro.posto': ['panelSideGap', 'panelStep'],
  'locale.volantino': ['wheelReach'],
  'locale.esistente.altezza': ['existingPadding'],
  'locale.fori': ['holeGap', 'kerbW', 'holeBearing'],
  'locale.gancio': ['hookStep', 'hookMin', 'hookDrop'],
  'locale.attacchi': ['hitchPlate', 'hitchPlateT'],
  'locale.impianti': ['lightSwitchMax'],
} as const;
