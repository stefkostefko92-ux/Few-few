// Registry of the calculation model (UNI EN 81-50:2020, 5.11.3) and of the limits of its validity: the entries of the
// group 'modello' of VOCI, kept apart for the size of norme.ts and spread there at their place. Same form as norme.ts;
// Italian texts, clause numbers and values only.
import type { Voce } from './norme';
import { letto } from './norme-fonti';

const T20 = 'UNI EN 81-20:2020', T50 = 'UNI EN 81-50:2020';

export const VOCI_MODELLO: readonly Voce[] = [
  {
    id: 'modello.g', gruppo: 'modello', titolo: 'Accelerazione di gravità', valore: 'g = 9,81 m/s² (anche come limite di 1 g)',
    riferimento: 'UNI EN 81-20:2020, 5.2.1.8.5 (g_n = 9,81 m/s²)', fonte: letto(T20, 'p. 27'), stato: 'confermato',
    costanti: ['g', 'brakeDecelMax'],
  },
  {
    id: 'modello.percorso', gruppo: 'modello', titolo: 'Tiri con il metodo del percorso della fune',
    valore: 'masse per lato, funi di ogni tratto con il fattore (r² + 2)/3, inerzia delle pulegge di rinvio e, nella sospensione indiretta 1:2, delle pulegge di '
      + 'cabina e di contrappeso (termine III); attrito di guide e pulegge trascurato in aderenza',
    riferimento: 'UNI EN 81-50:2020, 5.11.3', fonte: letto(T50, 'pp. 43–44'), stato: 'confermato',
    verifiche: ['tr_load', 'tr_dn', 'tr_up', 'tr_real', 'tr_stall'],
    nota: 'Il fattore (r² + 2)/3 vale esattamente r nella sospensione diretta e nell’indiretta 1:2, le sole del software.',
  },
  {
    id: 'modello.percorso.pulegge', gruppo: 'modello', titolo: 'Pulegge di cabina e di contrappeso nella sospensione indiretta 1:2',
    valore: 'una puleggia per lato, con l’inerzia J_p e il diametro D_p delle pulegge di rinvio: massa ridotta J_p/R_p², con l’accelerazione '
      + 'della cabina divisa per r, nei tiri e nell’inerzia riportata al motore',
    riferimento: 'UNI EN 81-50:2020, 5.11.3 (termine III)', fonte: `${letto(T50, 'pp. 43–44')}; numero e inerzia delle pulegge: scelta del software`,
    stato: 'scelta',
    verifiche: ['tr_dn', 'tr_up', 'tr_real'],
    nota: 'La velocità della fune rispetto all’asse della puleggia di cabina è quella della cabina: la massa ridotta è J_p/R_p². Con più pulegge '
      + 'o pulegge diverse da quelle di rinvio, l’ingegnere inserisce l’inerzia equivalente.',
  },
  {
    id: 'modello.percorso.msr1', gruppo: 'modello', titolo: 'Macchina in basso: tratto tra la macchina e le pulegge in testata',
    valore: 'con l’accelerazione a della cabina, come stampato nella norma; nella sospensione indiretta 1:2 il software mostra anche l’esito con r·a, '
      + 'l’accelerazione fisica di quel tratto: «Attenzione» se supera il limite, mai «Non soddisfatta»',
    riferimento: 'UNI EN 81-50:2020, 5.11.3 (MSR1)', fonte: letto(T50, 'p. 44'), stato: 'confermato',
    verifiche: ['tr_dn', 'tr_up', 'tr_msr1'],
    nota: 'Il testo stampa a in entrambe le edizioni; nella sospensione diretta le due forme coincidono.',
  },
  {
    id: 'modello.velocita', gruppo: 'modello', titolo: 'Velocità nominale e compensazione',
    valore: 'oltre 1,75 m/s i mezzi di compensazione senza tensionamento vanno guidati vicino all’ansa («Attenzione»); oltre 3 m/s servono '
      + 'funi di compensazione con puleggia tenditrice, che il modello non contiene («Non soddisfatta»: fuori dal campo del software)',
    riferimento: 'UNI EN 81-20:2020, 5.5.6.1 a)–d)', fonte: letto(T20, 'p. 76'), stato: 'confermato',
    costanti: ['vCompGuided', 'vCompRopes'], verifiche: ['v_comp'],
  },
  {
    id: 'modello.velocita.minima', gruppo: 'modello', titolo: 'Velocità nominale minima: campo dell’ascensore',
    valore: 'velocità nominale oltre 0,15 m/s; a 0,15 m/s o meno l’apparecchio è fuori dal campo di applicazione della UNI EN 81-20 (1.3 a) 2)), '
      + 'della Direttiva 2014/33/UE (art. 1 par. 2 a)) e del DPR 162/1999 (art. 1 c.3 a), testo vigente) e il software non lo calcola né lo '
      + 'progetta: il campo è segnato e il calcolo o il progetto non si salva',
    riferimento: 'UNI EN 81-20:2020, 1.3 a) 2); DPR 162/1999 e s.m.i., art. 1 c.3 lett. a); Direttiva 2014/33/UE, art. 1 par. 2 lett. a)',
    fonte: `${letto(T20, 'p. 15')}; DPR 162/1999 e Direttiva 2014/33/UE: testi ufficiali (ricerca, cap. 16, §2 e §4.6)`, stato: 'confermato',
    costanti: ['vRatedMin'],
    nota: 'nella modifica di un ascensore messo in servizio prima della Direttiva Ascensori le clausole citate non fissano da sole il limite (la '
      + 'UNI EN 81-20 vale per gli impianti nuovi, la UNI 10411-1 non pone una velocità minima nel suo campo): lì il limite è una scelta del software',
  },
  {
    id: 'modello.compensazione', gruppo: 'modello', titolo: 'Compensazione e cavo flessibile', valore: 'non modellati a parte: la loro massa sul lato cabina entra in P',
    riferimento: 'UNI EN 81-50:2020, 5.11.3', fonte: 'limite del modello attuale', stato: 'scelta',
    nota: 'Nella 5.11.3 la massa della compensazione (0,5·H ± y) e del cavo (0,25·H ± 0,5·y) dipende dalla posizione della cabina e c’è '
      + 'anche sul lato del contrappeso; il software la tiene costante dentro P. Con catene o funi di compensazione il modello non vale.',
  },
  {
    id: 'modello.sensibilita', gruppo: 'modello', titolo: 'Analisi di sensibilità', valore: 'P ±10%; k ±0,05 se il carico di equilibrio non è misurato',
    riferimento: '—', fonte: 'scelta del software (incertezza tipica del rilievo)', stato: 'scelta',
    costanti: ['sensP', 'sensK'],
  },
];
