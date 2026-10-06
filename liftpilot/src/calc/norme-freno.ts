// Registry of the brake (UNI EN 81-20:2020, 5.9.2.2): the entries of the group 'freno' of VOCI, kept apart for the size
// of norme.ts and spread there at their place. Same form as norme.ts; Italian texts, clause numbers and values only.
import type { Voce } from './norme';
import { letto } from './norme-fonti';

const T20 = 'UNI EN 81-20:2020', U1 = 'UNI 10411-1:2024';

export const VOCI_FRENO: readonly Voce[] = [
  {
    id: 'freno.gruppi', gruppo: 'freno', titolo: 'Gruppi meccanici del freno', valore: 'almeno 2',
    riferimento: 'UNI EN 81-20:2020, 5.9.2.2.2.1; UNI 10411-1:2024, 14.1 a)', fonte: `${letto(T20, 'p. 100')}; ${letto(U1, 'p. 13')}`, stato: 'confermato',
    costanti: ['brakeSetsMin'], verifiche: ['b_sets'],
  },
  {
    id: 'freno.tutti', gruppo: 'freno', titolo: 'Freno, tutti i gruppi', valore: 'arresta la cabina in discesa a velocità nominale con 1,25·Q',
    riferimento: 'UNI EN 81-20:2020, 5.9.2.2.2.1', fonte: letto(T20, 'p. 100'), stato: 'confermato',
    costanti: ['loadTestFactor'], verifiche: ['b_all'],
  },
  {
    id: 'freno.singolo', gruppo: 'freno', titolo: 'Freno, un solo gruppo', valore: 'rallenta, arresta e tiene la cabina con portata in discesa e la cabina vuota in salita',
    riferimento: 'UNI EN 81-20:2020, 5.9.2.2.2.1; UNI 10411-1:2024, 14.1 a)', fonte: `${letto(T20, 'p. 100')}; ${letto(U1, 'p. 13')}`, stato: 'confermato',
    verifiche: ['b_one', 'b_up'],
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
    riferimento: 'UNI EN 81-20:2020, 5.9.2.2.2.1 (non oltre il paracadute o l\'urto sugli ammortizzatori); 1 gn in 5.6.2.1.3 e 5.8.2; '
      + 'con il freno come organo d\'arresto, 1 gn anche in 5.6.6.3 (ACOP) e 5.6.7.6 (UCM)',
    fonte: letto(T20, 'pp. 81, 98–100'), stato: 'derivazione',
    costanti: ['brakeDecelMax'], verifiche: ['b_amax'],
    nota: 'La norma non dà un numero per il freno: ne confronta la decelerazione media con quella del paracadute e dell\'urto sugli '
      + 'ammortizzatori, che hanno 1 gn come limite. Il confronto vero è con i dati dei componenti montati.',
  },
];
