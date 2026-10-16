// What UNI 10411-1/-11:2024 ask of the parts a modification replaces or changes besides the machine, in our words with
// the clause (round 46: out of norme-collaudo.ts, which re-exports it), and the parts that together make a substantial
// modification. The changes of speed, load and travel have one point per case (obblighi-variazioni.ts), picked by what
// the documents of the existing lift say against the calculation (B5); the optional parts of a modernisation and the
// speed regulation of the controller kept under a new machine are in obblighi-facoltative.ts (B6, B7). Pure.
import type { FormValues } from '@/calc/types';
import type { Collaudo, Parte } from './collaudo';
import { carichiOf, carichiVariati, corsaOf, portataVariata, variazioneCarico, variazioneCorsa, variazioneVelocita, velocitaOf } from './modifica';
import { OBBLIGHI_VARIAZIONI, type CasoVariazione } from './obblighi-variazioni';
import { OBBLIGHI_FACOLTATIVE, OBBLIGHI_REGOLAZIONE, SPAZIO_FORMULA, spazioScorrevoli } from './obblighi-facoltative';
import { lt, type PuntoInSito } from './punti';

/** What UNI 10411-1/-11:2024 ask of the parts a modification replaces besides the machine (whose adaptations are
 *  their own list: present/adapt.ts, a_11): the controller, the doors, a new car on the existing sling, the sling (its
 *  slack rope contact kept, -1), the ropes, the governor; the changes of speed, load and travel by their case
 *  (OBBLIGHI_VARIAZIONI). In our words with the clause, read on the standards' text. */
export const OBBLIGHI_PARTI: Readonly<Record<'10411-1' | '10411-11', Partial<Readonly<Record<Parte, PuntoInSito>>>>> = {
  '10411-1': {
    car: lt('UNI 10411-1:2024, 22', 'cabina nuova sull’arcata esistente: la cabina e ciò che vi è montato secondo la UNI EN 81-20 da 5.4.1 a 5.4.10, la '
      + 'superficie utile entro il prospetto 6 per la portata, e le lettere a)–n) del punto (tra cui il grembiule 5.4.5, la presa di corrente in fossa, '
      + 'il parapetto 5.4.7.4 oltre 0,30 m dalla parete, altezze sotto 2 m solo non inferiori alle esistenti e con gli avvertimenti); con T* o la '
      + 'portata oltre il prospetto 1 i punti 6.3–6.12 e 6.15, tra cui l’arcata (6.9)'),
    // 12.2 of UNI 10411-1 is the landing doors' locking devices (below, with them); of UNI 10411-11 it is general
    carDoors: lt('UNI 10411-1:2024, 12.1 e 12.3', 'meccanismi delle porte di cabina nuovi secondo la UNI EN 81-20 5.3.3.2, 5.3.3.3 e da 5.3.8 a 5.3.14; porte '
      + 'motorizzate anche 5.3.6.2 e 5.3.6.3'),
    landingDoors: lt('UNI 10411-1:2024, 19 e 12.2', 'porte di piano nuove secondo la UNI EN 81-20 5.3, mai più basse delle esistenti (sotto 1,9 m la UNI EN '
      + '81-21 5.12); resistenza al fuoco non inferiore all’esistente; presenza della cabina segnalata (5.3.7.2); porte scorrevoli nuove: la '
      + 'difesa frontale del vano dove si muovono secondo il punto 7 (19.5); grembiule della soglia di cabina secondo la 5.4.5 (la UNI EN 81-21 '
      + '5.8 se i luoghi non lo consentono, 19.6); dispositivi di blocco nuovi con certificato di esame del tipo (12.2)'),
    sling: lt('UNI 10411-1:2024, 6.2 e 22 b)', 'arcata nuova: il contatto di allentamento delle funi, che interviene anche per una sola fune, '
      + 'si conserva, anche con cabina e arcata sostituite insieme'),
    controller: lt('UNI 10411-1:2024, 11.1', 'quadro nuovo secondo la UNI EN 81-20 da 5.10 a 5.12.4, 5.4.10.4 c) e da 5.9.2.5 a 5.9.2.7, con le deroghe di '
      + '11.1.3; la parte elettrica si rifà salvo compatibilità attestata e conduttori marcati (11.1.2); senza UCM conforme alla 5.6.7 il freno a doppio '
      + 'elemento meccanico sorvegliato (11.1.4); luce del locale del macchinario e del vano secondo la 5.2.1.4 (11.1.8)'),
    ropes: lt('UNI 10411-1:2024, 17', 'funi nuove secondo la UNI EN 81-20 5.5.1 e attacchi d’estremità controllati (17.1); diametro o carico di rottura '
      + 'diversi da quelli documentati: verifiche della 14.1 anche con la stessa puleggia (17.2)'),
    governor: lt('UNI 10411-1:2024, 18', 'limitatore, tenditore, fune e contatti nuovi secondo la UNI EN 81-20 5.6.2.2.1 e 5.5.7.1, con l’intervento del '
      + 'paracadute entro i limiti della norma in vigore all’installazione'),
    ...OBBLIGHI_FACOLTATIVE['10411-1'],
  },
  '10411-11': {
    car: lt('UNI 10411-11:2024, 22', 'cabina nuova sull’arcata esistente: la cabina e ciò che vi è montato secondo la UNI EN 81-20 da 5.4.1 a 5.4.10; con T* '
      + 'aumentato i punti 6.2–6.13, tra cui l’arcata (6.9); con T* diminuito gli ammortizzatori per i nuovi carichi; con un’altezza diversa gli spazi '
      + 'in fossa e in testata (5.2.5.8 e 5.2.5.7); parapetto (5.4.7.4) oltre 0,30 m dalla parete; valutazione 4.3'),
    carDoors: lt('UNI 10411-11:2024, 12.1–12.3', 'meccanismi delle porte di cabina nuovi secondo la UNI EN 81-20 5.3.3.2, 5.3.3.3 e da 5.3.8 a 5.3.14; porte '
      + 'motorizzate anche 5.3.6.2 e 5.3.6.3'),
    landingDoors: lt('UNI 10411-11:2024, 19', 'porte di piano nuove come le originali, altrimenti secondo la UNI EN 81-20 5.3 (la UNI EN 81-21 5.12 se i '
      + 'luoghi non consentono la 5.3.2.1), con la valutazione 4.3; resistenza al fuoco non inferiore all’esistente'),
    controller: lt('UNI 10411-11:2024, 11.1', 'quadro nuovo secondo la UNI EN 81-20 da 5.10 a 5.12.4, 5.4.10.4 c) e da 5.9.2.5 a 5.9.2.7 (11.1.1), con le '
      + 'deroghe di 11.1.2 per gli impianti secondo la UNI EN 81-1; senza UCM conforme alla 5.6.7 macchinario senza alimentazione se il freno non si '
      + 'apre, con ripristino solo manuale (11.1.3); valutazione 4.3 (11.1.4)'),
    ropes: lt('UNI 10411-11:2024, 17', 'funi nuove e attacchi d’estremità come gli originali, altrimenti verificati per l’impianto con la valutazione 4.3'),
    governor: lt('UNI 10411-11:2024, 18', 'limitatore, tenditore, fune e contatti come gli originali, altrimenti verificati per l’impianto con la '
      + 'valutazione 4.3'),
    ...OBBLIGHI_FACOLTATIVE['10411-11'],
  },
};
const ORDINE_PARTI: readonly Parte[] = ['speed', 'load', 'travel', 'car', 'sling', 'carDoors', 'slidingDoors', 'landingDoors', 'controller', 'ropes', 'governor',
  'safetyGear', 'ucm', 'alarm', 'room'];
/** Controller, machine, landing doors, car and sling replaced together: a substantial modification (UNI 10411-1/-11,
 *  21.1; the form warns, intervento.ts sostanziale). */
export const SOSTANZIALE: readonly Parte[] = ['controller', 'machine', 'landingDoors', 'car', 'sling'];

/** The cases of the changes of speed, load and travel among the parts, by what the documents of the existing lift say
 *  against the calculation's values `V` (round 46): under -1 the speed increased or decreased (a change within 5 % noted
 *  when it is not among the parts — none when the speed is the documented one within the rounding), the loads beyond prospetto 1 or 2, decreased or their ratio changed, the travel
 *  lengthened (⚠ over 8 m) or shortened; under -11 the speed with 15 i), the loads increased or decreased, the travel.
 *  Without `V` or without the documents (a change answered «Sì» by hand) the lengthening and increase cases; the load
 *  answered «Sì» while the documented loads show no case, the point that says so (loadDocumentati) — and (round 47, D1)
 *  so the speed and the travel (speedDocumentati, travelDocumentati); the loads unchanged on the documents under a new
 *  car, its mass to confirm (loadCabinaNuova). */
function casi(C: Pick<Collaudo, 'norma' | 'parti' | 'documentato' | 'libretto'>, n: '10411-1' | '10411-11', V?: FormValues): Record<Variata, CasoVariazione[]> {
  const has = (p: Parte): boolean => C.parti.includes(p), uno = n === '10411-1';
  const v = V && C.libretto ? velocitaOf(V) : null, H = V && C.libretto?.H ? corsaOf(V) : null, ora = V && C.documentato ? carichiOf(V) : null;
  const xv = v !== null ? variazioneVelocita(n, C.libretto, v) : null, xh = H !== null ? variazioneCorsa(n, C.libretto, H) : null;
  const xl = C.documentato && ora ? variazioneCarico(n, C.documentato, ora) : null;
  const speed: CasoVariazione[] = !has('speed') ? (uno && xv && !xv.variata && !xv.uguale ? ['speedWithin'] : [])
    : xv && !xv.variata ? ['speedDocumentati'] : uno ? [xv?.calo && !xv.aumento ? 'speedDown' : 'speedUp'] : ['speedUp', 'speedUcm'];
  const doc: CasoVariazione[] = xl ? [...(xl.p1 ? ['loadP1' as const] : []), ...(xl.p2 ? ['loadP2' as const] : []), ...(xl.calo ? ['loadCalo' as const] : []),
    ...(xl.rapporto ? ['loadRapporto' as const] : [])] : [];
  // 'load' answered «Sì» by hand: with the documented loads, the case they show — none, a point for the engineer, never
  // the prospetti's obligations as if exceeded (round 46 final check); without them, the increases
  // the loads unchanged on the documents (rated load, T* and counterweight) under a new car: its mass to confirm
  const uguali = !!xl && !!C.documentato && !!ora && !carichiVariati(n, C.documentato, ora) && !portataVariata(C.documentato, ora);
  const load: CasoVariazione[] = !has('load') ? (uguali && has('car') ? ['loadCabinaNuova'] : []) : doc.length ? doc : xl ? ['loadDocumentati'] : uno ? ['loadP1', 'loadP2'] : ['loadP1'];
  const travel: CasoVariazione[] = !has('travel') ? [] : xh && !xh.variata ? ['travelDocumentati'] : xh?.accorciata ? ['travelDown']
    : xh?.oltre8 ? ['travelOver8', 'travelUp'] : ['travelUp'];
  return { speed, load, travel };
}
type Variata = 'speed' | 'load' | 'travel';
const isVariata = (p: Parte): p is Variata => p === 'speed' || p === 'load' || p === 'travel';
const it = (x: number, d: number): string => x.toFixed(d).replace('.', ',');

/** The points of the parts a modification replaces or changes besides the machine, under its part of UNI 10411: the
 *  changes of speed, load and travel by their case (casi, with the calculation's values `V`), the new car only on the
 *  existing sling (22); all of controller, machine, landing doors, car and sling a substantial modification (21.1); the
 *  existing controller kept under a new machine with its speed regulation (round 46, 11.2.1 / 11.2 — unanswered, the
 *  relazione's ⚠, report/variazioni.ts); the car doors made sliding with the clearance at the calculation's speed.
 *  None tested as new. */
export function obblighiParti(C: Pick<Collaudo, 'norma' | 'parti' | 'documentato' | 'libretto' | 'regolazione'>, V?: FormValues): PuntoInSito[] {
  if (C.norma === 'en81') return [];
  const n = C.norma, keep = (p: Parte): boolean => C.parti.includes(p) && !(p === 'car' && C.parti.includes('sling'));
  const sostanziale = SOSTANZIALE.every((p) => C.parti.includes(p))
    ? [lt(`UNI ${n}:2024, 21.1`, `quadro, macchina, porte di piano, cabina e arcata sostituiti insieme${n === '10411-1' ? ' (con il macchinario in un locale apposito)' : ''}: `
      + 'modifica sostanziale, il risultato segue la UNI EN 81-20:2020, con i requisiti della UNI EN 81-21:2022 dove i luoghi, i vincoli strutturali o '
      + 'le difese conservate non lo consentono')] : [];
  const perCaso = casi(C, n, V), v = V ? velocitaOf(V) : null, di = (p: Parte): PuntoInSito[] => {
    if (isVariata(p)) return perCaso[p].flatMap((c) => { const x = OBBLIGHI_VARIAZIONI[n][c]; return x ? [x] : []; });
    if (p === 'controller' && !C.parti.includes(p)) return C.parti.includes('machine') && C.regolazione === 'vvvf' ? [OBBLIGHI_REGOLAZIONE[n]] : [];
    const x = OBBLIGHI_PARTI[n][p];
    if (!keep(p) || !x) return [];
    // the clearance over the new parts on the car roof at the calculation's speed, right after the formula: information,
    // the check stays EN 81-20's (owner's decision Q5)
    return p === 'slidingDoors' && v !== null ? [{ ...x, testo: x.testo.replace(SPAZIO_FORMULA, `${SPAZIO_FORMULA} (con v = ${it(v, 2)} m/s: `
      + `${it(spazioScorrevoli(v), 3)} m, come informazione; la verifica dello spazio libero in testata resta secondo la UNI EN 81-20)`) }] : [x];
  };
  return [...sostanziale, ...ORDINE_PARTI.flatMap(di)];
}
