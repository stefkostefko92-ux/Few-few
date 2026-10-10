// Registry of the traction sheave's grooves (UNI EN 81-50:2020, 5.11.2.3.1): the entries of the group 'gole' of VOCI,
// kept apart for the size of norme.ts and spread there at their place. Same form as norme.ts; Italian texts, clause
// numbers and values only.
import type { Voce } from './norme';
import { letto } from './norme-fonti';

const T50 = 'UNI EN 81-50:2020', U1 = 'UNI 10411-1:2024';
const U = `${T50}, 5.11.2.3.1.1`, V = `${T50}, 5.11.2.3.1.2`;

export const VOCI_GOLE: readonly Voce[] = [
  {
    id: 'gole.fattore.U', gruppo: 'gole', titolo: 'Fattore di gola, semicircolare con o senza sottosquadro',
    valore: 'f = μ·4·(cos(γ/2) − sin(β/2)) / (π − β − γ − sin β + sin γ); senza sottosquadro β = 0',
    riferimento: 'UNI EN 81-50:2020, 5.11.2.3.1.1', fonte: letto(T50, 'pp. 40–41'), stato: 'confermato',
    verifiche: ['tr_load', 'tr_dn', 'tr_up', 'tr_stall'], rifGola: { U, UU: U },
  },
  {
    id: 'gole.fattore.V', gruppo: 'gole', titolo: 'Fattore di gola a V',
    valore: 'non temprata, al caricamento e in frenatura: f = μ·4·(1 − sin(β/2)) / (π − β − sin β); temprata, e ogni gola a V con il '
      + 'contrappeso o la cabina bloccati: f = μ / sin(γ/2)',
    riferimento: 'UNI EN 81-50:2020, 5.11.2.3.1.2', fonte: letto(T50, 'p. 41'), stato: 'confermato',
    verifiche: ['tr_load', 'tr_dn', 'tr_up', 'tr_stall'], rifGola: { VH: V, VN: V },
    nota: 'la norma dà f = μ / sin(γ/2) per il contrappeso bloccato; il software la usa anche per la cabina bloccata nella posizione più bassa (5.11.2.2.3)',
  },
  {
    id: 'gole.limite.beta', gruppo: 'gole', titolo: 'Limite del sottosquadro', valore: 'β ≤ 105° (1,83 rad; oltre: «Non soddisfatta»)',
    riferimento: 'UNI EN 81-50:2020, 5.11.2.3.1.1 e 5.11.2.3.1.2', fonte: letto(T50, 'pp. 40–41'), stato: 'confermato',
    costanti: ['betaMax'], verifiche: ['g_geom'], rifGola: { UU: U, VN: V },
    nota: 'fino alla versione 1.1.0 del motore il limite era 106°, il valore raccomandato della UNI EN 81-1:2008 (M.2.2.1.1)',
  },
  {
    id: 'gole.raccomandazione.beta', gruppo: 'gole', titolo: 'Sottosquadro raccomandato', valore: 'β ≤ 90° (oltre: «Attenzione»)',
    riferimento: '—', fonte: 'Montanari, documento tecnico del costruttore', stato: 'scelta',
    costanti: ['betaRecommended'], verifiche: ['g_geom'],
  },
  {
    id: 'gole.limite.gamma', gruppo: 'gole', titolo: 'Angolo minimo della gola a V', valore: 'γ ≥ 35° (sotto: «Non soddisfatta»)',
    riferimento: 'UNI EN 81-50:2020, 5.11.2.3.1.2', fonte: `${letto(T50, 'p. 41')}; Montanari consiglia 35–40°`, stato: 'confermato',
    costanti: ['gammaMin'], verifiche: ['g_geom'], rifGola: { VH: V, VN: V },
  },
  {
    id: 'gole.limite.gamma.U', gruppo: 'gole', titolo: 'Angolo minimo della gola semicircolare',
    valore: 'γ ≥ 25° (0,44 rad; sotto: «Attenzione»: la norma lo raccomanda, non lo impone)',
    riferimento: 'UNI EN 81-50:2020, 5.11.2.3.1.1', fonte: letto(T50, 'pp. 40–41'), stato: 'confermato',
    costanti: ['gammaMinU'], verifiche: ['g_geom'], rifGola: { U, UU: U },
  },
  {
    id: 'gole.pressione', gruppo: 'gole', titolo: 'Pressione specifica nelle gole',
    valore: 'p = T/(n·d·D) · 8·cos(β/2)/(π − β − sin β) nella gola semicircolare (β = 0 senza sottosquadro), p = T/(n·d·D) · 4,5/sin(γ/2) nella '
      + 'gola a V, nella gola a V con sottosquadro il maggiore dei due; T tiro statico delle funi lato cabina alla puleggia di frizione, con la '
      + 'cabina al piano più basso con la portata; p ≤ (12,5 + 4·v_c)/(1 + v_c), v_c velocità delle funi alla velocità nominale: entro il limite '
      + 'informazione, oltre «Attenzione»',
    riferimento: 'UNI 10411-1:2024, appendice D.2 e 14.1 c)–d)', fonte: `${letto(U1, 'pp. 13 e 34')}`, stato: 'confermato',
    costanti: ['pressBase', 'pressSpeed', 'pressU', 'pressV'], verifiche: ['g_press'], rifVerifica: { g_press: `${U1}, appendice D.2` },
    // tested to another standard, the software still reports the pressure by this formula
    rifFuoriNorma: `${U1}, appendice D.2 (formula)`,
    nota: 'obbligatoria solo quando i coefficienti di sicurezza minimi 12 e 16 sostituiscono il calcolo della UNI EN 81-50:2020, 5.12 (UNI '
      + '10411-1:2024, 14.1 c)–d)): il software calcola S_f secondo la 5.12 e riporta la pressione come informazione, come fa il progettista '
      + 'per l’organismo di verifica; la gola a V con sottosquadro non ha una formula nella D.2 (il maggiore dei due è una scelta del software)',
  },
];
