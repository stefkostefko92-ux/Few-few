// The shaft registry's entries of a modification that changes the loads (round 48: split from norme-vert.ts, kept in
// their place in VOCI_VERT): the existing sling under a new car or rated load (arcata.ts), and the changed ratio of the
// suspended loads under UNI 10411-1 6.1 — D.1, the stability against slipping, and D.2, the specific pressure in the
// grooves (lift/rapporto.ts); round 52, the ropes of a modification under UNI 10411-1 as the owner's rope sheet checks
// them (lift/funi-modello.ts). In our words, with the clause numbers and values only.
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
    nota: 'gola a V con sottosquadro: la D.2 non ha una formula; il maggiore dei due valori è una scelta del software (voce gole.pressione), '
      + 'da confermare con il soggetto della verifica',
  },
  {
    id: 'funi.modello.z', gruppo: 'carichi', titolo: 'Funi della modifica (UNI 10411-1) come nel foglio funi: coefficiente di sicurezza z',
    valore: `nella modifica secondo la UNI 10411-1 con funi o argano sostituiti, carico o velocità variati, z = carico di rottura minimo / tiro della fune `
      + `più caricata (cabina con la portata al piano più basso, funi e mezza massa della compensazione) almeno ${K.sfMin3} con tre o più funi, `
      + `${K.sfMin2} con due, solo con la pressione specifica della D.2 verificata (voce funi.modello.d1d2): allora sostituisce il coefficiente S_f `
      + 'della UNI EN 81-50, 5.12, che non viene conteggiato; con la D.2 non verificata vale S_f',
    riferimento: 'UNI EN 81-20:2020, 5.5.2.2; UNI 10411-1:2024, 14.1 c) e d)', fonte: `${letto('UNI EN 81-20:2020', 'pp. 74–75')}; ${letto('UNI 10411-1:2024', 'p. 13')}`,
    stato: 'confermato', verifiche: ['fm_z'], rifFuoriNorma: 'UNI 10411-1:2024, 14.1 c) e d) (verifica della sola UNI 10411-1)',
    nota: 'come il foglio funi della relazione tecnica (rt2.funi.*); calcolo con le masse della compensazione e del cavo flessibile del foglio',
  },
  {
    id: 'funi.modello.d1d2', gruppo: 'carichi', titolo: 'Funi della modifica (UNI 10411-1) come nel foglio funi: D.1 e D.2',
    valore: 'nella stessa modifica della voce funi.modello.z, la D.1 nei suoi due casi (cabina in basso con 1,25·Q, cabina vuota in alto), con C1 '
      + 'mai sotto il minimo della fascia di velocità, la compensazione e il cavo flessibile nei tiri: esito il caso peggiore, (T1/T2)·C1·C2 al '
      + 'massimo e^(f·α); la D.2 con la cabina caricata con la portata, p al massimo il limite (12,5 + 4·v_c)/(1 + v_c) per il fattore del foglio '
      + '(voce rt2.funi.d2). Solo con il rapporto tra i carichi come documentato (con il rapporto cambiato contano la D.1 e la D.2 delle voci '
      + 'rapporto.d1 e rapporto.d2): la D.1 non soddisfatta è «Attenzione», la D.2 decide solo tra z e S_f (voce funi.modello.z) e il suo esito è '
      + 'un’informazione',
    riferimento: 'UNI 10411-1:2024, D.1 e D.2', fonte: letto('UNI 10411-1:2024', 'pp. 33–34'), stato: 'confermato',
    verifiche: ['fm_d1', 'fm_d2'], rifFuoriNorma: 'UNI 10411-1:2024, D.1 e D.2 (verifica della sola UNI 10411-1)',
    nota: 'il foglio funi calcola la D.1 e la D.2 sempre e le dice «non verificate» anche dove la 6.1 non le chiede: corretto in avviso e informazione',
  },
  {
    id: 'funi.modello.comp', gruppo: 'carichi', titolo: 'Funi della modifica (UNI 10411-1) come nel foglio funi: puleggia tenditrice della compensazione',
    valore: 'con funi di compensazione, il diametro primitivo della puleggia tenditrice almeno 30 volte quello della fune di compensazione '
      + '(voce rt2.funi.comp); le catene non hanno questa verifica',
    riferimento: 'UNI EN 81-20:2020, 5.5.6.2 c)', fonte: letto('UNI EN 81-20:2020', 'p. 76'), stato: 'confermato',
    verifiche: ['fm_comp'], rifFuoriNorma: 'UNI EN 81-20:2020, 5.5.6.2 c) (verifica del foglio funi della UNI 10411-1)',
  },
];
