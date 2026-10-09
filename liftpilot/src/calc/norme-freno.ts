// Registry of the brake (UNI EN 81-20:2020, 5.9.2.2): the entries of the group 'freno' of VOCI, kept apart for the size
// of norme.ts and spread there at their place. Same form as norme.ts; Italian texts, clause numbers and values only.
import type { Voce } from './norme';
import { MACCHINA_AMMESSA, letto } from './norme-fonti';

const T20 = 'UNI EN 81-20:2020', T1 = 'UNI EN 81-1:2008', U1 = 'UNI 10411-1:2024', VIA = MACCHINA_AMMESSA;

export const VOCI_FRENO: readonly Voce[] = [
  {
    id: 'freno.gruppi', gruppo: 'freno', titolo: 'Gruppi meccanici del freno', valore: 'almeno 2',
    riferimento: 'UNI EN 81-20:2020, 5.9.2.2.2.1; UNI EN 81-1:2008, 12.4.2.1; UNI 10411-1:2024, 14.1 a)–b)',
    fonte: `${letto(T20, 'p. 100')}; ${letto(T1, 'p. 68')}; ${letto(U1, 'p. 13')}`, stato: 'confermato',
    costanti: ['brakeSetsMin'], verifiche: ['b_sets'],
    // the machine's own standard: the two sets are in both (UNI EN 81-1, 12.4.2.1), admitted by 14.1 a) or b)
    rifStd: { 'en81-20': `${T20}, 5.9.2.2.2.1; ${VIA['en81-20']}`, 'en81-1': `UNI EN 81-1, 12.4.2.1; ${VIA['en81-1']}` },
  },
  {
    id: 'freno.tutti', gruppo: 'freno', titolo: 'Freno, tutti i gruppi', valore: 'arresta la cabina in discesa a velocità nominale con 1,25·Q',
    riferimento: 'UNI EN 81-20:2020, 5.9.2.2.2.1; UNI EN 81-1:2008, 12.4.2.1; UNI 10411-1:2024, 14.1 a)–b)',
    fonte: `${letto(T20, 'p. 100')}; ${letto(T1, 'p. 68')}; ${letto(U1, 'p. 13')}`, stato: 'confermato',
    costanti: ['loadTestFactor'], verifiche: ['b_all'],
    // the same 1,25·Q in both standards (UNI EN 81-1, 12.4.2.1)
    rifStd: { 'en81-20': `${T20}, 5.9.2.2.2.1; ${VIA['en81-20']}`, 'en81-1': `UNI EN 81-1, 12.4.2.1; ${VIA['en81-1']}` },
  },
  {
    id: 'freno.singolo', gruppo: 'freno', titolo: 'Freno, un solo gruppo', valore: 'rallenta, arresta e tiene la cabina con portata in discesa e la cabina vuota in salita',
    riferimento: 'UNI EN 81-20:2020, 5.9.2.2.2.1; UNI EN 81-1:2008, 12.4.2.1; UNI 10411-1:2024, 14.1 a)–b)',
    fonte: `${letto(T20, 'p. 100')}; ${letto(T1, 'p. 68')}; ${letto(U1, 'p. 13')}`, stato: 'confermato',
    verifiche: ['b_one', 'b_up'],
    // a machine to UNI EN 81-1: its 12.4.2.1 asks one set to slow the loaded car going down; the empty car going up and the
    // holding are the more complete check of UNI EN 81-20 the software applies (nota)
    rifStd: {
      'en81-20': `${T20}, 5.9.2.2.2.1; ${VIA['en81-20']}`,
      'en81-1': `${T20}, 5.9.2.2.2.1 (verifica più completa scelta dal software); UNI EN 81-1, 12.4.2.1; ${VIA['en81-1']}`,
    },
    nota: 'La UNI 10411-1:2024 (11.1.4) e la UNI EN 81-1:2008 (12.4.2.1) chiedono a un solo gruppo di rallentare la cabina carica in discesa; il software applica '
      + 'la richiesta più completa della UNI EN 81-20.',
  },
  {
    id: 'freno.rendimento', gruppo: 'freno', titolo: 'Attrito del riduttore nel fabbisogno del freno', valore: 'non conteggiato (η_i = 1): a favore di sicurezza',
    riferimento: '—', fonte: 'scelta prudente del software', stato: 'scelta',
    verifiche: ['b_all', 'b_one', 'b_up'],
  },
  {
    id: 'freno.decelerazione.massima', gruppo: 'freno', titolo: 'Decelerazione massima del freno', valore: '≤ 1 g (oltre: «Attenzione»), da confrontare con paracadute e ammortizzatori',
    riferimento: 'UNI EN 81-20:2020, 5.9.2.2.2.1 (non oltre il paracadute o l’urto sugli ammortizzatori); 1 gn in 5.6.2.1.3 e 5.8.2; '
      + 'con il freno come organo d’arresto, 1 gn anche in 5.6.6.3 (ACOP) e 5.6.7.6 (UCM)',
    fonte: letto(T20, 'pp. 81, 98–100'), stato: 'derivazione',
    costanti: ['brakeDecelMax'], verifiche: ['b_amax'],
    nota: 'La norma non dà un numero per il freno: ne confronta la decelerazione media con quella del paracadute e dell’urto sugli '
      + 'ammortizzatori, che hanno 1 gn come limite. Il confronto vero è con i dati dei componenti montati.',
  },
];
