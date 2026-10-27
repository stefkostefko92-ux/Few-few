// The entries of the RT after the owner's model (round 52): every number of KR2 and of the areas' own registries
// (norme-<area>.ts, one per component group) and every check of its pages, with the clause and the value in our words —
// the checklist for the engineer (scripts/lista-verifica.ts) and the test (rt2-norme.test.ts) read them. Clause
// numbers and values only, never a text of a standard. Pure.
import { KR2, type VoceRt2 } from './norme';
import { VOCI_AMM } from './norme-amm';
import { VOCI_CQPL } from './norme-cqpl';
import { VOCI_GUIDE } from './norme-guide';

const it = (x: number): string => String(x).replace('.', ',');
const T20 = 'UNI EN 81-20:2020', U1 = 'UNI 10411-1:2024';
const MODELLO = 'modello Excel del titolare (RT-E MOD 10411-1, foglio «Funi»)';

export const VOCI_FUNI_RT2: readonly VoceRt2[] = [
  {
    id: 'rt2.funi.d1.a', area: 'funi', titolo: 'Decelerazione «a» della D.1 secondo il modello',
    valore: `a = ${KR2.d1Bande.map(([v, a]) => `${it(a)} m/s² fino a ${it(v)} m/s`).join(', ')}; oltre, o con la decelerazione ridotta scelta, ${it(KR2.d1Ridotta)} m/s² — `
      + 'C1 = (g + a)/(g − a) mai sotto il minimo della fascia di velocità',
    riferimento: `${U1}, D.1`, fonte: MODELLO, stato: 'prassi', costanti: ['d1Bande', 'd1Ridotta'], verifiche: ['funi.d1Basso', 'funi.d1Alto'],
    nota: 'Il modello usa i minimi di C1 della D.1 come decelerazioni: C1 risulta sopra il minimo in ogni fascia (a favore di sicurezza). '
      + 'Con la decelerazione ridotta il modello scendeva sotto il minimo: corretto.',
  },
  {
    id: 'rt2.funi.d2.fattore', area: 'funi', titolo: 'Limite della pressione specifica secondo il modello',
    valore: `p_lim = ${it(KR2.pressioneFattore)} × (12,5 + 4·v_c)/(1 + v_c)`, riferimento: `${U1}, D.2`, fonte: MODELLO, stato: 'prassi',
    costanti: ['pressioneFattore'], verifiche: ['funi.d2'],
    nota: 'Il fattore del modello rende il limite più severo dell’1,9 % rispetto alla D.2; la formula stampata lo riporta.',
  },
  {
    id: 'rt2.funi.cavi', area: 'funi', titolo: 'Cavo flessibile nella tensione lato cabina in alto',
    valore: `massa ${it(KR2.caviMassa)} kg/m su metà corsa, per g (il modello la sommava senza g: corretto)`, riferimento: `${U1}, D.1`,
    fonte: MODELLO, stato: 'prassi', costanti: ['caviMassa'], verifiche: ['funi.d1Alto'],
  },
  {
    id: 'rt2.funi.comp', area: 'funi', titolo: 'Rapporto D/d della puleggia tenditrice della compensazione',
    valore: `D/d ≥ ${it(KR2.compDd)} con funi di compensazione (le catene non hanno verifica)`, riferimento: `${T20}, 5.5.6`,
    fonte: MODELLO, stato: 'da_verificare', costanti: ['compDd'], verifiche: ['funi.compDd'],
    nota: 'Valore del modello; il punto della norma va confermato sul testo in vigore.',
  },
];

/** Every entry of the RT after the model (the areas' are appended as they are written). */
export const VOCI_RT2: readonly VoceRt2[] = [...VOCI_FUNI_RT2, ...VOCI_CQPL, ...VOCI_GUIDE, ...VOCI_AMM];
