// Registry of the ropes (UNI EN 81-20:2020, 5.5; UNI EN 81-50:2020, 5.12): the entries of the group 'funi' of VOCI,
// kept apart for the size of norme.ts and spread there at their place. Same form as norme.ts; Italian texts, clause
// numbers and values only.
import type { Voce } from './norme';

export const VOCI_FUNI: readonly Voce[] = [
  {
    id: 'funi.Dd', gruppo: 'funi', titolo: 'Rapporto D/d della puleggia di trazione', valore: 'D/d ≥ 40',
    riferimento: 'UNI EN 81-20:2020, 5.5.2.1', fonte: 'ELA 2026 e fonti concordi', stato: 'confermato',
    costanti: ['ddMin'], verifiche: ['r_dd'],
  },
  {
    id: 'funi.Dpd', gruppo: 'funi', titolo: 'Rapporto D/d delle pulegge di rinvio', valore: 'Dp/d ≥ 40',
    riferimento: 'UNI EN 81-20:2020, 5.5.2.1', fonte: 'fonti secondarie', stato: 'da_verificare',
    costanti: ['ddMin'], verifiche: ['r_ddp'],
  },
  {
    id: 'funi.numero', gruppo: 'funi', titolo: 'Numero minimo di funi', valore: 'almeno 2 funi indipendenti, ciascuna con il suo attacco',
    riferimento: 'DPR 162/1999, All. I 1.3 (Direttiva 2014/33/UE, All. I); UNI EN 81-20:2020, 5.5',
    fonte: 'DPR 162/1999 consolidato (Normattiva), letto il 2026-10-02, e Direttiva 2014/33/UE nel testo ufficiale italiano (EUR-Lex, fornito '
      + 'dal cliente), letto il 2026-10-04 (ricerca, cap. 16): All. I 1.3', stato: 'confermato',
    costanti: ['ropesMin'], verifiche: ['r_nd'],
  },
  {
    id: 'funi.diametro', gruppo: 'funi', titolo: 'Diametro nominale minimo', valore: 'd ≥ 8 mm (salvo approvazione di un organismo notificato)',
    riferimento: 'UNI EN 81-20:2020, 5.5', fonte: 'fonti secondarie', stato: 'da_verificare',
    costanti: ['ropeDiameterMin'], verifiche: ['r_nd'],
  },
  {
    id: 'funi.Sf.minimo', gruppo: 'funi', titolo: 'Coefficiente di sicurezza minimo', valore: '12 con tre o più funi; 16 con due funi',
    riferimento: 'UNI EN 81-20:2020, 5.5', fonte: 'fonti secondarie', stato: 'da_verificare',
    costanti: ['sfMin3', 'sfMin2'], verifiche: ['r_sfa'],
  },
  {
    id: 'funi.Sf.formula', gruppo: 'funi', titolo: 'Coefficiente di sicurezza richiesto S_f',
    valore: 'S_f = 10^[2,6834 − log10(695,85·10^6·N_equiv/(D/d)^8,567) / log10(77,09·(D/d)^−2,894)]',
    riferimento: 'UNI EN 81-50:2020, 5.12 (ex EN 81-1 Allegato N)', fonte: 'riprodotto su due casi pubblicati (liftdesign.it S_f 16,69; Mellor)', stato: 'confermato',
    costanti: ['sfC0', 'sfC1', 'sfE1', 'sfC2', 'sfE2'], verifiche: ['r_sfa'],
  },
  {
    id: 'funi.Nequiv.pulegge', gruppo: 'funi', titolo: 'N_equiv delle pulegge', valore: 'N_equiv(p) = K_p·(N_ps + 4·N_pr), K_p = (D/Dp)^4',
    riferimento: 'UNI EN 81-50:2020, 5.12', fonte: 'fonti secondarie', stato: 'da_verificare',
    costanti: ['kpExponent', 'reverseBendWeight'], verifiche: ['r_sfa'],
    nota: 'Da confermare anche quando una flessione conta come inversa (distanza tra le pulegge): oggi la classifica il progettista.',
  },
  {
    id: 'funi.Nequiv.gola', gruppo: 'funi', titolo: 'N_equiv(t) della gola',
    valore: 'U senza sottosquadro 1 · U con sottosquadro: β 75° 2,5; 80° 3,0; 85° 3,8; 90° 5,0; 95° 6,7; 100° 10,0; 105° 15,2 · '
      + 'V: γ 35° 18,5; 36° 16,0; 38° 12,0; 40° 10,0; 42° 8,0; 45° 6,5; 50° 5,0',
    riferimento: 'UNI EN 81-50:2020, 5.12.2.2, tabella 2', fonte: 'BS EN 81-50:2020, estratto pubblico del testo, p. 55 (i valori della gola a V '
      + 'differiscono da quelli della EN 81-1)', stato: 'confermato',
    costanti: ['neqU', 'neqV'], verifiche: ['r_sfa'],
  },
  {
    id: 'funi.Nequiv.gola.interpolazione', gruppo: 'funi', titolo: 'Angoli tra i punti della tabella di N_equiv(t)',
    valore: 'interpolazione lineare tra i due punti vicini', riferimento: 'UNI EN 81-50:2020, 5.12.2.2',
    fonte: 'BS EN 81-50:2020, estratto pubblico del testo, p. 55 (la norma consente l\'interpolazione lineare)', stato: 'confermato',
    verifiche: ['r_sfa'],
  },
  {
    id: 'funi.Nequiv.gola.estremi', gruppo: 'funi', titolo: 'Angoli fuori dalla tabella di N_equiv(t)',
    valore: 'U: sotto 75° il valore di 75°, oltre 105° estrapolazione dall\'ultimo tratto, segnalata · V: oltre 50° il valore di 50°',
    riferimento: 'UNI EN 81-50:2020, 5.12.2.2', fonte: 'scelta prudente del software (la tabella si ferma a quegli angoli; N_equiv cresce '
      + 'con β e cala con γ, quindi il valore dell\'estremo sta dal lato della sicurezza)', stato: 'scelta',
    verifiche: ['r_sfa'],
  },
  {
    id: 'funi.Tmax', gruppo: 'funi', titolo: 'Tiro massimo per fune', valore: 'cabina con portata ferma al piano più basso; con la macchina in basso sul primo tratto verso la testata',
    riferimento: 'UNI EN 81-50:2020, 5.12', fonte: 'definizione di EN 81-1 da fonte secondaria', stato: 'da_verificare',
    verifiche: ['r_sfa'],
  },
  {
    id: 'funi.stima', gruppo: 'funi', titolo: 'Stima di carico di rottura e massa delle funi', valore: '8×19 Seale anima tessile 1570 N/mm²: 8 mm = 30,4 kN e 0,215 kg/m, poi in proporzione a d²',
    riferimento: '—', fonte: 'tabella Pfeifer 8×19S NFC; usata solo con il pulsante di stima e nella proposta libera', stato: 'stima',
  },
];
