// Registry of the drive and of the sheave's shaft: the entries of the groups 'azionamento' and 'albero' of VOCI, kept
// apart for the size of norme.ts and spread there at their place. Same form as norme.ts; Italian texts, clause numbers
// and values only.
import type { Voce } from './norme';
import { letto } from './norme-fonti';

const T20 = 'UNI EN 81-20:2020', U1 = 'UNI 10411-1:2024';

export const VOCI_AZIONAMENTO: readonly Voce[] = [
  {
    id: 'azionamento.rendimento.inverso', gruppo: 'azionamento', titolo: 'Rendimento inverso del riduttore se non dato', valore: 'η_i ≈ 2 − 1/η_d (0 = irreversibile)',
    riferimento: '—', fonte: 'approssimazione della teoria della vite senza fine', stato: 'stima',
    verifiche: ['tr_real', 'b_amax'],
    nota: 'Da sostituire con il valore del costruttore: la decelerazione reale del freno ne dipende molto.',
  },
  {
    id: 'azionamento.accelerazione', gruppo: 'azionamento', titolo: 'Coppia di accelerazione', valore: '≤ 2 volte la coppia nominale (oltre: «Attenzione»; nella proposta: criterio di scelta del motore)',
    riferimento: '—', fonte: 'scelta del software; il limite vero è quello di motore e inverter', stato: 'scelta',
    costanti: ['accelTorqueRatioMax'], verifiche: ['d_ratio'],
  },
  {
    id: 'azionamento.margine', gruppo: 'azionamento', titolo: 'Soglia di attenzione sui limiti del costruttore', valore: 'oltre il 98% del limite di catalogo (albero, coppia in uscita) → «Attenzione»',
    riferimento: '—', fonte: 'scelta del software', stato: 'scelta',
    costanti: ['nearLimit'], verifiche: ['s_shaft', 'd_mp'],
  },
  {
    id: 'azionamento.potenza', gruppo: 'azionamento', titolo: 'Potenza statica del motore', valore: 'P_st = ΔF·v_f / (η_d·η_vano) ≤ P_n, con ΔF il maggiore tra cabina carica in salita dal basso e vuota in discesa dall’alto; '
      + 'con la macchina più veloce della nominale (v_reale > v_f) P_st per v_reale/v_f: il motore sotto la frequenza base è limitato dalla coppia '
      + '(M_st ≤ M_n); con un argano di catalogo il motore si sceglie con il rapporto del catalogo, non con quello ideale',
    riferimento: '—', fonte: 'derivazione', stato: 'derivazione',
    verifiche: ['d_pst'],
    nota: 'fino al motore 1.4.0 la proposta da catalogo teneva il motore scelto con il rapporto ideale della griglia: con un rapporto del catalogo più '
      + 'veloce la potenza alla coppia statica poteva superare il motore proposto',
  },
  {
    id: 'azionamento.coppia.uscita', gruppo: 'azionamento', titolo: 'Coppia massima in uscita dal riduttore',
    valore: 'M_p il maggiore tra: accelerazione, ΔF·D/2 + J·i·α_m (cabina con la portata in salita, vuota in discesa); frenatura di emergenza con il '
      + 'freno reale (tutti i gruppi; anche la prova di aderenza con 1,25·Q in discesa, in basso), |T1 − T2|·D/2 + J_s·r·a/(D/2) nel caso più '
      + 'gravoso, l’inerzia della puleggia dal lato del lento sommata a '
      + 'quella delle funi (a favore di sicurezza); prova con 1,25·Q, |T1 − T2|·D/2; confrontata con il valore di catalogo se inserito; al '
      + 'costruttore si chiede il maggiore arrotondato per eccesso a 10 N·m',
    riferimento: 'dato del costruttore; i casi delle verifiche di aderenza (UNI EN 81-50:2020, 5.11.2.2.1 e 5.11.2.2.2; UNI EN 81-20:2020, 6.3.3 b))', fonte: 'derivazione', stato: 'derivazione',
    verifiche: ['d_mp'],
    nota: 'fino al motore 1.4.0 la coppia contava solo l’accelerazione: in frenatura di emergenza con il freno reale la coppia sull’albero lento è '
      + 'di solito la maggiore (nell’esempio della revisione 1,9 volte)',
  },
  {
    id: 'azionamento.tolleranza.velocita', gruppo: 'azionamento', titolo: 'Tolleranza tra velocità reale e nominale',
    valore: 'con metà portata a metà corsa, in salita e in discesa, non oltre il 5 % sopra la nominale (buona pratica: non oltre l\'8 % sotto); '
      + 'non verificata: il software mostra la velocità reale e la frequenza per la nominale',
    riferimento: 'UNI EN 81-20:2020, 5.9.2.4; UNI 10411-1:2024, 15.1', fonte: `${letto(T20, 'p. 102')}; ${letto(U1, 'p. 14')}`, stato: 'confermato',
    nota: 'Con la UNI 10411-1:2024 (15.1) una velocità oltre il 5 % sopra la maggiore tra quella del libretto e quella dopo il passaggio a 50 Hz '
      + 'è un aumento della velocità nominale (punti 15.2–15.15). Con la UNI 10411-11:2024 (15) ogni cambio della velocità nominale, in più o in '
      + 'meno, porta ai punti 15 a)–k) e alla valutazione 4.3.',
  },
];

export const VOCI_ALBERO: readonly Voce[] = [
  {
    id: 'albero.carico', gruppo: 'albero', titolo: 'Carico sull’albero della puleggia', valore: 'risultante dei tiri con 1,25·Q al piano più basso, confrontata con il limite del costruttore',
    riferimento: 'dato del costruttore; 1,25·Q come nella verifica di caricamento (UNI EN 81-50:2020, 5.11.2.2.1)',
    fonte: 'derivazione; la definizione del carico va confermata con il costruttore', stato: 'derivazione',
    costanti: ['loadTestFactor'], verifiche: ['s_shaft'],
  },
  {
    id: 'albero.sollevamento', gruppo: 'albero', titolo: 'Sollevamento netto sugli ancoraggi (macchina in basso)',
    valore: 'alla prova con 1,25·Q la risultante dei tiri verso l’alto meno la massa della macchina; con la portata Q la risultante per il '
      + 'coefficiente dinamico dei carichi sull’edificio (voce carichi.macchina) meno la massa della macchina, che non si moltiplica; la massa è '
      + 'quella del calcolo (per un argano di catalogo quella del catalogo, il limite inferiore), a favore di sicurezza; per tirafondi e '
      + 'ancoranti il maggiore dei due, da verificare con il progettista strutturale',
    riferimento: 'UNI EN 81-20:2020, 5.2.1.8.1 e appendice E.1 (informativa)', fonte: `derivazione; ${letto(T20, 'pp. 26, 148')}`, stato: 'derivazione',
    verifiche: ['s_uplift'],
    nota: 'fino a LIFT 1.28.0 il foglio 1 e la relazione davano solo il valore statico alla prova con 1,25·Q, senza il coefficiente dinamico che lo '
      + 'stesso foglio applica ai carichi sulla soletta',
  },
];
