// What UNI 10411-1/-11:2024 ask of the parts a modification replaces besides the machine, in our words with the clause
// (round 46: out of norme-collaudo.ts, which re-exports it), and the parts that together make a substantial
// modification. Pure.
import type { Collaudo, Parte } from './collaudo';
import { lt, type PuntoInSito } from './punti';

/** What UNI 10411-1/-11:2024 ask of the parts a modification replaces besides the machine (whose adaptations are
 *  their own list: present/adapt.ts, a_11): the controller, the doors, a new car on the existing sling, the ropes, the
 *  governor; the changes of the loads are the checks of the result (6.1, the sling: arcata.ts). In our words with the
 *  clause, read on the standards' text. */
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
      + '81-21 5.12); resistenza al fuoco non inferiore all’esistente; presenza della cabina segnalata (5.3.7.2); grembiule della soglia di cabina '
      + 'secondo la 5.4.5 (la UNI EN 81-21 5.8 se i luoghi non lo consentono); dispositivi di blocco nuovi con certificato di esame del tipo (12.2)'),
    controller: lt('UNI 10411-1:2024, 11.1', 'quadro nuovo secondo la UNI EN 81-20 da 5.10 a 5.12.4, 5.4.10.4 c) e da 5.9.2.5 a 5.9.2.7, con le deroghe di '
      + '11.1.3; la parte elettrica si rifà salvo compatibilità attestata e conduttori marcati (11.1.2); senza UCM conforme alla 5.6.7 il freno a doppio '
      + 'elemento meccanico sorvegliato (11.1.4); luce del locale del macchinario e del vano secondo la 5.2.1.4 (11.1.8)'),
    ropes: lt('UNI 10411-1:2024, 17', 'funi nuove secondo la UNI EN 81-20 5.5.1 e attacchi d’estremità controllati (17.1); diametro o carico di rottura '
      + 'diversi da quelli documentati: verifiche della 14.1 anche con la stessa puleggia (17.2)'),
    governor: lt('UNI 10411-1:2024, 18', 'limitatore, tenditore, fune e contatti nuovi secondo la UNI EN 81-20 5.6.2.2.1 e 5.5.7.1, con l’intervento del '
      + 'paracadute entro i limiti della norma in vigore all’installazione'),
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
  },
};
const ORDINE_PARTI: readonly Parte[] = ['car', 'carDoors', 'landingDoors', 'controller', 'ropes', 'governor'];
/** Controller, machine, landing doors, car and sling replaced together: a substantial modification (UNI 10411-1/-11,
 *  21.1; the form warns, intervento.ts sostanziale). */
export const SOSTANZIALE: readonly Parte[] = ['controller', 'machine', 'landingDoors', 'car', 'sling'];

/** The points of the parts a modification replaces besides the machine, under its part of UNI 10411: the new car only
 *  on the existing sling (22); all of controller, machine, landing doors, car and sling a substantial modification
 *  (21.1). None tested as new. */
export function obblighiParti(C: Pick<Collaudo, 'norma' | 'parti'>): PuntoInSito[] {
  if (C.norma === 'en81') return [];
  const n = C.norma, keep = (p: Parte): boolean => C.parti.includes(p) && !(p === 'car' && C.parti.includes('sling'));
  const sostanziale = SOSTANZIALE.every((p) => C.parti.includes(p))
    ? [lt(`UNI ${n}:2024, 21.1`, `quadro, macchina, porte di piano, cabina e arcata sostituiti insieme${n === '10411-1' ? ' (con il macchinario in un locale apposito)' : ''}: `
      + 'modifica sostanziale, il risultato segue la UNI EN 81-20:2020, con i requisiti della UNI EN 81-21:2022 dove i luoghi, i vincoli strutturali o '
      + 'le difese conservate non lo consentono')] : [];
  return [...sostanziale, ...ORDINE_PARTI.flatMap((p) => { const x = OBBLIGHI_PARTI[n][p]; return keep(p) && x ? [x] : []; })];
}
