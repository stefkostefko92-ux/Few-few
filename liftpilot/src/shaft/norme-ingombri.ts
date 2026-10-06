// Registry of the typical encumbrances in the shaft: the default room of doors, rails and counterweight, the counterweight
// at the side, the cantilever sling, the niches, the Panev brackets of the counterweight's rails and of the landing doors,
// the governor and its tension pulley. Spread in VOCI_VANO (norme.ts) at its place; same form as norme.ts, Italian texts,
// clause numbers and values only.
import type { VoceVano } from './norme';

export const VOCI_INGOMBRI: readonly VoceVano[] = [
  {
    id: 'ingombri.tipici', gruppo: 'ingombri', titolo: 'Ingombri tipici nel vano (modificabili su ogni progetto)',
    valore: 'profondità della porta di piano 80 mm; gioco tra le soglie 30 mm; porta di cabina 80 mm; pareti della cabina 35 mm; '
      + 'guide e staffe della cabina 165 mm per lato; cabina–contrappeso 60 mm; spessore del contrappeso 140 mm; '
      + 'guide e staffe del contrappeso 80 mm; cabina–parete di fondo 60 mm; punta della guida–cabina 30 mm; '
      + 'contrappeso laterale–piede della guida di cabina 85 mm',
    riferimento: 'dati del costruttore di guide, porte e cabina', fonte: 'valori tipici: scelta del software', stato: 'scelta',
    verifiche: ['v_fit'],
    nota: 'pacchetto porta di catalogo (porta di cabina + gioco tra le soglie + porta di piano), da wittur.com: Hydra 210 mm a 2 ante telescopiche '
      + 'e 180 mm a 2 ante centrali, Hydra 3000 180 e 130, Augusta EVO 190 e 110, Sematic 2000 C-MOD 185 e 117, Fineline 115 e 85; Sematic 2000 B '
      + '255 e 165 (cabina 90 e 45, gioco 30, piano 135 e 90, da una copia della brochure). Con le porte scelte, i tre ingombri vanno portati alla '
      + 'somma del fornitore (oggi 80 + 30 + 80 = 190 mm)',
  },
  {
    id: 'ingombri.contrappeso.laterale', gruppo: 'ingombri', titolo: 'Contrappeso laterale',
    valore: 'tra la parete e la guida della cabina, centrato sull\'asse delle guide di cabina, con le sue guide alle estremità (pattini 20 mm) '
      + 'e la guida di cabina su una staffa a ponte; a 40 mm dalle zone delle porte; lunghezza in pianta da 400 a 900 mm (sotto 400 mm: '
      + '«Attenzione»); con il contrappeso sul fondo, al massimo la larghezza tra le guide della cabina',
    riferimento: '—', fonte: 'scelta del software', stato: 'scelta',
    costanti: ['cwMinLength', 'cwMaxLength', 'cwEndGap', 'cwShoe'], verifiche: ['v_cwlen'],
  },
  {
    id: 'ingombri.arcata.zaino', gruppo: 'ingombri', titolo: 'Arcata a zaino (due accessi adiacenti a 90°)',
    valore: 'entrambe le guide di cabina sulla parete opposta all\'accesso laterale, con le lame affacciate lungo la parete (il momento della cabina '
      + 'a sbalzo va sulle facce delle lame); piedi delle guide a 20 mm dentro la profondità della piattaforma; contrappeso tra le guide, '
      + 'contro la parete, con le sue guide alle estremità e i piedi a 70 mm da quelli delle guide di cabina (staffe); la cabina a 10 mm dalle '
      + 'bride che tengono i piedi delle guide sulle staffe (bride forgiate della misura della guida, con la piastra oltre il piede)',
    riferimento: '—', fonte: 'scelta del software (principio: cataloghi di arcate a zaino); disposizione da confermare con il fornitore dell\'arcata', stato: 'scelta',
    costanti: ['cantRailEnd', 'cantCwGap', 'cantClipGap'],
  },
  {
    id: 'ingombri.nicchie', gruppo: 'ingombri', titolo: 'Nicchie nelle pareti del vano',
    valore: 'contrappeso in nicchia: il contrappeso con le sue guide sta nella nicchia della parete su cui corre, con almeno 20 mm tra le guide '
      + 'e i fianchi della nicchia (con le staffe Panev, lo spazio della piastra del supporto dietro il piede di ogni guida); la distanza dalla '
      + 'parete si misura dal fondo della nicchia e la cabina guadagna la sua profondità, senza '
      + 'scendere sotto gli ingombri delle guide; luce del vano in nicchia: una nicchia alta 400 mm per lampada, le lampade 1500 mm sopra ogni '
      + 'piano e l\'ultima a 80 mm sotto il solaio; canalina in nicchia: dal fondo della fossa al solaio; ogni nicchia dentro la sua parete, fuori '
      + 'dai telai delle porte di piano e dalle altre nicchie, con almeno 50 mm di muro dietro; altrimenti «Non conforme»',
    riferimento: '—', fonte: 'scelta del software; la resistenza della parete con la nicchia va verificata dal progettista', stato: 'scelta',
    costanti: ['nicheBackMin', 'nicheGap', 'nicheLightH', 'lampOverFloor', 'lampUnderSlab'], verifiche: ['v_niche'],
  },
  {
    id: 'ingombri.staffe.contrappeso', gruppo: 'ingombri', titolo: 'Staffe delle guide del contrappeso (catalogo Panev)',
    valore: 'per default il supporto Panev SU o SD con la guida SG, la guida serrata sulla flangia della SG da due bride N1: il supporto più corto il '
      + 'cui campo stampato prende la distanza della guida dalla parete (o dal fondo della nicchia) e la cui piastra sta sulla parete: SU, SD 150 '
      + 'e SD 220 lunghi 160 mm da 45 a 155 mm (SD 220 da 50), lunghi 180 mm da 45 a 195 mm, lunghi 200 mm da 45 a 215 mm; quando nessuno sta, '
      + 'vicino a un angolo, il supporto scorrevole SC sulla parete dietro il piede della guida con la SG lungo la parete: la flangia della SG da 2 mm '
      + 'oltre il bordo dell\'SC fino a 70, 88, 130 e 140 mm dalla parete per SC 50, 60, 80 e 90, l\'asse della guida entro il campo stampato da '
      + 'un\'estremità dell\'SC (lunghi 200 mm: 210, 213, 215 e 215 mm; lunghi 220 mm: 235, 235, 255 e 235 mm), fuori dai telai delle porte e dalle '
      + 'nicchie. Il progettista può scegliere l\'articolo a mano (se non prende la guida: «Non conforme») o una soluzione su disegno esecutivo, '
      + 'SC 50 170 + SG 225 50 a misura o SN 60 65 + SN 65 200 + BRACCIO 160 190 all\'angolo del vano: «Da verificare» sul disegno; nessuno '
      + 'adatto: «Non conforme» (si possono scegliere staffe generiche, da dimensionare a parte)',
    riferimento: 'catalogo staffe Panev 2026, pp. 20-62', fonte: 'catalogo del costruttore (panev/docs/catalogo-staffe-panev-2026.pdf); le corse '
      + 'dell\'SC lontano dalla parete lette sui disegni di montaggio (pp. 41-55)', stato: 'confermato',
    verifiche: ['v_staffa'],
  },
  {
    id: 'ingombri.staffe.porte', gruppo: 'ingombri', titolo: 'Staffe delle porte di piano (catalogo Panev)',
    valore: 'sotto ogni soglia di piano la coppia A + B della stessa sezione (65, 45 o 37 mm: le serie non sono intercambiabili): per default '
      + 'A 65 170 7 + B 65 320 (5 mm, regolazione ±8°), oppure quella scelta dal progettista; la piastra A tagliata alla profondità della soglia, '
      + '4 mm prima del suo bordo (se la piastra è più corta della soglia: da verificare); una coppia ogni 400 mm della luce, almeno tre, le estreme '
      + 'a 10 mm dai bordi della luce. Sopra ogni porta di piano la stessa coppia capovolta: B sulla parete sopra il vano con lo snodo in basso, la '
      + 'sospensione della porta appesa sotto la piattaforma di A con bulloni nei suoi fori, A tagliata come sotto la soglia; una coppia ogni 400 mm '
      + 'lungo la sospensione (la corsa delle ante e 30 mm per parte), almeno tre, le estreme a 10 mm dalle sue estremità; se le coppie della soglia '
      + 'del piano sopra arrivano alla stessa altezza, quella che cadrebbe su una di esse si sposta accanto (la faccia di B e 10 mm), dentro la '
      + 'sospensione. Con il telaio proprio della porta le coppie tengono il telaio, a cui sono fissate soglia e sospensione (porte.telaio). '
      + 'B vuole il muro dalla sommità della sospensione (230 mm sopra la luce) in su: se il vano nel muro (telaio o marmi) sale più '
      + 'in alto, o la coppia arriva alla soglia del piano sopra, a quel piano le coppie sopra la porta non sono poste né contate, e la verifica lo '
      + 'segnala come «Attenzione» (il fissaggio della sospensione va definito con il costruttore della porta)',
    riferimento: 'catalogo staffe Panev 2026, pp. 14-18 (coppie), p. 05 (taglio della piastra) e p. 04 (soglia o elemento portante della porta di piano)',
    fonte: 'catalogo del costruttore (panev/docs/catalogo-staffe-panev-2026.pdf); il passo, il numero minimo, il montaggio capovolto sopra la porta e '
      + 'lo spostamento sono scelta del software (il montaggio sopra la porta va confermato con il costruttore della porta)', stato: 'scelta',
    verifiche: ['h_staffe'],
  },
  {
    id: 'ingombri.limitatore', gruppo: 'ingombri', titolo: 'Limitatore di velocità e tenditore (pianta, locale macchina, 3D)',
    valore: 'per velocità il più piccolo PFB che la regge: LK200 (Ø 200, fune 6) fino a 1,48 m/s, LK250 fino a 1,74, LK300 fino a 2,93, R12BF fino a '
      + '4,00; oppure il modello scelto se regge la velocità: PFB (LX, LK, R1, R3LR, R5, R6, R10BF), Bode (GB 7 fino a 2,98 m/s, GB 8 fino a 1,29), '
      + 'Dynatech (VEGA 200 fino a 2,40), Wittur (OL20 fino a 1,75, OL35 fino a 3,00, EOS fino a 2,50, OL100 fino a 10,00) o Montanari (RQ-A 200, 250 e '
      + '300, RC 200 e 300, NOR fino a 1,50 m/s, RG 200 fino a 0,30). Con le quote dei disegni dei costruttori (altezza totale, tra parentesi l\'asse '
      + 'dalla base): LK200, LK250, LK300 e LK315 415 (165) su base 220 × 165 (LK315 220 × 130); LX120 178 (70,5), LK120 270 (71), LX150 274 (86), '
      + 'LX180 322 (107), LX200 349 (110); R1 344 (190,5) su base 285 × 80; R3LR 348 (157); R5 261 (120); R6 335 (168); R10BF 488 (303) su base '
      + '460 × 196; R12BF 524 (337) su base 520 × 116; Bode GB 7 360 (205) e GB 8 315 (205); Dynatech VEGA 200 332 (199,5); Wittur e Montanari nelle '
      + 'proporzioni del software (Ø 200: alto 370, asse a 240). Tenditore in fossa sulla guida di cabina: a leva con 22 kg (come PFB R4K) o '
      + 'verticale con 44 kg (come PFB R4R)',
    riferimento: 'dati del fornitore del limitatore; dalla norma solo lo scatto ≥ 115 % della velocità nominale (UNI EN 81-20:2020, 5.6.2.2.1.1 a))',
    stato: 'stima',
    fonte: 'manuali d\'uso PFB con i disegni quotati (download.pfb.it), brochure Bode e Wittur, manuale Dynatech VEGA e disegni Bode in copia '
      + 'presso un rivenditore (elevatorequipment.co.uk), letti il 2 ottobre 2026; basi delle LK da un listino di rivenditore; Montanari da estratti '
      + 'di ricerca del 1° ottobre 2026 (research/argano-geared/18-porte-limitatori-tenditori-tutti.md)',
    nota: 'il disegno unico delle LK200–LK315 dà due altezze non spiegate (230 e 415 mm; un rivenditore scrive 370): è presa la maggiore. Per Bode '
      + 'la velocità nominale massima è nostra: la velocità di scatto massima diviso 1,15 (scatto ≥ 115 % della nominale), del GB 8 con 1,49 m/s del '
      + 'disegno invece dei 2,04 della brochure. Per le RQ-A e le RC Montanari 0,15–3,0 e 1,60–4,2 m/s sono i campi della famiglia: il limite di ogni '
      + 'taglia va letto sul manuale. Delle basi pubblicate non sempre è detto quale lato stia nel piano della puleggia (il lato lungo è disegnato in '
      + 'quel piano, come nel LK200). Tenditore a leva: lungo 700 mm (quota «A» del PFB R4KE per LK200 in un listino di rivenditore, senza '
      + 'definizione), puleggia a 255 mm dalla cerniera e blocco di 150 × 185 mm: scelte del software; le masse di 22 e 44 kg sono quelle delle '
      + 'tabelle PFB (tenditori R4K e R4R per LK200, confermate dalla brochure)',
  },
];
