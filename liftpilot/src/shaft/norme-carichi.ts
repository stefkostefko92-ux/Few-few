// The shaft registry's entries of a modification that changes the loads (round 48: split from norme-vert.ts, kept in
// their place in VOCI_VERT): the existing sling under a new car or rated load (arcata.ts), and the changed ratio of the
// suspended loads under UNI 10411-1 6.1 — D.1, the stability against slipping, and D.2, the specific pressure in the
// grooves (lift/rapporto.ts). In our words, with the clause numbers and values only.
import { K } from '../calc/norme';
import { letto } from '../calc/norme-fonti';
import type { VoceVano } from './norme';

export const VOCI_CARICHI: readonly VoceVano[] = [
  {
    id: 'arcata.carichi', gruppo: 'carichi', titolo: 'Arcata esistente sotto la cabina nuova o la portata nuova: verifica per i nuovi carichi',
    valore: 'nella modifica che lascia l’arcata esistente e cambia la cabina o la portata, T* (cabina con arcata, porte e operatore più la portata) '
      + 'e la portata si confrontano con i carichi documentati: se vanno oltre i limiti (con la UNI 10411-1 T* o la portata oltre il prospetto 1, con '
      + 'la UNI 10411-11 qualunque aumento di T*) o non si possono confrontare perché i carichi documentati mancano, l’arcata va verificata per i '
      + 'nuovi carichi con i dati del suo costruttore o il calcolo del tecnico; il software non ha il modello dell’arcata: «Attenzione» senza valore. '
      + 'Con T* che diminuisce valgono gli ammortizzatori e il paracadute progressivo per i nuovi carichi (verifiche del carico nell’esito)',
    riferimento: 'UNI 10411-1:2024, 6.1 e 6.9; UNI 10411-11:2024, 6.1, 6.9 e 22',
    fonte: `${letto('UNI 10411-1:2024', 'pp. 7–8')}; ${letto('UNI 10411-11:2024', 'pp. 7–8 e 15')}`, stato: 'confermato',
    verifiche: ['sl_frame'],
    nota: 'la UNI 10411-11:2024 (6.1) esclude la 6.9 quando aumenta solo il carico lato contrappeso; con l’arcata sostituita la verifica non si fa',
  },
  {
    id: 'rapporto.d1', gruppo: 'carichi', titolo: 'Rapporto tra i carichi cambiato (UNI 10411-1): stabilità allo scorrimento delle funi',
    valore: 'nella modifica secondo la UNI 10411-1 il cui rapporto tra i carichi lato cabina e lato contrappeso cambia rispetto a quello documentato '
      + '(voce impianto.variazione.carico), la condizione della D.1 con i valori della voce modifica.d1 del calcolo, nei suoi due casi: esito '
      + 'l’utilizzo (T1/T2)·C1·C2 / e^(f·α) del caso più sfavorevole, al massimo 1; con la UNI 10411-11 o con il rapporto che resta la verifica non c’è. '
      + 'Con la D.1 servono la D.2 (pressione specifica, voce rapporto.d2) e gli ammortizzatori secondo la UNI EN 81-20, 5.8',
    riferimento: 'UNI 10411-1:2024, 6.1 e D.1', fonte: letto('UNI 10411-1:2024', 'pp. 6–7 e 33'), stato: 'confermato',
    verifiche: ['tr_d1'], rifFuoriNorma: 'UNI 10411-1:2024, 6.1 e D.1 (verifica della sola UNI 10411-1)',
    nota: 'con l’esito, come informazione, la decelerazione a cui equivale il C1 minimo della fascia e quella limite fino a cui la condizione '
      + 'regge (voce modifica.d1), da confrontare con la prova del freno; l’esito non cambia',
  },
  {
    id: 'rapporto.d2', gruppo: 'carichi', titolo: 'Rapporto tra i carichi cambiato (UNI 10411-1): pressione specifica delle funi nelle gole',
    valore: 'nella stessa modifica della voce rapporto.d1 (rapporto tra i carichi cambiato secondo la UNI 10411-1), accanto alla D.1, la pressione '
      + 'specifica della D.2 con la cabina al piano più basso caricata con la portata, con la formula e i valori della voce gole.pressione: '
      + `p ≤ (${String(K.pressBase).replace('.', ',')} + ${K.pressSpeed}·v_c)/(1 + v_c) N/mm², con v_c la velocità delle funi alla velocità `
      + 'nominale; esito soddisfatta o non soddisfatta (fuori da questa modifica la pressione resta un valore da dichiarare, g_press). Con la '
      + 'UNI 10411-11 o con il rapporto che resta la verifica non c’è',
    riferimento: 'UNI 10411-1:2024, 6.1 e D.2', fonte: letto('UNI 10411-1:2024', 'pp. 6–7 e 34'), stato: 'confermato',
    verifiche: ['tr_d2'], rifFuoriNorma: 'UNI 10411-1:2024, 6.1 e D.2 (verifica della sola UNI 10411-1)',
  },
];
