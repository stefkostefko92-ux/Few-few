// Registry of the values the software fills in from the data entered once (src/lib/lift/derive.ts): the travel, the
// estimate of the car mass, the rope lengths and distances of the layout, the machine proposed. Each one is shown as
// automatic on the screen and can be overwritten. Italian texts: they go to the engineer.
import type { Stato } from '@/calc/norme';
import { letto } from '@/calc/norme-fonti';
import { SHEAVE_GRID } from '@/calc/sizing';

export const KL = {
  // estimate of the empty car mass when it is not entered: P = ratio · Q, rounded up to the step [kg]
  carMassRatio: 1.1,
  carMassStep: 10,
  // height of the sheave axis above the machine room floor, per metre of sheave diameter (machine on its bedframe)
  sheaveAxisPerD: 0.9,
  // the slab over the shaft when no room is designed over it [mm]
  slab: 250,
  // machine below (bottom.ts): the runs to the machine clear of the wall and of the counterweight's back; the head
  // pulleys' axes under the slab (Dp/2 and their frame) or over the pulley room's floor; the room under the pit [mm]
  bottomClear: 50,
  headFrame: 120,
  pulleyRoomAxis: 450,
  underSlab: 300,
  underRoomH: 2400,
  // the machine's room beside the shaft (schemes head and room): along the ropes' plane past the wall, across it each
  // way from the car's drop line, its height [mm]
  belowRoomLen: 2200,
  belowRoomHalf: 1300,
  belowRoomH: 2400,
  // either room grows to keep this much free past the machine's body where the body reaches out of it [mm]
  belowRoomClear: 500,
  // a maker's machine for the proposal: its ratio may give a speed this far from the ratio of the rated speed
  catalogRatioTol: 0.1,
  // direct pull: the falls in the plan and the sheave's pitch diameter may differ by this much (the rounding) [mm]
  calataTol: 1,
  // UNI 10411-1:2024, 6.1: increases a modification makes without the checks of the load — prospetto 1, of the rated
  // load and of the car side's static load T* (rated load up to 500 kg, over it), prospetto 2, of the counterweight's
  // static load as a share of the rated load (fractions); UNI 10411-11:2024, 6.1: any increase, and 6.2: its §5 (the
  // structures) only for a change over 10 %
  loadSplitQ: 500,
  loadIncQ: [0.1, 0.05],
  loadIncT: [0.15, 0.1],
  loadIncTcp: [0.25, 0.1],
  loadStruct11: 0.1,
  // DPR 162/1999, art. 19 c.1: lifts put in service by the earlier rules until 30 June 1999; from this day only with
  // the CE marking (a reading of the article: the day is to be confirmed on the logbook)
  ceFrom: '1999-07-01',
} as const;

export type CostanteImpianto = keyof typeof KL;

export interface VoceImpianto {
  id: string;
  titolo: string;
  valore: string;
  riferimento: string;
  fonte: string;
  stato: Stato;
  costanti?: readonly CostanteImpianto[];
  nota?: string;
}

const it = (x: number): string => String(x).replace('.', ',');
const pct = (x: number): string => it(Math.round(x * 1000) / 10);
const dataIt = (d: string): string => d.split('-').reverse().join('/');

export const VOCI_IMPIANTO: readonly VoceImpianto[] = [
  {
    id: 'impianto.corsa', titolo: 'Corsa', valore: 'somma delle altezze tra i piani, dal più basso al più alto',
    riferimento: '—', fonte: 'dati dei piani inseriti', stato: 'derivazione',
  },
  {
    id: 'impianto.portata', titolo: 'Portata e velocità',
    valore: 'la portata inserita, oppure quella della cabina più grande che entra nel vano (Tabella 6); la velocità è una sola per il vano e per la macchina',
    riferimento: 'UNI EN 81-20:2020, 5.4.2.1', fonte: 'progetto del vano', stato: 'derivazione',
    nota: 'In una modifica il confronto con i carichi documentati è nella voce impianto.variazione.carico.',
  },
  {
    id: 'impianto.variazione.carico', titolo: 'Modifica: variazione dei carichi rispetto allo stato documentato',
    valore: `con i carichi dell'ultimo verbale (collaudo o verifica straordinaria) — portata, cabina vuota completa P, contrappeso — e quelli del `
      + `progetto, T* = P + Q: con la UNI 10411-1 le verifiche del carico entrano nell'esito se la portata cresce oltre il ${pct(KL.loadIncQ[0])} % o `
      + `T* oltre il ${pct(KL.loadIncT[0])} % (portata fino a ${KL.loadSplitQ} kg; oltre: ${pct(KL.loadIncQ[1])} % e ${pct(KL.loadIncT[1])} %, prospetto 1) `
      + `o se il contrappeso cresce oltre il ${pct(KL.loadIncTcp[0])} % della portata (oltre ${KL.loadSplitQ} kg: ${pct(KL.loadIncTcp[1])} %, `
      + `prospetto 2); con la UNI 10411-11 a ogni aumento, e oltre il ${pct(KL.loadStruct11)} % anche le strutture (punto 5, escluse fino a lì dal 6.2); un carico che `
      + 'diminuisce le porta anch\'esso (ammortizzatori, paracadute progressivo). Con le due portate a cavallo di 500 kg vale la riga più severa, e la '
      + 'quota del contrappeso si misura sulla portata minore',
    riferimento: 'UNI 10411-1:2024, 6.1 (prospetti 1 e 2); UNI 10411-11:2024, 6.1 e 6.2',
    fonte: `${letto('UNI 10411-1:2024', 'p. 7')}; ${letto('UNI 10411-11:2024', 'pp. 7–8')}`, stato: 'confermato',
    costanti: ['loadSplitQ', 'loadIncQ', 'loadIncT', 'loadIncTcp', 'loadStruct11'],
    nota: 'T* della norma non comprende funi e cavi: P del calcolo comprende la quota del cavo flessibile, che si annulla nel confronto se resta la '
      + 'stessa. Quale portata decide la riga del prospetto non è detto nel testo (scelta prudente del software); con la -11 il 10 % si somma alle '
      + 'modifiche precedenti: lo stato documentato è quello dell\'impianto originale',
  },
  {
    id: 'impianto.marcatura', titolo: 'Modifica: UNI 10411-1 o UNI 10411-11',
    valore: `dalla marcatura CE dell'impianto — dichiarazione di conformità CE/UE nel libretto e marcatura nella cabina —: presente UNI 10411-11, `
      + `assente UNI 10411-1; non nota, dalla data di messa in servizio: fino al 30 giugno 1999 UNI 10411-1, dal ${dataIt(KL.ceFrom)} UNI 10411-11, da `
      + 'confermare con il libretto (la relazione lo riporta). La targa dell\'impianto non lo dice',
    riferimento: 'UNI 10411-11:2024, 1 e 3.3–3.4; UNI 10411-1:2024, 1; DPR 162/1999, art. 7 c.2, art. 16 c.1 e c.3, art. 19 c.1',
    fonte: `${letto('UNI 10411-1:2024', 'p. 5')}; ${letto('UNI 10411-11:2024', 'pp. 5–6')}; DPR 162/1999 (testo su Normattiva)`, stato: 'confermato',
    costanti: ['ceFrom'],
    nota: 'la data dal DPR 162/1999 è una lettura dell\'articolo 19 (messa in servizio secondo le regole precedenti fino al 30 giugno 1999)',
  },
  {
    id: 'impianto.collaudo', titolo: 'Normativa di collaudo e parti sostituite o modificate',
    valore: "impianto nuovo: UNI EN 81-20:2020 e UNI EN 81-50:2020, ogni verifica entra nell'esito; modifica di un impianto esistente: UNI 10411-1:2024 "
      + "(ascensore elettrico a frizione non conforme alla Direttiva Ascensori) o UNI 10411-11:2024 (a frizione, conforme alla 95/16/CE o alla 2014/33/UE), a scelta dell'utente: "
      + "entrano nell'esito le verifiche che riguardano le parti sostituite o modificate (comprese le variazioni di velocità, portata e corsa), le altre "
      + 'sono riportate come «esistente» con il valore calcolato. Quali parti riguarda ciascuna verifica è una lettura del software. Alla norma base si '
      + 'aggiungono le norme compatibili (matrice della ricerca, cap. 16 §5.2): sull\'impianto nuovo le EN 81 supplementari (21, 28, 58, 70, 71, 72, '
      + '73, 76, 77), sulla modifica la EN 81-20/50 intera, le EN 81-28, 58, 73 e il miglioramento (80, 82, 83), su entrambi DM 236/1989, antincendio '
      + '(DM 15/09/2005 o Codice V.3) e NTC 2018 (con le verifiche delle putrelle). Ogni norma ha il suo esito («non calcolata» se il software non ne '
      + 'calcola verifiche) e i suoi punti da verificare in sito nella relazione, con gli adempimenti del DPR 162/1999',
    riferimento: 'DPR 162/1999 e s.m.i.; UNI 10411-1:2024; UNI 10411-11:2024; UNI EN 81-20:2020; UNI EN 81-50:2020',
    fonte: `${letto('UNI 10411-1:2024', 'pp. 5, 13–14')}; ${letto('UNI 10411-11:2024', 'pp. 5, 12')}; schema ICIM delle verifiche (la verifica `
      + 'straordinaria si limita di norma alle modifiche); ricerca, capitoli 2.4 e 6.6', stato: 'scelta',
    nota: "lo scopo delle due UNI 10411 e i requisiti per la sostituzione del macchinario (punto 14) sono letti sul testo (voce sostituzione.adeguamenti); "
      + 'quali verifiche riguardano ciascuna parte e la matrice delle norme compatibili sono una lettura del software, da approvare dall\'ingegnere',
  },
  {
    id: 'impianto.rifacimento', titolo: "Rifacimento con l'arcata esistente",
    valore: "si sostituiscono tutte le parti tranne l'arcata, che resta: le sostituzioni sono modifiche costruttive dell'impianto esistente, che si "
      + "collauda secondo UNI 10411-1:2024 o UNI 10411-11:2024 e non come impianto nuovo; le verifiche che riguardano solo l'arcata (il tipo di "
      + 'paracadute, se la velocità non cambia) sono riportate come «esistente». La sostituzione completa dell\'ascensore, arcata compresa, si collauda '
      + 'come impianto nuovo (UNI EN 81-20:2020 e UNI EN 81-50:2020; negli edifici esistenti anche la UNI EN 81-21:2022, supplementare)',
    riferimento: 'DPR 162/1999 e s.m.i., art. 2 c.1 lett. cc), art. 12 c.4, art. 14 c.3; UNI 10411-1:2024; UNI 10411-11:2024; UNI EN 81-21:2022 (scopo)',
    fonte: "indicazione del cliente (5 ottobre 2026): prassi di lasciare l'arcata; ricerca, capitolo 16 §3.2 e §5.3", stato: 'prassi',
    nota: "il DPR 162/1999 elenca le modifiche costruttive senza dire quando l'insieme diventa una sostituzione completa; la UNI 10411-1/-11:2024 "
      + "(21.1) chiama modifica sostanziale il cambio insieme di quadro, macchina, almeno una porta di piano, cabina e arcata, con il risultato secondo "
      + "la UNI EN 81-20:2020: tenendo l'arcata il 21.1 non si applica. Una cabina nuova nell'arcata esistente segue la UNI EN 81-20 5.4.1–5.4.10 (UNI "
      + "10411-1:2024, 22; con porte di cabina a battente fino a +0,10 m² di superficie senza cambiare la portata, 22 f)). La qualificazione "
      + "dell'intervento la conferma il tecnico incaricato con il soggetto che esegue la verifica straordinaria",
  },
  {
    id: 'impianto.massa.cabina', titolo: 'Massa della cabina non inserita',
    valore: `P = ${it(KL.carMassRatio)}·Q arrotondata per eccesso a ${KL.carMassStep} kg: valore di partenza per far girare il calcolo`,
    riferimento: 'ricerca, capitoli 3 e 6 (origine della massa della cabina)', fonte: 'scelta del software, senza fonte', stato: 'stima',
    costanti: ['carMassRatio', 'carMassStep'],
    nota: 'va sostituita con la massa del libretto o con quella ricavata dalla prova di bilanciamento; la sensibilità ±10% ne mostra l\'effetto',
  },
  {
    id: 'impianto.L0', titolo: 'Fune oltre la corsa (L0)',
    valore: `dalla sommità dell'arcata con la cabina all'ultimo piano fino all'asse della puleggia: testata − sommità dell'arcata + soletta del locale + `
      + `asse della puleggia a ${it(KL.sheaveAxisPerD)}·D sul pavimento del locale; con la puleggia di rinvio, l'asse sul basamento o sul telaio che la `
      + 'porta (voce locale.rinvio); macchina in basso o senza locale: fino al soffitto del vano',
    riferimento: '—', fonte: 'dati verticali del vano; altezza dell\'asse scelta dal software', stato: 'scelta', costanti: ['sheaveAxisPerD'],
  },
  {
    id: 'impianto.dx', titolo: 'Distanza orizzontale della puleggia di rinvio (dx)',
    valore: 'calata tra la fune di cabina e quella del contrappeso in pianta − D/2 − Dp/2 (rinvio semplice: la fune scende dal lato esterno della '
      + 'puleggia di rinvio); se la fune deve rientrare, − D/2 + Dp/2 (rinvio inverso: dal lato interno); con taglia 2:1 la calata è minore di Dp, '
      + 'perché le funi salgono dal lato interno delle pulegge di cabina e di contrappeso. La puleggia di frizione sopra la cabina, il rinvio sopra il '
      + 'contrappeso; se nessuna delle due geometrie torna con l\'angolo di avvolgimento, la distanza va misurata sull\'impianto',
    riferimento: 'ricerca, capitolo 5.3', fonte: 'pianta del vano', stato: 'derivazione',
  },
  {
    id: 'impianto.calata', titolo: 'Tiro diretto (senza rinvio): calata uguale al diametro della puleggia',
    valore: 'senza rinvio le due calate scendono dai due lati della puleggia di frizione: la loro distanza in pianta (dall\'asse della cabina a '
      + 'quello del contrappeso, meno Dp con la taglia 2:1) è il diametro primitivo D. La macchina proposta ha la puleggia di diametro uguale '
      + `alla calata della pianta, se è nella gamma del calcolo (da ${SHEAVE_GRID[0]} a ${SHEAVE_GRID[SHEAVE_GRID.length - 1]} mm); una macchina `
      + 'inserita a mano, o nella sostituzione con il confronto la macchina esistente (i suoi attacchi restano), con un diametro che si scosta '
      + `dalla calata più di ${KL.calataTol} mm è segnalata e il progetto non si salva`,
    riferimento: 'ricerca, capitolo 5.3 (angolo di avvolgimento del tiro diretto)', fonte: 'geometria delle funi', stato: 'derivazione',
    costanti: ['calataTol'],
    nota: 'con un diametro diverso dalla calata le funi si inclinano verso gli attacchi: nella sostituzione con il confronto il calcolo ne tiene '
      + 'conto per la nuova puleggia; oltre pochi millimetri servono una puleggia di rinvio o il contrappeso spostato (quota «Calata» in pianta)',
  },
  {
    id: 'impianto.Hv', titolo: 'Macchina in basso: altezza fino alle pulegge in alto (Hv)',
    valore: 'dall\'asse dei rinvii in testata all\'asse della puleggia di frizione, secondo lo schema delle funi (impianto.basso.schema); '
      + 'la puleggia ha l\'asse a 0,9·D sul pavimento del suo locale',
    riferimento: 'ricerca, capitolo 5; funi con la macchina in basso, capitolo 2.6', fonte: 'dati verticali del vano', stato: 'derivazione',
  },
  {
    id: 'impianto.basso.schema', titolo: 'Macchina in basso: schema delle funi',
    valore: `tre schemi: rinvii appesi sotto la soletta del vano (assi a Dp/2 + ${KL.headFrame} mm sotto il soffitto), macchina nel locale al piano più `
      + `basso oltre la parete del contrappeso con la puleggia nel vano; locale pulegge sopra la soletta (assi a ${KL.pulleyRoomAxis} mm sul pavimento `
      + `del locale, soletta di ${KL.slab} mm se il locale non è progettato), macchina come sopra; macchina sotto il vano, in un locale alto `
      + `${KL.underRoomH} mm sotto la soletta della fossa di ${KL.underSlab} mm, rinvii sotto la soletta. Il locale della macchina accanto al vano è `
      + `lungo ${KL.belowRoomLen} mm oltre la parete, largo ${2 * KL.belowRoomHalf} mm e alto ${KL.belowRoomH} mm, con la porta sul fianco e il quadro `
      + `sulla parete di fondo; quello sotto il vano è grande quanto il vano. Tutti e due si allargano dove la macchina ne esce, fino a `
      + `${KL.belowRoomClear} mm oltre il suo ingombro. I due rami alla macchina salgono dietro il `
      + `contrappeso a ${KL.bottomClear} mm dalla parete e dal contrappeso, la puleggia con il piano parallelo alla parete; per lato un rinvio a 180° `
      + 'se il ramo dista dalla calata in pianta non più di Dp, altrimenti due rinvii a 90° con un tratto orizzontale. Il calcolo conta due rinvii '
      + 'per la macchina in basso: gli altri entrano come flessioni semplici aggiuntive (nps)',
    riferimento: 'ricerca, funi con la macchina in basso, capitoli 2–5; DPR 1497/1963 artt. 5–9, 33', fonte: 'geometria ricostruita dal software',
    stato: 'scelta', costanti: ['bottomClear', 'headFrame', 'pulleyRoomAxis', 'underSlab', 'underRoomH', 'belowRoomLen', 'belowRoomHalf', 'belowRoomH', 'belowRoomClear',
      'slab'],
    nota: 'lo schema reale va rilevato sull\'impianto; con la macchina sotto il vano lo spazio sotto la fossa è accessibile: paracadute del '
      + 'contrappeso — la EN 81-20 non ammette più il pilastro pieno fino al terreno — (UNI EN 81-20:2020, 5.2.5.4) e fondo della fossa per le reazioni degli ammortizzatori; '
      + 'in una modifica la UNI 10411-1:2024 (6.14) accetta al posto del paracadute un pilastro esistente fino al terreno, verificato per i nuovi carichi',
  },
  {
    id: 'impianto.catalogo', titolo: 'Macchina proposta dal catalogo di un costruttore',
    valore: `tra le opzioni del dimensionamento solo quelle che un argano del costruttore scelto accetta: puleggia nella gamma del modello, `
      + `carico statico sull'albero non oltre quello del catalogo, motore non oltre il più grande del catalogo, portata dichiarata; il rapporto è quello del catalogo più `
      + `vicino al rapporto ideale, se la velocità che dà non si scosta da quella nominale più del ${it(KL.catalogRatioTol * 100)} % (l'inverter adatta `
      + `la frequenza); il calcolo usa quel rapporto, il carico statico ammesso e la massa del catalogo; i disegni e il 3D mostrano l'argano SICOR `
      + `com'è (ingombri, piedi e fori, asse della puleggia, P ed E della scheda), sul telaio del software`,
    riferimento: 'ricerca, capitolo 12 (catalogo degli argani)',
    fonte: 'SICOR: schede tecniche 2025 e modelli CAD scaricati da sicoritaly.com il 2 ottobre 2026 (solo le quote); Sassi, Montanari, GEM, FAER: '
      + 'estratti delle pagine dei costruttori e dei rivenditori, 1° ottobre 2026',
    stato: 'scelta', costanti: ['catalogRatioTol'],
    nota: 'la tolleranza sul rapporto è una scelta del software: la velocità reale con l\'inverter deve restare entro il 5 % sopra la nominale '
      + '(UNI EN 81-20:2020, 5.9.2.4; buona pratica non oltre l\'8 % sotto); i dati di Sassi, Montanari, GEM e FAER vengono da estratti dei motori di ricerca, non dai documenti; tutti vanno confermati sulla scheda del costruttore prima dell\'ordine; '
      + 'per Montanari la massa è quella del riduttore (senza motore, puleggia e volano) e le pulegge sono quelle delle configurazioni tipiche; '
      + 'GEAT Elevators distribuisce argani Montanari, Sassi e FAER (P58F, P58S) e non ne costruisce',
  },
  {
    id: 'impianto.macchina', titolo: 'Macchina proposta',
    valore: 'la prima opzione del dimensionamento (capitolo 8): puleggia, funi, rapporto, gola, motore e freno che passano ogni verifica; con le '
      + 'ipotesi del gruppo (poli, giri, rendimenti, inerzie) inserite',
    riferimento: 'ricerca, capitolo 8', fonte: 'motore di calcolo', stato: 'scelta',
    nota: 'una griglia di calcolo, non un catalogo: il modello reale va scelto dal costruttore con questi valori. La puleggia cambia la geometria '
      + 'delle funi (fune oltre la corsa, distanza del rinvio): ogni puleggia della griglia è dimensionata con la propria, e con il rinvio dalla '
      + 'pianta solo le pulegge per cui la pianta sa posizionare il rinvio',
  },
];
