// Normative profile and registry. Every number the engine takes from a standard, an estimate or a design choice
// lives in K and is described by an entry of VOCI: value, clause to check, source and status. The verification
// checklist for the engineer (scripts/lista-verifica.ts) and the calculation report are generated from here, so a
// correction made on the purchased text changes the engine, the checklist and the report together.
// Texts are in Italian: they go to the engineer and into the report.

import { letto } from './norme-fonti';
import { VOCI_FRENO } from './norme-freno';
import { VOCI_FUNI } from './norme-funi';
import { VOCI_GOLE } from './norme-gole';
import type { CheckId } from './types';

/** Numeric constants of the engine. Values are the ones of the prototype (research, chapter 4). */
export const K = {
  g: 9.81,
  // traction (UNI EN 81-50:2020, 5.11)
  muLoading: 0.1,
  muBrakingBase: 0.1,
  muBrakingSpeed: 10,
  muStalled: 0.2,
  loadTestFactor: 1.25,
  aeMin: 0.5,
  aeReducedStroke: 0.8,
  tractionWarn: 0.97,
  // grooves (UNI EN 81-50:2020, 5.11.2.3.1)
  betaMax: 105,
  betaRecommended: 90,
  gammaMin: 35,
  gammaMinU: 25,
  neqU: [[75, 2.5], [80, 3.0], [85, 3.8], [90, 5.0], [95, 6.7], [100, 10.0], [105, 15.2]] as const,
  neqV: [[35, 18.5], [36, 16], [38, 12], [40, 10], [42, 8], [45, 6.5], [50, 5]] as const,
  // ropes (UNI EN 81-20:2020, 5.5; UNI EN 81-50:2020, 5.12)
  ddMin: 40,
  ropesMin: 2,
  ropeDiameterMin: 8,
  sfMin3: 12,
  sfMin2: 16,
  sfC0: 2.6834,
  sfC1: 695.85e6,
  sfE1: 8.567,
  sfC2: 77.09,
  sfE2: -2.894,
  kpExponent: 4,
  reverseBendWeight: 4,
  // brake (UNI EN 81-20:2020, 5.9.2.2)
  brakeSetsMin: 2,
  brakeDecelMax: 9.81,
  // rescue (UNI EN 81-20:2020, 5.9.2.3.3; the mechanical means of 5.9.2.3.1 a) only up to 150 N: not checked), drive, margins
  rescueForceMax: 400,
  rescueForceMech: 150,
  accelTorqueRatioMax: 2,
  nearLimit: 0.98,
  // sensitivity (research 8.9)
  sensP: 0.1,
  sensK: 0.05,
} as const;

export type Costante = keyof typeof K;

/**
 * confermato: read on the text of the standard the client supplied, or two independent sources, or reproduced on a
 *   published case (✅ in the research);
 * da_verificare: secondary source, or a point the texts read do not settle: still to be checked (⚠);
 * stima: estimate used when a datum is missing, always shown as such;
 * derivazione: elementary mechanics, independent of the standard;
 * scelta: choice of the software (not a requirement), to be approved by the engineer;
 * prassi: site practice reported by Panev Ascensori.
 */
export type Stato = 'confermato' | 'da_verificare' | 'stima' | 'derivazione' | 'scelta' | 'prassi';

export type Gruppo = 'trazione' | 'gole' | 'funi' | 'freno' | 'azionamento' | 'soccorso' | 'albero' | 'sostituzione' | 'modello';

export interface Voce {
  id: string;
  gruppo: Gruppo;
  titolo: string;
  /** value or formula used by the software */
  valore: string;
  /** where to check it in the documents of the profile */
  riferimento: string;
  /** where the value comes from today */
  fonte: string;
  stato: Stato;
  costanti?: readonly Costante[];
  verifiche?: readonly CheckId[];
  nota?: string;
}

export const PROFILO = {
  id: 'IT-2026.1',
  titolo: "Italia — sostituzione dell'argano su impianto esistente",
  documenti: [
    { sigla: 'Direttiva 2014/33/UE', ambito: 'requisiti essenziali di sicurezza (Allegato I)' },
    { sigla: 'DPR 162/1999 e s.m.i. (DPR 8/2015, DPR 23/2017)', ambito: 'sostituzione del macchinario come modifica costruttiva; verifica straordinaria (art. 14)' },
    { sigla: 'UNI EN 81-20:2020', ambito: 'funi (5.5), freno (5.9.2.2), distanze nel vano (5.2.5) e superficie della cabina (5.4.2)' },
    { sigla: 'UNI EN 81-50:2020', ambito: 'aderenza (5.11) e coefficiente di sicurezza delle funi (5.12)' },
    { sigla: 'UNI 10411-1:2024', ambito: 'modifiche e sostituzioni su ascensori elettrici esistenti non conformi alla Direttiva Ascensori: collaudo delle parti modificate' },
    { sigla: 'UNI 10411-11:2024', ambito: 'modifiche e sostituzioni su ascensori elettrici esistenti conformi alla 95/16/CE o alla 2014/33/UE: collaudo delle parti modificate' },
    { sigla: 'DM 236/1989', ambito: 'accessibilità: cabina e porta minime (8.1.12), per il progetto del vano' },
  ],
} as const;

const T20 = 'UNI EN 81-20:2020', T50 = 'UNI EN 81-50:2020', U1 = 'UNI 10411-1:2024', U11 = 'UNI 10411-11:2024';

export const VOCI: readonly Voce[] = [
  // ---------- traction ----------
  {
    id: 'trazione.condizioni', gruppo: 'trazione', titolo: 'Aderenza: tre condizioni di Euler-Eytelwein',
    valore: 'T1/T2 ≤ e^(f·α) al caricamento e in frenatura di emergenza; T1/T2 ≥ e^(f·α) con contrappeso o cabina bloccati (cabina '
      + 'vuota nella posizione più alta e in quella più bassa)',
    riferimento: 'UNI EN 81-50:2020, 5.11.2.1 e 5.11.2.2.3', fonte: letto(T50, 'pp. 39–40'), stato: 'confermato',
    verifiche: ['tr_load', 'tr_dn', 'tr_up', 'tr_stall'],
  },
  {
    id: 'trazione.mu.caricamento', gruppo: 'trazione', titolo: 'Coefficiente di attrito, caricamento', valore: 'μ = 0,1',
    riferimento: 'UNI EN 81-50:2020, 5.11.2.3.2', fonte: letto(T50, 'p. 42'), stato: 'confermato',
    costanti: ['muLoading'], verifiche: ['tr_load'],
  },
  {
    id: 'trazione.mu.frenatura', gruppo: 'trazione', titolo: 'Coefficiente di attrito, frenatura di emergenza', valore: 'μ = 0,1 / (1 + v_f/10), v_f = velocità delle funi',
    riferimento: 'UNI EN 81-50:2020, 5.11.2.3.2', fonte: `${letto(T50, 'p. 42')} (v_f: velocità delle funi alla velocità nominale della cabina)`,
    stato: 'confermato',
    costanti: ['muBrakingBase', 'muBrakingSpeed'], verifiche: ['tr_dn', 'tr_up', 'tr_real'],
  },
  {
    id: 'trazione.mu.bloccata', gruppo: 'trazione', titolo: 'Coefficiente di attrito, contrappeso o cabina bloccati', valore: 'μ = 0,2',
    riferimento: 'UNI EN 81-50:2020, 5.11.2.3.2', fonte: letto(T50, 'p. 42'), stato: 'confermato',
    costanti: ['muStalled'], verifiche: ['tr_stall'],
  },
  {
    id: 'trazione.carico.caricamento', gruppo: 'trazione', titolo: 'Carico della verifica di caricamento', valore: '1,25·Q, cabina in basso e in alto',
    riferimento: 'UNI EN 81-50:2020, 5.11.2.2.1 e 5.11.3', fonte: `${letto(T50, 'pp. 40 e 44')} (al caricamento e con la cabina bloccata a = 0)`,
    stato: 'confermato',
    costanti: ['loadTestFactor'], verifiche: ['tr_load'],
    nota: 'La norma aggiunge il peso dei dispositivi di movimentazione, dove usati negli ascensori per merci e persone: non modellato. Le due '
      + 'posizioni della cabina sono quelle più sfavorevoli che il software verifica.',
  },
  {
    id: 'trazione.decelerazione.minima', gruppo: 'trazione', titolo: 'Decelerazione della verifica di frenatura', valore: 'almeno 0,5 m/s²',
    riferimento: 'UNI EN 81-50:2020, 5.11.2.2.2', fonte: letto(T50, 'p. 40'), stato: 'confermato',
    costanti: ['aeMin'], verifiche: ['tr_dn', 'tr_up'],
  },
  {
    id: 'trazione.decelerazione.corsa.ridotta', gruppo: 'trazione', titolo: 'Decelerazione della verifica di frenatura con ammortizzatori a corsa ridotta',
    valore: '0,8 m/s²', riferimento: 'UNI EN 81-1:2008, M.2.1.2; UNI EN 81-50:2020, 5.11.2.2.2',
    fonte: `${letto('UNI EN 81-1:2008', 'p. 167')}; ${letto(T50, 'p. 40')}`, stato: 'scelta',
    costanti: ['aeReducedStroke'], verifiche: ['tr_dn', 'tr_up'],
    nota: 'La UNI EN 81-50:2020 non dà un numero: con ammortizzatori a corsa ridotta la decelerazione è la minima che porta cabina e contrappeso '
      + 'alla velocità di progetto degli ammortizzatori, mai sotto 0,5 m/s². Il software tiene 0,8 m/s², il valore della UNI EN 81-1: '
      + 'l\'ingegnere lo sostituisce con quello calcolato dai dati degli ammortizzatori.',
  },
  {
    id: 'trazione.otto.casi', gruppo: 'trazione', titolo: 'Combinazioni della frenatura di emergenza', valore: 'cabina vuota e con portata × in discesa e in salita × in basso e in alto; conta la peggiore per verso',
    riferimento: 'UNI EN 81-50:2020, 5.11.2.2.2', fonte: 'derivazione (copertura completa dei casi)', stato: 'scelta',
    verifiche: ['tr_dn', 'tr_up'],
  },
  {
    id: 'trazione.decelerazione.reale', gruppo: 'trazione', titolo: 'Aderenza alla decelerazione reale del freno',
    valore: 'Seconda verifica con la decelerazione data dal freno (tutti i gruppi, mai sotto il minimo); oggi solo avviso',
    riferimento: 'UNI EN 81-50:2020, 5.11.2.2.2', fonte: letto(T50, 'p. 40'), stato: 'scelta',
    verifiche: ['tr_real'],
    nota: 'La norma vuole ogni massa in moto con la sua accelerazione e una decelerazione di calcolo mai sotto 0,5 m/s²; non dice con quanti '
      + 'gruppi del freno. Se contarla come esito lo decide l\'ingegnere: nell\'esempio B del capitolo 7 l\'utilizzo passa da 1,005 a 4,17.',
  },
  {
    id: 'trazione.margine', gruppo: 'trazione', titolo: 'Soglia di attenzione sull\'utilizzo dell\'aderenza', valore: 'utilizzo > 0,97 → «Attenzione»',
    riferimento: '—', fonte: 'scelta del software (margine per incertezza su masse e bilanciamento)', stato: 'scelta',
    costanti: ['tractionWarn'], verifiche: ['tr_load', 'tr_dn', 'tr_up', 'tr_real'],
  },
  // ---------- grooves ----------
  ...VOCI_GOLE,
  // ---------- ropes ----------
  ...VOCI_FUNI,
  // ---------- brake ----------
  ...VOCI_FRENO,
  // ---------- drive ----------
  {
    id: 'azionamento.rendimento.inverso', gruppo: 'azionamento', titolo: 'Rendimento inverso del riduttore se non dato', valore: 'η_i ≈ 2 − 1/η_d (0 = irreversibile)',
    riferimento: '—', fonte: 'approssimazione della teoria della vite senza fine', stato: 'stima',
    verifiche: ['tr_real', 'b_amax'],
    nota: 'Da sostituire con il valore del costruttore: la decelerazione reale del freno ne dipende molto.',
  },
  {
    id: 'azionamento.accelerazione', gruppo: 'azionamento', titolo: 'Coppia di accelerazione', valore: '≤ 2 volte la coppia nominale (oltre: «Attenzione»; nella proposta: criterio di scelta del motore)',
    riferimento: '—', fonte: 'scelta del software; il limite vero è quello di motore e inverter', stato: 'scelta',
    costanti: ['accelTorqueRatioMax'], verifiche: ['d_ratio'],
  },
  {
    id: 'azionamento.margine', gruppo: 'azionamento', titolo: 'Soglia di attenzione sui limiti del costruttore', valore: 'oltre il 98% del limite di catalogo (albero, coppia in uscita) → «Attenzione»',
    riferimento: '—', fonte: 'scelta del software', stato: 'scelta',
    costanti: ['nearLimit'], verifiche: ['s_shaft', 'd_mp'],
  },
  {
    id: 'azionamento.potenza', gruppo: 'azionamento', titolo: 'Potenza statica del motore', valore: 'P_st = ΔF·v_f / (η_d·η_vano) ≤ P_n, con ΔF il maggiore tra cabina carica in salita dal basso e vuota in discesa dall\'alto',
    riferimento: '—', fonte: 'derivazione', stato: 'derivazione',
    verifiche: ['d_pst'],
  },
  {
    id: 'azionamento.coppia.uscita', gruppo: 'azionamento', titolo: 'Coppia massima in uscita dal riduttore', valore: 'M_p = ΔF·D/2 + J·i·α_m, confrontata con il valore di catalogo se inserito',
    riferimento: 'dato del costruttore', fonte: 'derivazione', stato: 'derivazione',
    verifiche: ['d_mp'],
  },
  {
    id: 'azionamento.tolleranza.velocita', gruppo: 'azionamento', titolo: 'Tolleranza tra velocità reale e nominale',
    valore: 'con metà portata a metà corsa, in salita e in discesa, non oltre il 5 % sopra la nominale (buona pratica: non oltre l\'8 % sotto); '
      + 'non verificata: il software mostra la velocità reale e la frequenza per la nominale',
    riferimento: 'UNI EN 81-20:2020, 5.9.2.4; UNI 10411-1:2024, 15.1', fonte: `${letto(T20, 'p. 102')}; ${letto(U1, 'p. 14')}`, stato: 'confermato',
    nota: 'Con la UNI 10411-1:2024 (15.1) una velocità oltre il 5 % sopra quella originale è un aumento della velocità nominale (punti 15.2–15.15).',
  },
  // ---------- rescue ----------
  {
    id: 'soccorso.forza', gruppo: 'soccorso', titolo: 'Forza massima al volantino',
    valore: '≤ 400 N per far salire la cabina con la portata, altrimenti manovra elettrica di emergenza; il mezzo meccanico è ammesso se per portare '
      + 'la cabina a una fermata bastano 150 N',
    riferimento: 'UNI EN 81-20:2020, 5.9.2.3.3 (400 N) e 5.9.2.3.1 a) (150 N)', fonte: letto(T20, 'pp. 101–102'), stato: 'confermato',
    costanti: ['rescueForceMax', 'rescueForceMech'], verifiche: ['s_force'],
    nota: 'Il software verifica i 400 N; i 150 N del mezzo meccanico (5.9.2.3.1 a)) non sono verificati: sono nella lista da verificare.',
  },
  // ---------- shaft ----------
  {
    id: 'albero.carico', gruppo: 'albero', titolo: 'Carico sull\'albero della puleggia', valore: 'risultante dei tiri con 1,25·Q al piano più basso, confrontata con il limite del costruttore',
    riferimento: 'dato del costruttore; 1,25·Q come nella verifica di caricamento (UNI EN 81-50:2020, 5.11.2.2.1)',
    fonte: 'derivazione; la definizione del carico va confermata con il costruttore', stato: 'derivazione',
    costanti: ['loadTestFactor'], verifiche: ['s_shaft'],
  },
  {
    id: 'albero.sollevamento', gruppo: 'albero', titolo: 'Sollevamento netto sugli ancoraggi (macchina in basso)', valore: 'carico verso l\'alto meno la massa della macchina: da verificare con il progettista strutturale',
    riferimento: '—', fonte: 'derivazione', stato: 'derivazione',
    verifiche: ['s_uplift'],
  },
  // ---------- replacement (Italy) ----------
  {
    id: 'sostituzione.modifica', gruppo: 'sostituzione', titolo: 'La sostituzione del macchinario è una modifica costruttiva',
    valore: 'modifica costruttiva (art. 2 c.1 lett. cc), n. 5): adeguamento della parte sostituita e delle altre parti interessate, comunicazione al Comune e '
      + 'al soggetto delle verifiche periodiche, verifica straordinaria prima del servizio',
    riferimento: 'DPR 162/1999 e s.m.i., art. 2 c.1 lett. cc), art. 12 c.4–5, art. 14 c.3', fonte: 'DPR 162/1999 consolidato (Normattiva), letto il 2026-10-02 (ricerca, cap. 16), §3.2', stato: 'confermato',
  },
  {
    id: 'sostituzione.adeguamenti', gruppo: 'sostituzione', titolo: 'Adeguamenti richiesti per la sostituzione del macchinario',
    valore: 'UNI 10411-1:2024, punto 14: macchina secondo la UNI EN 81-20 (5.9.1 e 5.9.2, freno in due gruppi) o la UNI EN 81-1:2010, con '
      + 'aderenza e coefficiente di sicurezza delle funi (14.1); D/d ≥ 40 (14.3); temporizzatore della UNI EN 81-20 (5.9.2.7), arresto prima '
      + 'che la cabina in salita tocchi la velocità di intervento del limitatore, ACOP e UCM esistenti che funzionano ancora, arresto vicino alla '
      + 'macchina, pulegge secondo la 5.5.7, interruzione se il freno non si apre (14.4 a)–g)). UNI 10411-11:2024, punto 14: macchina come '
      + 'l\'originale, altrimenti UNI EN 81-20 5.9.1–5.9.2 con le verifiche della norma di origine o della UNI EN 81-20 e la valutazione 4.3 '
      + '(14.1); UCM esistenti che funzionano ancora e interruzione se il freno non si apre (14.3)',
    riferimento: 'UNI 10411-1:2024, 14.1–14.4; UNI 10411-11:2024, 14.1–14.3', fonte: `${letto(U1, 'pp. 13–14')}; ${letto(U11, 'p. 12')}`,
    stato: 'confermato',
    verifiche: ['b_sets'],
  },
  {
    id: 'sostituzione.funi', gruppo: 'sostituzione', titolo: 'Funi nella sostituzione', valore: 'di norma funi nuove con lo stesso numero e diametro di quelle montate; la proposta le tiene fisse',
    riferimento: '—', fonte: 'indicazione di Panev Ascensori (29 settembre 2026)', stato: 'prassi',
  },
  // ---------- model ----------
  {
    id: 'modello.g', gruppo: 'modello', titolo: 'Accelerazione di gravità', valore: 'g = 9,81 m/s² (anche come limite di 1 g)',
    riferimento: 'UNI EN 81-20:2020, 5.2.1.8.5 (g_n = 9,81 m/s²)', fonte: letto(T20, 'p. 27'), stato: 'confermato',
    costanti: ['g', 'brakeDecelMax'],
  },
  {
    id: 'modello.percorso', gruppo: 'modello', titolo: 'Tiri con il metodo del percorso della fune', valore: 'masse e funi di ogni tratto, inerzia delle pulegge di rinvio; attrito di guide e pulegge trascurato in aderenza',
    riferimento: 'UNI EN 81-50:2020, 5.11.3', fonte: letto(T50, 'pp. 43–44'), stato: 'da_verificare',
    verifiche: ['tr_load', 'tr_dn', 'tr_up', 'tr_real', 'tr_stall'],
    nota: 'Confermati sul testo: le masse per lato, il fattore (r² + 2)/3 delle funi, il termine delle pulegge di rinvio e l\'attrito trascurato. '
      + 'Da verificare: in taglia 2:1 le pulegge di cabina e di contrappeso (termine III della norma) non sono contate; con la macchina in basso '
      + 'il tratto tra macchina e pulegge in testata usa r·a, dove il testo stampa a (la forma stampata coincide con quella fisica solo a 1:1).',
  },
  {
    id: 'modello.compensazione', gruppo: 'modello', titolo: 'Compensazione e cavo flessibile', valore: 'non modellati a parte: la loro massa sul lato cabina entra in P',
    riferimento: 'UNI EN 81-50:2020, 5.11', fonte: 'limite del modello attuale', stato: 'scelta',
  },
  {
    id: 'modello.sensibilita', gruppo: 'modello', titolo: 'Analisi di sensibilità', valore: 'P ±10%; k ±0,05 se il carico di equilibrio non è misurato',
    riferimento: '—', fonte: 'scelta del software (incertezza tipica del rilievo)', stato: 'scelta',
    costanti: ['sensP', 'sensK'],
  },
];
