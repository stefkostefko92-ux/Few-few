// Registry of the ropes (UNI EN 81-20:2020, 5.5; UNI EN 81-50:2020, 5.12): the entries of the group 'funi' of VOCI,
// kept apart for the size of norme.ts and spread there at their place. Same form as norme.ts; Italian texts, clause
// numbers and values only.
import type { Voce } from './norme';
import { letto } from './norme-fonti';

const T20 = 'UNI EN 81-20:2020', T50 = 'UNI EN 81-50:2020', U1 = 'UNI 10411-1:2024';

export const VOCI_FUNI: readonly Voce[] = [
  {
    id: 'funi.Dd', gruppo: 'funi', titolo: 'Rapporto D/d della puleggia di frizione', valore: 'D/d ≥ 40',
    riferimento: 'UNI EN 81-20:2020, 5.5.2.1', fonte: letto(T20, 'p. 74'), stato: 'confermato',
    costanti: ['ddMin'], verifiche: ['r_dd'],
  },
  {
    id: 'funi.Dpd', gruppo: 'funi', titolo: 'Rapporto D/d delle pulegge di rinvio', valore: 'Dp/d ≥ 40',
    riferimento: 'UNI EN 81-20:2020, 5.5.2.1; UNI 10411-1:2024, 14.3', fonte: `${letto(T20, 'p. 74')}; ${letto(U1, 'p. 14')}`, stato: 'confermato',
    costanti: ['ddMin'], verifiche: ['r_ddp'],
    nota: 'Il limite vale per ogni puleggia (5.5.2.1), mentre Dp è uno solo e nel calcolo di N_equiv(p) è la media delle pulegge di rinvio '
      + '(UNI EN 81-50:2020, 5.12.2.3): con pulegge di diametro diverso si controlla la più piccola.',
  },
  {
    id: 'funi.numero', gruppo: 'funi', titolo: 'Numero minimo di funi', valore: 'almeno 2 funi indipendenti, ciascuna con il suo attacco',
    riferimento: 'DPR 162/1999, All. I 1.3 (Direttiva 2014/33/UE, All. I); UNI EN 81-20:2020, 5.5',
    fonte: 'DPR 162/1999 consolidato (Normattiva), letto il 2026-10-02, e Direttiva 2014/33/UE nel testo ufficiale italiano (EUR-Lex, fornito '
      + 'dal cliente), letto il 2026-10-04 (ricerca, cap. 16): All. I 1.3', stato: 'confermato',
    costanti: ['ropesMin'], verifiche: ['r_nd'],
    nota: 'Con 2 sole funi serve anche il dispositivo contro l’allungamento anomalo (voce funi.due): il software lo ricorda, non lo verifica.',
  },
  {
    id: 'funi.due', gruppo: 'funi', titolo: 'Cabina appesa a due funi', valore: 'con 2 funi un dispositivo elettrico di sicurezza (5.11.2) ferma la '
      + 'macchina se una fune si allunga in modo anomalo rispetto all’altra (informazione)',
    riferimento: 'UNI EN 81-20:2020, 5.5.5.3 a); UNI EN 81-1:2008, 9.5.3', fonte: `${letto(T20, 'p. 76')}; ${letto('UNI EN 81-1:2008', 'p. 56')}`,
    stato: 'confermato',
    // the clause of the old standard is the same rule, not the check's source
    costanti: ['ropesMin'], verifiche: ['r_two'], rifVerifica: { r_two: `${T20}, 5.5.5.3 a)` },
  },
  {
    id: 'funi.trattenuta', gruppo: 'funi', titolo: 'Funi trattenute nelle gole', valore: 'un fermo dove le funi entrano ed escono dalla puleggia e '
      + 'almeno uno intermedio se più di 60° dell’arco di avvolgimento sono sotto l’orizzontale per l’asse e l’avvolgimento supera 120°: '
      + 'con la macchina in basso le funi avvolgono la puleggia da sotto; con il rinvio un avvolgimento oltre 180° scende sotto l’orizzontale di '
      + 'altrettanto (informazione)',
    riferimento: 'UNI EN 81-20:2020, 5.5.7.2', fonte: letto(T20, 'pp. 77–78'), stato: 'confermato',
    costanti: ['retainWrap', 'retainBelow'], verifiche: ['g_retain'],
  },
  {
    id: 'funi.diametro', gruppo: 'funi', titolo: 'Diametro nominale minimo', valore: 'd ≥ 8 mm',
    riferimento: 'UNI EN 81-20:2020, 5.5.1.2 a)', fonte: letto(T20, 'p. 74'), stato: 'confermato',
    costanti: ['ropeDiameterMin'], verifiche: ['r_nd'],
  },
  {
    id: 'funi.Sf.minimo', gruppo: 'funi', titolo: 'Coefficiente di sicurezza minimo', valore: '12 con tre o più funi; 16 con due funi',
    riferimento: 'UNI EN 81-20:2020, 5.5.2.2 a)–b); UNI 10411-1:2024, 14.1 c)–d)', fonte: `${letto(T20, 'pp. 74–75')}; ${letto(U1, 'p. 13')}`,
    stato: 'confermato', costanti: ['sfMin3', 'sfMin2'], verifiche: ['r_sfa'],
    nota: 'Con la trazione vale anche il valore calcolato secondo la UNI EN 81-50:2020, 5.12 (il maggiore dei due). Con la UNI 10411-1:2024 '
      + '(14.1) 12 e 16 possono sostituire quel calcolo solo con la verifica della pressione nelle gole (appendice D.2).',
  },
  {
    id: 'funi.Sf.formula', gruppo: 'funi', titolo: 'Coefficiente di sicurezza richiesto S_f',
    valore: 'S_f = 10^[2,6834 − log10(695,85·10^6·N_equiv/(D/d)^8,567) / log10(77,09·(D/d)^−2,894)]',
    riferimento: 'UNI EN 81-50:2020, 5.12.3 (ex UNI EN 81-1:2008, appendice N)', fonte: `${letto(T50, 'p. 46')}; riprodotto anche su due casi pubblicati (liftdesign.it S_f 16,69; Mellor)`, stato: 'confermato',
    costanti: ['sfC0', 'sfC1', 'sfE1', 'sfC2', 'sfE2'], verifiche: ['r_sfa'],
  },
  {
    id: 'funi.Nequiv.pulegge', gruppo: 'funi', titolo: 'N_equiv delle pulegge', valore: 'N_equiv(p) = K_p·(N_ps + 4·N_pr), K_p = (D/Dp)^4',
    riferimento: 'UNI EN 81-50:2020, 5.12.2.3', fonte: letto(T50, 'p. 46'), stato: 'confermato',
    costanti: ['kpExponent', 'reverseBendWeight'], verifiche: ['r_sfa'],
    nota: 'D: diametro della puleggia di frizione; Dp: media delle altre pulegge. La flessione è inversa solo tra due pulegge consecutive '
      + 'ad assi fissi, con i punti di contatto a meno di 200·d e i piani di flessione ruotati di oltre 120°: la classifica il progettista.',
  },
  {
    id: 'funi.Nequiv.gola', gruppo: 'funi', titolo: 'N_equiv(t) della gola',
    valore: 'U senza sottosquadro 1 · U con sottosquadro: β 75° 2,5; 80° 3,0; 85° 3,8; 90° 5,0; 95° 6,7; 100° 10,0; 105° 15,2 · '
      + 'V: γ 35° 18,5; 36° 16,0; 38° 12,0; 40° 10,0; 42° 8,0; 45° 6,5; 50° 5,0',
    riferimento: 'UNI EN 81-50:2020, 5.12.2.2, prospetto 2', fonte: `${letto(T50, 'p. 46')} (i valori della gola a V differiscono da quelli `
      + 'della UNI EN 81-1:2008, prospetto N.1)', stato: 'confermato',
    costanti: ['neqU', 'neqV'], verifiche: ['r_sfa'],
  },
  {
    id: 'funi.Nequiv.gola.VN', gruppo: 'funi', titolo: 'N_equiv(t) della gola a V con sottosquadro',
    valore: 'il maggiore tra il valore per β (riga a U con sottosquadro) e quello per γ (riga a V)',
    riferimento: 'UNI EN 81-50:2020, 5.12.2.2, prospetto 2', fonte: `${letto(T50, 'p. 46')} (il prospetto non ha una riga per questa gola)`,
    stato: 'scelta',
    verifiche: ['r_sfa'],
    nota: 'Scelta dal lato della sicurezza; la UNI EN 81-1:2008 (prospetto N.1) intitola la riga con sottosquadro «U/V»: con una macchina '
      + 'secondo quella norma l’ingegnere può prendere il valore di β.',
  },
  {
    id: 'funi.Nequiv.gola.interpolazione', gruppo: 'funi', titolo: 'Angoli tra i punti della tabella di N_equiv(t)',
    valore: 'interpolazione lineare tra i due punti vicini', riferimento: 'UNI EN 81-50:2020, 5.12.2.2',
    fonte: letto(T50, 'p. 46'), stato: 'confermato',
    verifiche: ['r_sfa'],
  },
  {
    id: 'funi.Nequiv.gola.estremi', gruppo: 'funi', titolo: 'Angoli fuori dalla tabella di N_equiv(t)',
    valore: 'U: sotto 75° il valore di 75°, oltre 105° estrapolazione dall’ultimo tratto, segnalata · V: oltre 50° il valore di 50°',
    riferimento: 'UNI EN 81-50:2020, 5.12.2.2', fonte: 'scelta prudente del software (la tabella si ferma a quegli angoli; N_equiv cresce '
      + 'con β e cala con γ, quindi il valore dell’estremo sta dal lato della sicurezza)', stato: 'scelta',
    verifiche: ['r_sfa'],
  },
  {
    id: 'funi.Tmax', gruppo: 'funi', titolo: 'Tiro massimo per fune', valore: 'cabina con portata ferma al piano più basso; con la macchina in basso sul primo tratto verso la testata',
    riferimento: 'UNI EN 81-20:2020, 5.5.2.2 (definizione); UNI EN 81-50:2020, 5.12.1', fonte: letto(T20, 'pp. 74–75'), stato: 'confermato',
    verifiche: ['r_sfa'],
    nota: 'Con la macchina in basso il tiro sul primo tratto verso la testata è una derivazione del software.',
  },
  {
    id: 'funi.stima', gruppo: 'funi', titolo: 'Stima di carico di rottura e massa delle funi', valore: '8×19 Seale anima tessile 1570 N/mm²: 8 mm = 30,4 kN e 0,215 kg/m, poi in proporzione a d²',
    riferimento: '—', fonte: 'tabella Pfeifer 8×19S NFC; usata solo con il pulsante di stima e nella proposta libera', stato: 'stima',
  },
];
