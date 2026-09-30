// Normative profile and registry. Every number the engine takes from a standard, an estimate or a design choice
// lives in K and is described by an entry of VOCI: value, clause to check, source and status. The verification
// checklist for the engineer (scripts/lista-verifica.ts) and the calculation report are generated from here, so a
// correction made on the purchased text changes the engine, the checklist and the report together.
// Texts are in Italian: they go to the engineer and into the report.

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
  // grooves
  betaMax: 106,
  betaRecommended: 90,
  gammaMin: 35,
  neqU: [[75, 2.5], [80, 3.0], [85, 3.8], [90, 5.0], [95, 6.7], [100, 10.0], [105, 15.2]] as const,
  neqV: [[35, 18.5], [36, 15.2], [38, 10.5], [40, 7.1], [42, 5.6], [45, 4.0]] as const,
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
  // rescue, drive, margins
  rescueForceMax: 400,
  accelTorqueRatioMax: 2,
  nearLimit: 0.98,
  // sensitivity (research 8.9)
  sensP: 0.1,
  sensK: 0.05,
} as const;

export type Costante = keyof typeof K;

/**
 * confermato: two independent sources or reproduced on a published case (✅ in the research);
 * da_verificare: secondary source, to be checked on the purchased text (⚠);
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
    { sigla: 'UNI 10411-1:2024', ambito: 'modifiche e sostituzioni su ascensori elettrici esistenti non conformi alle direttive' },
    { sigla: 'DM 236/1989', ambito: 'accessibilità: cabina e porta minime (8.1.12), per il progetto del vano' },
  ],
} as const;

export const VOCI: readonly Voce[] = [
  // ---------- traction ----------
  {
    id: 'trazione.condizioni', gruppo: 'trazione', titolo: 'Aderenza: tre condizioni di Euler-Eytelwein',
    valore: 'T1/T2 ≤ e^(f·α) al caricamento e in frenatura di emergenza; T1/T2 ≥ e^(f·α) con cabina bloccata',
    riferimento: 'UNI EN 81-50:2020, 5.11', fonte: 'Mellor; Elevator World; Scientific Reports 2025', stato: 'confermato',
    verifiche: ['tr_load', 'tr_dn', 'tr_up', 'tr_stall'],
  },
  {
    id: 'trazione.mu.caricamento', gruppo: 'trazione', titolo: 'Coefficiente di attrito, caricamento', valore: 'μ = 0,1',
    riferimento: 'UNI EN 81-50:2020, 5.11.2 (sottoclausola da individuare)', fonte: 'fonti secondarie concordi', stato: 'da_verificare',
    costanti: ['muLoading'], verifiche: ['tr_load'],
  },
  {
    id: 'trazione.mu.frenatura', gruppo: 'trazione', titolo: 'Coefficiente di attrito, frenatura di emergenza', valore: 'μ = 0,1 / (1 + v_f/10), v_f = velocità delle funi',
    riferimento: 'UNI EN 81-50:2020, 5.11.2', fonte: 'fonti secondarie concordi', stato: 'da_verificare',
    costanti: ['muBrakingBase', 'muBrakingSpeed'], verifiche: ['tr_dn', 'tr_up', 'tr_real'],
  },
  {
    id: 'trazione.mu.bloccata', gruppo: 'trazione', titolo: 'Coefficiente di attrito, cabina bloccata', valore: 'μ = 0,2',
    riferimento: 'UNI EN 81-50:2020, 5.11.2', fonte: 'fonti secondarie concordi', stato: 'da_verificare',
    costanti: ['muStalled'], verifiche: ['tr_stall'],
  },
  {
    id: 'trazione.carico.caricamento', gruppo: 'trazione', titolo: 'Carico della verifica di caricamento', valore: '1,25·Q, cabina in basso e in alto',
    riferimento: 'UNI EN 81-50:2020, 5.11.2.3.2', fonte: 'campione BSI di EN 81-50:2020 (p. 50)', stato: 'da_verificare',
    costanti: ['loadTestFactor'], verifiche: ['tr_load'],
    nota: 'Il campione cita anche il peso dei dispositivi di movimentazione, dove usati: non modellato.',
  },
  {
    id: 'trazione.decelerazione.minima', gruppo: 'trazione', titolo: 'Decelerazione della verifica di frenatura', valore: '0,5 m/s²; 0,8 m/s² con ammortizzatori a corsa ridotta',
    riferimento: 'UNI EN 81-50:2020, 5.11.2.2.2', fonte: 'fonti secondarie; 0,8 m/s² da EN 81-1 secondo una fonte secondaria', stato: 'da_verificare',
    costanti: ['aeMin', 'aeReducedStroke'], verifiche: ['tr_dn', 'tr_up'],
  },
  {
    id: 'trazione.otto.casi', gruppo: 'trazione', titolo: 'Combinazioni della frenatura di emergenza', valore: 'cabina vuota e con portata × in discesa e in salita × in basso e in alto; conta la peggiore per verso',
    riferimento: 'UNI EN 81-50:2020, 5.11.2.2.2', fonte: 'derivazione (copertura completa dei casi)', stato: 'scelta',
    verifiche: ['tr_dn', 'tr_up'],
  },
  {
    id: 'trazione.decelerazione.reale', gruppo: 'trazione', titolo: 'Aderenza alla decelerazione reale del freno',
    valore: 'Seconda verifica con la decelerazione data dal freno (tutti i gruppi, mai sotto il minimo); oggi solo avviso',
    riferimento: 'UNI EN 81-50:2020, 5.11.2.2.2 (lettura da decidere sul testo)', fonte: 'fonti secondarie: "ogni parte con la sua decelerazione"', stato: 'da_verificare',
    verifiche: ['tr_real'],
    nota: 'Se la lettura è confermata diventa un esito; nell\'esempio B del capitolo 7 cambia 1,005 in 4,17.',
  },
  {
    id: 'trazione.margine', gruppo: 'trazione', titolo: 'Soglia di attenzione sull\'utilizzo dell\'aderenza', valore: 'utilizzo > 0,97 → «Attenzione»',
    riferimento: '—', fonte: 'scelta del software (margine per incertezza su masse e bilanciamento)', stato: 'scelta',
    costanti: ['tractionWarn'], verifiche: ['tr_load', 'tr_dn', 'tr_up', 'tr_real'],
  },
  // ---------- grooves ----------
  {
    id: 'gole.fattore.U', gruppo: 'gole', titolo: 'Fattore di gola, semicircolare con o senza sottosquadro',
    valore: 'f = μ·4·(cos(γ/2) − sin(β/2)) / (π − β − γ − sin β + sin γ); senza sottosquadro β = 0',
    riferimento: 'UNI EN 81-50:2020, 5.11.2.3 (ex EN 81-1 Allegato M)', fonte: 'fonti secondarie; controllo di coerenza con Mellor', stato: 'da_verificare',
    verifiche: ['tr_load', 'tr_dn', 'tr_up', 'tr_stall'],
  },
  {
    id: 'gole.fattore.V', gruppo: 'gole', titolo: 'Fattore di gola a V', valore: 'temprata (e ogni gola a V con cabina bloccata): f = μ / sin(γ/2); non temprata: f = μ·4·(1 − sin(β/2)) / (π − β − sin β)',
    riferimento: 'UNI EN 81-50:2020, 5.11.2.3', fonte: 'fonti secondarie; controllo di coerenza con Mellor', stato: 'da_verificare',
    verifiche: ['tr_load', 'tr_dn', 'tr_up', 'tr_stall'],
  },
  {
    id: 'gole.limite.beta', gruppo: 'gole', titolo: 'Limite del sottosquadro', valore: 'β ≤ 106° (oltre: KO)',
    riferimento: 'UNI EN 81-50:2020, 5.11.2.3 (valore di EN 81-1)', fonte: 'fonte secondaria su EN 81-1', stato: 'da_verificare',
    costanti: ['betaMax'], verifiche: ['g_geom'],
  },
  {
    id: 'gole.raccomandazione.beta', gruppo: 'gole', titolo: 'Sottosquadro raccomandato', valore: 'β ≤ 90° (oltre: «Attenzione»)',
    riferimento: '—', fonte: 'Montanari, documento tecnico del costruttore', stato: 'scelta',
    costanti: ['betaRecommended'], verifiche: ['g_geom'],
  },
  {
    id: 'gole.limite.gamma', gruppo: 'gole', titolo: 'Angolo minimo della gola a V', valore: 'γ ≥ 35° (sotto: KO)',
    riferimento: 'UNI EN 81-50:2020, 5.12 (tabella di N_equiv(t))', fonte: 'la tabella usata parte da 35°; Montanari: γ ≥ 32°, consigliato 35–40°', stato: 'scelta',
    costanti: ['gammaMin'], verifiche: ['g_geom'],
  },
  // ---------- ropes ----------
  {
    id: 'funi.Dd', gruppo: 'funi', titolo: 'Rapporto D/d della puleggia di trazione', valore: 'D/d ≥ 40',
    riferimento: 'UNI EN 81-20:2020, 5.5.2.1', fonte: 'ELA 2026 e fonti concordi', stato: 'confermato',
    costanti: ['ddMin'], verifiche: ['r_dd'],
  },
  {
    id: 'funi.Dpd', gruppo: 'funi', titolo: 'Rapporto D/d delle pulegge di rinvio', valore: 'Dp/d ≥ 40',
    riferimento: 'UNI EN 81-20:2020, 5.5.2.1', fonte: 'fonti secondarie', stato: 'da_verificare',
    costanti: ['ddMin'], verifiche: ['r_ddp'],
  },
  {
    id: 'funi.numero', gruppo: 'funi', titolo: 'Numero minimo di funi', valore: 'almeno 2 funi indipendenti, ciascuna con il suo attacco',
    riferimento: 'Direttiva 2014/33/UE, Allegato I; UNI EN 81-20:2020, 5.5', fonte: 'fonte secondaria', stato: 'da_verificare',
    costanti: ['ropesMin'], verifiche: ['r_nd'],
  },
  {
    id: 'funi.diametro', gruppo: 'funi', titolo: 'Diametro nominale minimo', valore: 'd ≥ 8 mm (salvo approvazione di un organismo notificato)',
    riferimento: 'UNI EN 81-20:2020, 5.5', fonte: 'fonti secondarie', stato: 'da_verificare',
    costanti: ['ropeDiameterMin'], verifiche: ['r_nd'],
  },
  {
    id: 'funi.Sf.minimo', gruppo: 'funi', titolo: 'Coefficiente di sicurezza minimo', valore: '12 con tre o più funi; 16 con due funi',
    riferimento: 'UNI EN 81-20:2020, 5.5', fonte: 'fonti secondarie', stato: 'da_verificare',
    costanti: ['sfMin3', 'sfMin2'], verifiche: ['r_sfa'],
  },
  {
    id: 'funi.Sf.formula', gruppo: 'funi', titolo: 'Coefficiente di sicurezza richiesto S_f',
    valore: 'S_f = 10^[2,6834 − log10(695,85·10^6·N_equiv/(D/d)^8,567) / log10(77,09·(D/d)^−2,894)]',
    riferimento: 'UNI EN 81-50:2020, 5.12 (ex EN 81-1 Allegato N)', fonte: 'riprodotto su due casi pubblicati (liftdesign.it S_f 16,69; Mellor)', stato: 'confermato',
    costanti: ['sfC0', 'sfC1', 'sfE1', 'sfC2', 'sfE2'], verifiche: ['r_sfa'],
  },
  {
    id: 'funi.Nequiv.pulegge', gruppo: 'funi', titolo: 'N_equiv delle pulegge', valore: 'N_equiv(p) = K_p·(N_ps + 4·N_pr), K_p = (D/Dp)^4',
    riferimento: 'UNI EN 81-50:2020, 5.12', fonte: 'fonti secondarie', stato: 'da_verificare',
    costanti: ['kpExponent', 'reverseBendWeight'], verifiche: ['r_sfa'],
    nota: 'Da confermare anche quando una flessione conta come inversa (distanza tra le pulegge): oggi la classifica il progettista.',
  },
  {
    id: 'funi.Nequiv.gola.confermati', gruppo: 'funi', titolo: 'N_equiv(t) della gola: valori confermati', valore: 'U senza sottosquadro 1; U β 105° 15,2; V γ 35° 18,5',
    riferimento: 'UNI EN 81-50:2020, 5.12, tabella 2', fonte: 'fonti concordi', stato: 'confermato',
    costanti: ['neqU', 'neqV'], verifiche: ['r_sfa'],
  },
  {
    id: 'funi.Nequiv.gola.provvisori', gruppo: 'funi', titolo: 'N_equiv(t) della gola: altri valori (provvisori)',
    valore: 'β 75° 2,5; 80° 3,0; 85° 3,8; 90° 5,0; 95° 6,7; 100° 10,0 · γ 36° 15,2; 38° 10,5; 40° 7,1; 42° 5,6; 45° 4,0',
    riferimento: 'UNI EN 81-50:2020, 5.12, tabella 2', fonte: 'fonti secondarie (β 90° indiretto); gli altri non verificati', stato: 'da_verificare',
    costanti: ['neqU', 'neqV'], verifiche: ['r_sfa'],
  },
  {
    id: 'funi.Nequiv.gola.regola', gruppo: 'funi', titolo: 'Uso della tabella di N_equiv(t)',
    valore: 'nessuna interpolazione: punto più sfavorevole (β superiore, γ inferiore); oltre 105° estrapolazione dall\'ultimo tratto, segnalata',
    riferimento: 'UNI EN 81-50:2020, 5.12', fonte: 'scelta prudente del software (la tabella non dà una regola)', stato: 'scelta',
    verifiche: ['r_sfa'],
  },
  {
    id: 'funi.Tmax', gruppo: 'funi', titolo: 'Tiro massimo per fune', valore: 'cabina con portata ferma al piano più basso; con la macchina in basso sul primo tratto verso la testata',
    riferimento: 'UNI EN 81-50:2020, 5.12', fonte: 'definizione di EN 81-1 da fonte secondaria', stato: 'da_verificare',
    verifiche: ['r_sfa'],
  },
  {
    id: 'funi.stima', gruppo: 'funi', titolo: 'Stima di carico di rottura e massa delle funi', valore: '8×19 Seale anima tessile 1570 N/mm²: 8 mm = 30,4 kN e 0,215 kg/m, poi in proporzione a d²',
    riferimento: '—', fonte: 'tabella Pfeifer 8×19S NFC; usata solo con il pulsante di stima e nella proposta libera', stato: 'stima',
  },
  // ---------- brake ----------
  {
    id: 'freno.gruppi', gruppo: 'freno', titolo: 'Gruppi meccanici del freno', valore: 'almeno 2',
    riferimento: 'UNI EN 81-20:2020, 5.9.2.2; UNI 10411-1:2024', fonte: 'sintesi della UNI 10411-1:2021 e fonti secondarie', stato: 'da_verificare',
    costanti: ['brakeSetsMin'], verifiche: ['b_sets'],
  },
  {
    id: 'freno.tutti', gruppo: 'freno', titolo: 'Freno, tutti i gruppi', valore: 'arresta la cabina in discesa a velocità nominale con 1,25·Q',
    riferimento: 'UNI EN 81-20:2020, 5.9.2.2', fonte: 'due ricerche indipendenti, stessa formulazione', stato: 'da_verificare',
    costanti: ['loadTestFactor'], verifiche: ['b_all'],
  },
  {
    id: 'freno.singolo', gruppo: 'freno', titolo: 'Freno, un solo gruppo', valore: 'rallenta, arresta e tiene la cabina con portata in discesa e la cabina vuota in salita',
    riferimento: 'UNI EN 81-20:2020, 5.9.2.2; UNI 10411-1:2024', fonte: 'sintesi della UNI 10411-1:2021', stato: 'da_verificare',
    verifiche: ['b_one', 'b_up'],
  },
  {
    id: 'freno.rendimento', gruppo: 'freno', titolo: 'Attrito del riduttore nel fabbisogno del freno', valore: 'non conteggiato (η_i = 1): a favore di sicurezza',
    riferimento: '—', fonte: 'scelta prudente del software', stato: 'scelta',
    verifiche: ['b_all', 'b_one', 'b_up'],
  },
  {
    id: 'freno.decelerazione.massima', gruppo: 'freno', titolo: 'Decelerazione massima del freno', valore: '≤ 1 g (oltre: «Attenzione»), da confrontare con paracadute e ammortizzatori',
    riferimento: 'UNI EN 81-20:2020, 5.9.2.2', fonte: 'fonte secondaria', stato: 'da_verificare',
    costanti: ['brakeDecelMax'], verifiche: ['b_amax'],
  },
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
    id: 'azionamento.tolleranza.velocita', gruppo: 'azionamento', titolo: 'Tolleranza tra velocità reale e nominale', valore: 'non verificata: il software mostra la velocità reale e la frequenza per la nominale',
    riferimento: 'da individuare (UNI EN 81-20:2020 o UNI 10411-1:2024)', fonte: 'non trovata nelle fonti consultate', stato: 'da_verificare',
  },
  // ---------- rescue ----------
  {
    id: 'soccorso.forza', gruppo: 'soccorso', titolo: 'Forza massima al volantino', valore: '≤ 400 N, altrimenti manovra elettrica di emergenza',
    riferimento: 'UNI EN 81-20:2020 (clausola da individuare)', fonte: 'Elevator World; stesso valore in EN 81-1', stato: 'da_verificare',
    costanti: ['rescueForceMax'], verifiche: ['s_force'],
  },
  // ---------- shaft ----------
  {
    id: 'albero.carico', gruppo: 'albero', titolo: 'Carico sull\'albero della puleggia', valore: 'risultante dei tiri con 1,25·Q al piano più basso, confrontata con il limite del costruttore',
    riferimento: 'dato del costruttore', fonte: 'derivazione; definizione del costruttore da confermare', stato: 'da_verificare',
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
    valore: 'adeguamento della parte sostituita, comunicazione al Comune e al soggetto delle verifiche, verifica straordinaria prima del servizio',
    riferimento: 'DPR 162/1999 e s.m.i., art. 2 (dopo il DPR 23/2017) e art. 14', fonte: 'testi consolidati non ufficiali; fonti secondarie concordi', stato: 'da_verificare',
  },
  {
    id: 'sostituzione.adeguamenti', gruppo: 'sostituzione', titolo: 'Adeguamenti richiesti per la sostituzione del macchinario', valore: 'elenco del capitolo 6.6 della ricerca (tra cui freno a due gruppi)',
    riferimento: 'UNI 10411-1:2024', fonte: 'sintesi pubblicate della UNI 10411-1:2021 (edizione superata)', stato: 'da_verificare',
    verifiche: ['b_sets'],
  },
  {
    id: 'sostituzione.funi', gruppo: 'sostituzione', titolo: 'Funi nella sostituzione', valore: 'di norma funi nuove con lo stesso numero e diametro di quelle montate; la proposta le tiene fisse',
    riferimento: '—', fonte: 'indicazione di Panev Ascensori (29 settembre 2026)', stato: 'prassi',
  },
  // ---------- model ----------
  {
    id: 'modello.g', gruppo: 'modello', titolo: 'Accelerazione di gravità', valore: 'g = 9,81 m/s² (anche come limite di 1 g)',
    riferimento: 'UNI EN 81-50:2020 (simboli)', fonte: 'valore d\'uso nei calcoli degli ascensori', stato: 'da_verificare',
    costanti: ['g', 'brakeDecelMax'],
  },
  {
    id: 'modello.percorso', gruppo: 'modello', titolo: 'Tiri con il metodo del percorso della fune', valore: 'masse e funi di ogni tratto, inerzia delle pulegge di rinvio; attrito di guide e pulegge trascurato in aderenza',
    riferimento: 'UNI EN 81-50:2020, 5.11', fonte: 'derivazione; il conteggio dell\'inerzia delle pulegge va confermato', stato: 'da_verificare',
    verifiche: ['tr_load', 'tr_dn', 'tr_up', 'tr_real', 'tr_stall'],
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
