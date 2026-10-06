// Registry of the rescue (UNI EN 81-20:2020, 5.9.2.2.2.9 and 5.9.2.3; UNI EN 81-1:2008, 12.5): the entries of the group
// 'soccorso' of VOCI, kept apart for the size of norme.ts and spread there at their place. Same form as norme.ts; Italian
// texts, clause numbers and values only.
import type { Voce } from './norme';
import { letto } from './norme-fonti';

const T20 = 'UNI EN 81-20:2020', T1 = 'UNI EN 81-1:2008';

export const VOCI_SOCCORSO: readonly Voce[] = [
  {
    id: 'soccorso.forza', gruppo: 'soccorso', titolo: 'Forza al volantino per far salire la cabina con la portata',
    valore: '≤ 400 N, altrimenti manovra elettrica di emergenza: secondo la UNI EN 81-20:2020 quella della 5.12.1.6 (al massimo 0,30 m/s); '
      + 'secondo la UNI EN 81-1:2008 quella della 14.2.1.4 (al massimo 0,63 m/s)',
    riferimento: 'UNI EN 81-20:2020, 5.9.2.3.3 e 5.12.1.6; UNI EN 81-1:2008, 12.5.1–12.5.2 e 14.2.1.4',
    fonte: `${letto(T20, 'pp. 102 e 129')}; ${letto(T1, 'pp. 69 e 89–90')}`, stato: 'confermato',
    costanti: ['rescueForceMax', 'rescueSpeed', 'rescueSpeedOld'], verifiche: ['s_force'],
    nota: 'La forza è quella per far salire la cabina con la portata dal piano più basso, con i rendimenti del riduttore (in avanti) e del vano.',
  },
  {
    id: 'soccorso.meccanico', gruppo: 'soccorso', titolo: 'Mezzo meccanico per la manovra di emergenza',
    valore: 'ammesso se per portare la cabina a una fermata bastano 150 N con il carico tra (q − 0,1)·Q e (q + 0,1)·Q: il software prende la '
      + 'forza maggiore tra i due carichi, i due versi e le due posizioni estreme; oltre, mezzo elettrico (5.9.2.3.1 b)) con alimentazione '
      + 'indipendente dalla rete, che porta la cabina con qualsiasi carico alla fermata vicina entro 1 h, al massimo a 0,30 m/s, e manovra '
      + 'elettrica di emergenza (5.12.1.6)',
    riferimento: 'UNI EN 81-20:2020, 5.9.2.2.2.9, 5.9.2.3.1 e 5.9.2.3.3', fonte: letto(T20, 'pp. 101–102'), stato: 'confermato',
    costanti: ['rescueForceMech', 'rescueLoadBand', 'rescueHours', 'rescueSpeed'], verifiche: ['s_fa'],
    nota: 'Solo con la macchina secondo la UNI EN 81-20:2020: la UNI EN 81-1:2008 non ha la soglia dei 150 N né l\'ora di autonomia. Il '
      + 'verso della forza non è dato dalla norma: il software prende il peggiore.',
  },
  {
    id: 'soccorso.gravita', gruppo: 'soccorso', titolo: 'Movimento per gravità con il freno aperto a mano',
    valore: 'con il riduttore irreversibile (η_i = 0) la cabina non si muove aprendo il freno: servono i mezzi della 5.9.2.3 (informazione)',
    riferimento: 'UNI EN 81-20:2020, 5.9.2.2.2.9', fonte: letto(T20, 'p. 101'), stato: 'confermato',
    verifiche: ['s_gravity'],
    nota: 'Il rendimento inverso η_i è quello inserito o la stima della voce azionamento.rendimento.inverso.',
  },
];
