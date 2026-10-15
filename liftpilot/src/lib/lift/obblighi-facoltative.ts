// What UNI 10411-1/-11:2024 ask of the optional parts of a modernisation (round 46, B7, owner's decision Q3) and of the
// speed regulation of the existing controller kept under a new machine (B6), in our words with the clause numbers and
// values, read on the standards' text — never their text (CEN-CENELEC and UNI copyright). obblighi.ts spreads them into
// OBBLIGHI_PARTI; the clearance over the new parts on the car roof with the car doors made sliding (13.1.3 b), -11
// 13.1.2 b)) is printed with the calculation's speed as information, the check h_clear staying to UNI EN 81-20 (owner's
// decision Q5). Pure.
import { dv, lt, type PuntoInSito } from './punti';
import type { Norma10411 } from './modifica';
import { KL } from './norme';

type Facoltativa = 'safetyGear' | 'ucm' | 'alarm' | 'room' | 'slidingDoors';

/** The clearance over the new parts on the car roof as the obligation prints it (obblighi.ts follows it with its value
 *  at the calculation's speed). */
export const SPAZIO_FORMULA = `${String(KL.slidingClear).replace('.', ',')} + ${String(KL.slidingClearV2).replace('.', ',')}·v² m`;

export const OBBLIGHI_FACOLTATIVE: Readonly<Record<Norma10411, Readonly<Record<Facoltativa, PuntoInSito>>>> = {
  '10411-1': {
    // -1 6.7 sits in point 6 (the loads): whether it applies without a change of load is uncertain (spec, uncertain)
    safetyGear: dv('UNI 10411-1:2024, 6.6, 6.7, 15.3 e 15.6', 'paracadute nuovo (di cabina o del contrappeso) secondo la UNI EN 81-20 5.6.2, '
      + 'con certificato di esame del tipo e dichiarazione di conformità, insieme al suo sistema di azionamento e al limitatore; il limitatore '
      + 'esistente resta solo se un certificato di esame del tipo ne attesta l’idoneità alla velocità nominale; le guide hanno le caratteristiche '
      + 'che il certificato del paracadute indica (15.6)'),
    ucm: lt('UNI 10411-1:2024, 6.12, 15.4 e 14.4 c)–d)', 'protezioni contro la velocità eccessiva in salita (ACOP, UNI EN 81-20 5.6.6) e '
      + 'contro il movimento incontrollato della cabina (UCM, 5.6.7) nuove o modificate: con la portata o la velocità variate le ACOP secondo la '
      + '5.6.6 (6.12, 15.4); con la macchina nuova le ACOP e le UCM presenti devono continuare a funzionare correttamente (14.4 c) e d))'),
    alarm: lt('UNI 10411-1:2024, 23', 'allarme di emergenza nuovo secondo la UNI EN 81-20 5.12.3.1 (con il suo rinvio alla UNI EN 81-28:2004) '
      + 'oppure secondo la UNI EN 81-28:2022'),
    room: lt('UNI 10411-1:2024, 8', 'locale del macchinario nuovo o modificato secondo la UNI EN 81-20 5.2.1, 5.2.6.1–5.2.6.3, 5.10.1.2.2 e '
      + '5.10.5 (locale delle pulegge di rinvio: 5.2.1, 5.10.1.2.2 e 5.2.6.7); cambiando dimensioni o accesso di un locale esistente dove i luoghi '
      + 'non consentono uno di questi requisiti basta una sicurezza almeno equivalente a quella dell’epoca dell’installazione'),
    slidingDoors: lt('UNI 10411-1:2024, 13.1.1–13.2.4', 'porte di cabina da battente a scorrevoli: portata e T* ricalcolati se la nuova '
      + 'superficie utile lo richiede, con il punto 6 (13.1.1); porte secondo la UNI EN 81-20 5.3 esclusa la 5.3.15.2, il punto 7 se si avvicinano '
      + 'alle difese (13.1.2); sul tetto di cabina il rifugio della 5.2.5.7 (o quello dell’app. B) e sopra le parti nuove uno spazio libero di almeno '
      + `${SPAZIO_FORMULA}, altrimenti la UNI EN 81-21 5.5 (13.1.3); `
      + 'grembiule secondo la 5.4.5 (13.1.4); motorizzate anche 5.3.6.2 e 5.3.6.3, pulsante di riapertura in cabina, tolto l’eventuale pulsante ALT, e '
      + 'schema come al punto 11.2 (13.2)'),
  },
  '10411-11': {
    safetyGear: dv('UNI 10411-11:2024, 6.6 e 6.7', 'paracadute nuovo (di cabina o del contrappeso) verificato per l’impianto, con il suo '
      + 'sistema di azionamento e il limitatore; altrimenti come l’originale; valutazione 4.3'),
    ucm: lt('UNI 10411-11:2024, 6.10, 15 c), 15 i) e 14.3 a)', 'protezioni ACOP e UCM nuove o modificate: verificate per i nuovi carichi '
      + '(6.10) e per la nuova velocità (15 c)), la UCM secondo la UNI EN 81-20 5.6.7 con la velocità variata oltre il 5 % (15 i)); con la macchina '
      + 'nuova le UCM presenti devono continuare a funzionare correttamente (14.3 a)); valutazione 4.3'),
    alarm: lt('UNI 10411-11:2024, 23', 'allarme di emergenza nuovo secondo la UNI EN 81-20 5.12.3.1 (con il suo rinvio alla UNI EN 81-28:2004) '
      + 'oppure secondo la UNI EN 81-28:2022'),
    room: lt('UNI 10411-11:2024, 8', 'spazio del macchinario nuovo o modificato secondo la UNI EN 81-20 5.2.6; sulle aree di lavoro 2,10 m di '
      + 'altezza libera, oppure quella esistente se non si raggiunge; valutazione 4.3'),
    slidingDoors: lt('UNI 10411-11:2024, 13.1.1–13.2.4', 'porte di cabina da battente a scorrevoli: portata e T* ricalcolati se la nuova '
      + 'superficie utile lo richiede, con il punto 6 (13.1.1); porte secondo la UNI EN 81-20 5.3 (la 5.3.15.2 se già applicata), il punto 7 se si '
      + 'avvicinano alle difese; sul tetto di cabina il rifugio della 5.2.5.7 e sopra le parti nuove uno spazio libero di almeno '
      + `${SPAZIO_FORMULA}, altrimenti la UNI EN 81-21 5.5 (13.1.2); `
      + 'motorizzate anche 5.3.6.2 e 5.3.6.3, pulsante di riapertura in cabina e schema come all’11.2 (13.2)'),
  },
};

/** The existing controller kept under a new machine, answered with a frequency converter (round 46, B6): the regulation
 *  stays; replacing its device brings 11.1.4 (-1) or 11.1.3 (-11); adding one to a controller without it is not allowed. */
export const OBBLIGHI_REGOLAZIONE: Readonly<Record<Norma10411, PuntoInSito>> = {
  '10411-1': lt('UNI 10411-1:2024, 11.2.1', 'quadro esistente con la regolazione della velocità (inverter), che resta con la macchina nuova: '
    + 'componenti sostituiti o aggiunti secondo la UNI EN 81-20 da 5.10 a 5.12.4, 5.4.10.4 c) e da 5.9.2.5 a 5.9.2.7 con le deroghe di 11.1.3; '
    + 'sostituendo il dispositivo di regolazione anche l’11.1.4; la regolazione non si aggiunge a un quadro che non l’ha'),
  '10411-11': lt('UNI 10411-11:2024, 11.2', 'quadro esistente con la regolazione della velocità (inverter), che resta con la macchina nuova: '
    + 'componenti sostituiti o aggiunti secondo la UNI EN 81-20 da 5.10 a 5.12.4, 5.4.10.4 c) e da 5.9.2.5 a 5.9.2.7 con le deroghe di 11.1.2; '
    + 'sostituendo il dispositivo di regolazione anche l’11.1.3; la regolazione non si aggiunge a un quadro che non l’ha; valutazione 4.3'),
};

/** The clearance over the new parts on the car roof with the car doors made sliding, at the rated speed `v` [m/s]: as
 *  information (13.1.3 b), -11 13.1.2 b)); the check stays to UNI EN 81-20 (h_clear, owner's decision Q5). */
export const spazioScorrevoli = (v: number): number => KL.slidingClear + KL.slidingClearV2 * v * v;
