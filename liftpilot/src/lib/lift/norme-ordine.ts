// Registry of what the bill of materials and the draft order of the machine take from the design (src/lib/prices/,
// src/lib/order/): the ropes' cut length, the machine below with its sheave through the wall, the protections against
// the car's overspeed upward and its uncontrolled movement, the machine's hand, the rules of the bill. Entries of
// VOCI_IMPIANTO, kept apart for the size of norme.ts and spread there at its end; the constant goes into KL. Italian
// texts, clause numbers and values only. Pure.
import { letto } from '@/calc/norme-fonti';
import { SHAFT_MOUNTS } from '@/lib/catalog/mounting';
import { RAIL_LENGTH } from '@/shaft/brackets';
import type { VoceImpianto } from './norme';

export const KL_ORDINE = {
  // each traction rope is cut this much longer than its length on the pulleys, for the two terminations and the
  // adjustment, then rounded up to the metre [m] (site practice)
  ropeEnds: 1,
  // the machine below beside the shaft: its gearbox's face this far from the wall the slow shaft goes through [mm]
  faceGap: 50,
} as const;

const it = (x: number): string => String(x).replace('.', ',');

/** The lowest static load a long-shaft variant's sheet gives (its longest shaft) [kg]. */
function minLoad(key: string): number {
  const b = SHAFT_MOUNTS[key]?.byLength ?? [];
  return b.length ? Math.min(...b) : 0;
}

export const VOCI_ORDINE: readonly VoceImpianto[] = [
  {
    id: 'impianto.funi.taglio', titolo: 'Lunghezza di taglio delle funi di sospensione',
    valore: 'per ogni fune la lunghezza misurata sul progetto da attacco ad attacco con la cabina al piano più basso, su tutte le pulegge '
      + '(puleggia di frizione, rinvio, pulegge in testata della macchina in basso, pulegge della taglia 2:1: tratti rettilinei e archi '
      + `di avvolgimento), più ${it(KL_ORDINE.ropeEnds)} m per i due attacchi e la regolazione, arrotondata al metro superiore; un calcolo fatto `
      + 'da un progetto del vano la misura sulla geometria di quel progetto con il suo argano; senza il progetto del vano (sostituzione '
      + 'dell’argano) la lunghezza è taglia × (corsa + 2 × tratto oltre la corsa) più deviazione o rinvii. La stessa lunghezza nel foglio 1, '
      + 'nella distinta, nella bozza d’ordine e nella massa delle funi dei carichi sulla macchina; le funi che il collaudo lascia al loro posto '
      + 'il foglio 1 le dà come esistenti (la loro massa nei carichi resta a quella lunghezza)',
    riferimento: '—', fonte: 'prassi di cantiere: la fune si taglia più lunga e si accorcia all’attacco; da misurare in sito prima del taglio',
    stato: 'prassi', costanti: ['ropeEnds'],
    nota: 'fino a LIFT 1.28.0 e ROOM 1.12.0 il foglio 1 dava la formula arrotondata al metro più vicino, i carichi la formula e la '
      + 'distinta la geometria senza aggiunta: con la macchina in basso circa 3 m di differenza per fune',
  },
  {
    id: 'impianto.basso.albero', titolo: 'Macchina in basso accanto al vano: albero lento prolungato',
    valore: 'con la macchina nel locale accanto al vano (rinvii in testata o locale pulegge) la puleggia di frizione sta nel vano, sull’albero '
      + 'lento che attraversa il muro: la proposta da un catalogo e il confronto tra SICOR e Montanari prendono solo le varianti ad albero '
      + 'lungo (SICOR LS, Montanari AL) o con supporto esterno (SICOR TS, Montanari S e i modelli con supporto, GEM L e CL, FAER P58F), con '
      + `il carico statico ammesso con l’albero più lungo della scheda (SICOR SH140LS ${minLoad('SICOR SH140LS')} kg, SH160LS `
      + `${minLoad('SICOR SH160LS')} kg) o, se la scheda ne dà uno solo, quello del catalogo; un argano standard scelto per nome non si prende `
      + '(lo schermo lo dice e nomina le varianti del costruttore). La bozza d’ordine riporta il piano medio della puleggia dalla faccia del '
      + 'muro verso il vano (la distanza dei rami dalla parete della voce impianto.basso.schema più metà del pacco funi), il muro '
      + `attraversato, lo sbalzo minimo dalla faccia del riduttore a ${KL_ORDINE.faceGap} mm dal muro e il supporto esterno; l’allungamento `
      + 'dell’albero rispetto al disegno del costruttore solo per un argano disegnato com’è che non sia già la variante ad albero lungo. Con '
      + 'la macchina sotto la fossa vale ogni argano',
    riferimento: 'ricerca, capitolo 17 §2.1 (SICOR LS: carico statico per lunghezza dell’albero A e quota B) e §3 (Montanari AL e S)',
    fonte: 'brochure SICOR Geared 2026, pp. 59 e 69; schede Montanari M73, M75, M93 e M98 (documenti del costruttore); scelta del software',
    stato: 'da_verificare', costanti: ['faceGap'],
    nota: 'come le quote A e B delle schede corrispondono allo sbalzo del progetto non è detto: il carico statico ammesso per lo sbalzo '
      + 'indicato va confermato con il costruttore prima dell’ordine. Nel calcolatore della sostituzione, che non conosce lo schema, la '
      + 'macchina in basso è presa accanto al vano',
  },
  {
    id: 'impianto.acop.ucm', titolo: 'Protezioni ACOP e UCM nella bozza d’ordine e nella distinta',
    valore: 'impianto nuovo (UNI EN 81-20/50): la bozza d’ordine chiede come si realizzano la protezione contro la sovravelocità in salita '
      + 'e quella contro i movimenti incontrollati, con l’organo d’arresto su cabina, contrappeso, funi, puleggia di frizione o albero della '
      + 'puleggia sostenuto in due soli punti — mai il freno sull’albero del motore di un argano con riduttore —: freno sull’albero lento o '
      + 'sulla puleggia certificato, bloccafuni certificato, oppure paracadute di cabina bidirezionale con il rilevamento dei movimenti '
      + 'incontrollati nel quadro; il numero del certificato di esame UE del tipo e i microinterruttori di controllo del freno; la '
      + 'distinta conta un dispositivo. Modifica con l’argano sostituito: la bozza chiede che le protezioni esistenti continuino a '
      + 'funzionare e, senza UCM conforme, il controllo dell’apertura del freno; con la UNI 10411-11 la distinta conta il loro adeguamento',
    riferimento: 'UNI EN 81-20:2020, 5.6.6.2, 5.6.6.4, 5.6.6.11, 5.6.7.3, 5.6.7.4, 5.6.7.13 e 6.3.11–6.3.13; UNI 10411-1:2024, 14.4 c), '
      + 'd) e g); UNI 10411-11:2024, 14.3 a) e b), appendice A (14)',
    fonte: `${letto('UNI EN 81-20:2020', 'pp. 89–93')}; ${letto('UNI 10411-1:2024', 'p. 14')}; ${letto('UNI 10411-11:2024', 'p. 12')}; `
      + 'scelta del software (le righe dell’ordine e della distinta)',
    stato: 'scelta',
    nota: 'la soluzione la sceglie il progettista con il costruttore: il software non verifica l’organo d’arresto né lo spazio d’arresto',
  },
  {
    id: 'ordine.esecuzione', titolo: 'Esecuzione dell’argano (destra o sinistra) nella bozza d’ordine',
    valore: 'dalla geometria del progetto: guardando l’argano dal lato della puleggia, destra se il motore sta a destra, sinistra se sta a '
      + 'sinistra, come lo disegnano la pianta del locale, il piano della macchina in basso e il 3D (girato di 180° resta della stessa mano); '
      + 'il lato del motore è quello della forma dell’argano (lo SICOR SV110, a vite verticale, ha il motore dall’altra parte dell’asse della '
      + 'puleggia rispetto agli argani a vite orizzontale e all’argano generico); '
      + 'senza la geometria (calcolo senza progetto del vano) la casella resta da segnare',
    riferimento: '—', fonte: 'scelta del software: la convenzione di destra e sinistra cambia tra i costruttori', stato: 'scelta',
    nota: 'la mano segnata va confermata con lo schema di esecuzione del costruttore prima dell’ordine',
  },
  {
    id: 'impianto.distinta', titolo: 'Distinta dei materiali del progetto',
    valore: `guide in barre da ${RAIL_LENGTH / 1000} m (per guida le barre dal fondo della fossa alla soletta, l’ultima tagliata, o il primo `
      + 'accorciato quando l’ultima resterebbe più corta del minimo della voce guide.staffe) con una giunzione tra due barre; funi alla '
      + 'lunghezza di taglio (voce impianto.funi.taglio) con due attacchi a cuneo con molla per fune; fune del limitatore come nel foglio 1; '
      + 'paracadute di cabina del tipo dei dati dell’impianto (senza dato progressivo, come nel foglio 1); due pattini per guida di cabina e '
      + 'di contrappeso; in taglia 2:1 la puleggia della cabina e quella del contrappeso, l’arcata e il contrappeso per la taglia 2:1 e '
      + 'due attacchi fissi sotto la soletta; con la macchina in basso le pulegge in testata '
      + 'con il loro telaio e il basamento dell’argano ancorato contro il sollevamento netto della prova; nella modifica secondo UNI 10411 '
      + 'solo le parti che il collaudo indica come sostituite (le altre restano, come nel foglio 1) e la manodopera a corpo',
    riferimento: 'UNI EN 81-20:2020, 5.5.5.1 (uguagliamento automatico delle tensioni almeno a un’estremità delle funi)',
    fonte: `${letto('UNI EN 81-20:2020', 'p. 75')}; scelta del software (le quantità)`, stato: 'scelta',
  },
];
