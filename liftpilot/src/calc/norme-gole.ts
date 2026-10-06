// Registry of the traction sheave's grooves (UNI EN 81-50:2020, 5.11.2.3.1): the entries of the group 'gole' of VOCI,
// kept apart for the size of norme.ts and spread there at their place. Same form as norme.ts; Italian texts, clause
// numbers and values only.
import type { Voce } from './norme';
import { letto } from './norme-fonti';

const T50 = 'UNI EN 81-50:2020';

export const VOCI_GOLE: readonly Voce[] = [
  {
    id: 'gole.fattore.U', gruppo: 'gole', titolo: 'Fattore di gola, semicircolare con o senza sottosquadro',
    valore: 'f = μ·4·(cos(γ/2) − sin(β/2)) / (π − β − γ − sin β + sin γ); senza sottosquadro β = 0',
    riferimento: 'UNI EN 81-50:2020, 5.11.2.3.1.1', fonte: letto(T50, 'pp. 40–41'), stato: 'confermato',
    verifiche: ['tr_load', 'tr_dn', 'tr_up', 'tr_stall'],
  },
  {
    id: 'gole.fattore.V', gruppo: 'gole', titolo: 'Fattore di gola a V',
    valore: 'non temprata, al caricamento e in frenatura: f = μ·4·(1 − sin(β/2)) / (π − β − sin β); temprata, e ogni gola a V con il '
      + 'contrappeso o la cabina bloccati: f = μ / sin(γ/2)',
    riferimento: 'UNI EN 81-50:2020, 5.11.2.3.1.2', fonte: letto(T50, 'p. 41'), stato: 'confermato',
    verifiche: ['tr_load', 'tr_dn', 'tr_up', 'tr_stall'],
    nota: 'la norma dà f = μ / sin(γ/2) per il contrappeso bloccato; il software la usa anche per la cabina bloccata nella posizione più bassa (5.11.2.2.3)',
  },
  {
    id: 'gole.limite.beta', gruppo: 'gole', titolo: 'Limite del sottosquadro', valore: 'β ≤ 105° (1,83 rad; oltre: KO)',
    riferimento: 'UNI EN 81-50:2020, 5.11.2.3.1.1 e 5.11.2.3.1.2', fonte: letto(T50, 'pp. 40–41'), stato: 'confermato',
    costanti: ['betaMax'], verifiche: ['g_geom'],
    nota: 'fino alla versione 1.1.0 del motore il limite era 106°, il valore raccomandato della UNI EN 81-1 (M.2.2.1)',
  },
  {
    id: 'gole.raccomandazione.beta', gruppo: 'gole', titolo: 'Sottosquadro raccomandato', valore: 'β ≤ 90° (oltre: «Attenzione»)',
    riferimento: '—', fonte: 'Montanari, documento tecnico del costruttore', stato: 'scelta',
    costanti: ['betaRecommended'], verifiche: ['g_geom'],
  },
  {
    id: 'gole.limite.gamma', gruppo: 'gole', titolo: 'Angolo minimo della gola a V', valore: 'γ ≥ 35° (sotto: KO)',
    riferimento: 'UNI EN 81-50:2020, 5.11.2.3.1.2', fonte: `${letto(T50, 'p. 41')}; Montanari consiglia 35–40°`, stato: 'confermato',
    costanti: ['gammaMin'], verifiche: ['g_geom'],
  },
  {
    id: 'gole.limite.gamma.U', gruppo: 'gole', titolo: 'Angolo minimo della gola semicircolare',
    valore: 'γ ≥ 25° (0,44 rad; sotto: «Attenzione»: la norma lo raccomanda, non lo impone)',
    riferimento: 'UNI EN 81-50:2020, 5.11.2.3.1.1', fonte: letto(T50, 'pp. 40–41'), stato: 'confermato',
    costanti: ['gammaMinU'], verifiche: ['g_geom'],
  },
];
