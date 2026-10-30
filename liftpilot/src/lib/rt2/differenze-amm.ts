// The differences of the buffer pages from the owner's model (round 52, sheets «Amm. a molla / in autan / idraulici»,
// cabin and CWT): every place where the model contradicts the standard, is unsafe or gives a wrong number or verdict,
// what the model does and what LiftPilot does — the list the owner's decision asks for. Ids as in the spec of the area
// (X cross-sheet, S spring, A autan, H hydraulic; T our texts). Clause numbers only, never a text of a standard. Pure.

interface DifferenzaAmm {
  id: string;
  componente: string;
  modello: string;
  correzione: string;
  norma?: string;
}

const AMB = 'Ammortizzatori di cabina e del contrappeso';
const T20 = 'UNI EN 81-20:2020', T50 = 'UNI EN 81-50:2020';

export const DIFFERENZE_AMM: readonly DifferenzaAmm[] = [
  {
    id: 'X1', componente: AMB,
    modello: 'Senza velocità nominale la velocità vale 0: la corsa minima è 0 e ogni ammortizzatore con f > 65 mm risulta «OK»; con VVVF e la '
      + 'velocità precedente vuota la molla è verificata a 0 m/s anche con la velocità nuova inserita.',
    correzione: 'La velocità nominale dopo la modifica viene dal Calcolo argano ed è richiesta (maggiore di 0): senza, le verifiche non sono '
      + 'soddisfatte e la relazione non si emette.',
    norma: `${T20}, 5.8.2.1.1.1 e 5.8.2.2.1`,
  },
  {
    id: 'X2', componente: AMB,
    modello: 'Tre fogli per lato, ognuno con il suo «Numero ammortizzatori» (e due «Freccia massima»); due tipi si possono abilitare insieme '
      + 'per lo stesso lato e sono stampati entrambi.',
    correzione: 'Un solo tipo e un solo numero di ammortizzatori per lato (il primo campo «tipo»).',
  },
  {
    id: 'X3', componente: AMB,
    modello: 'Nessun limite di velocità per molle e autan: le molle 78.025–78.028, RC01713 e RC01714 passano la verifica della corsa fino a '
      + '1,01–1,12 m/s, una molla «altro» a ogni velocità.',
    correzione: 'Ammortizzatori ad accumulo di energia (molle e autan) solo fino a 1 m/s di velocità nominale; oltre, la verifica non è soddisfatta.',
    norma: `${T20}, 5.8.1.5`,
  },
  {
    id: 'X5', componente: AMB,
    modello: 'La pagina non stampa il modello dell’ammortizzatore né l’esito delle verifiche (fuori dall’area di stampa).',
    correzione: 'La pagina stampa il modello del catalogo («Modello:») e l’esito di ogni verifica sulla riga del suo valore.',
  },
  {
    id: 'X6', componente: AMB,
    modello: 'Le verifiche senza ramo «altrimenti» danno FALSO invece di «NO!» (molla e idraulici con f < fmin, molla con rapporto ≤ 2,5).',
    correzione: 'Ogni verifica è soddisfatta o non soddisfatta.',
  },
  {
    id: 'S1', componente: AMB,
    modello: 'Corsa della molla accettata solo con f > 65 mm (estremo escluso); la pagina stampa solo «fmin = 135 v2».',
    correzione: 'f ≥ 135·v² mm e f ≥ 65 mm, estremi compresi; la pagina aggiunge «e comunque non minore di 65 mm».',
    norma: `${T20}, 5.8.2.1.1.1`,
  },
  {
    id: 'S2', componente: AMB,
    modello: 'Rapporto dei carichi con gli estremi esclusi, stampato «2,5 < Fadm/Fris < 4:».',
    correzione: 'Estremi compresi, stampato «2,5 ≤ Fadm/Fris ≤ 4:».',
    norma: `${T20}, 5.8.2.1.1.2`,
  },
  {
    id: 'S4', componente: AMB,
    modello: 'Con azionamento VVVF e velocità nuova oltre il 105 % della precedente la molla è verificata con la velocità precedente (gli '
      + 'idraulici con la nuova).',
    correzione: 'Ogni tipo è verificato con la velocità nominale dopo la modifica, la stessa del Calcolo argano e di tutto il fascicolo.',
    norma: `${T20}, 5.8.2.1.1.1`,
  },
  {
    id: 'S5', componente: AMB,
    modello: 'Due elenchi di molle con una priorità nascosta (dati a mano, poi elenco DONATI / CMM, poi elenco principale); le voci vuote o «-» '
      + 'danno zero e #DIV/0! sulla pagina.',
    correzione: 'Un solo elenco (elenco principale, DONATI / CMM, «altro»); le righe senza dati non sono offerte; senza scelta la relazione non si emette.',
  },
  {
    id: 'S6', componente: AMB,
    modello: 'La riga «78.026 Centoducati» ha 14,25 spire attive: la formula dà f = 169,9 mm e Fadm = 14037 N, oltre la corsa (153,4 mm) e il '
      + 'carico massimo (11840 N) dello stesso catalogo.',
    correzione: '15,25 spire, il valore che dà la corsa, la costante (7,72 daN/mm) e il carico massimo della riga: f = 153,4 mm, Fadm = 11843 N.',
    norma: `${T20}, 5.8.2.1.1.2`,
  },
  {
    id: 'H1', componente: AMB,
    modello: 'Il «Numero ammortizzatori» degli idraulici è vuoto (Fris = #DIV/0! stampato); quello di molle e autan vale 2 (cabina) o 1 '
      + '(contrappeso) senza dirlo.',
    correzione: 'Numero richiesto per ogni tipo, proposto (e mostrato come proposta) 2 per la cabina e 1 per il contrappeso.',
  },
  {
    id: 'H2', componente: AMB,
    modello: 'Rallentamento «CON» come valore iniziale: corsa minima 0,5 × 0,0674·v² fino a 4 m/s e 0,333 × oltre, senza minimo assoluto, '
      + 'su sola dichiarazione.',
    correzione: 'Proposto «SENZA»; con «CON» la corsa si riduce solo oltre 2,5 m/s, calcolata con la velocità di contatto garantita dal controllo '
      + '(0,0674·vi²), mai meno di 420 mm né più della corsa piena, con l’avviso di documentare il controllo del rallentamento; 50 %, un terzo e '
      + '540 mm sono della UNI EN 81-1:1998 (10.4.3.2), non della UNI EN 81-20:2020.',
    norma: `${T20}, 5.8.2.2.2 e 5.12.1.3`,
  },
  {
    id: 'H3', componente: AMB,
    modello: 'Agli ammortizzatori idraulici si applica anche f > 65 mm, regola delle sole molle.',
    correzione: 'Solo f ≥ fmin.',
    norma: `${T20}, 5.8.2.2.1`,
  },
  {
    id: 'H4', componente: AMB,
    modello: 'Il catalogo idraulico dà «carico [kg]» minimo e massimo e «v nom», ma il foglio non verifica né le masse né la velocità.',
    correzione: 'Massa su ogni ammortizzatore (cabina vuota e a pieno carico, o contrappeso) entro il campo del certificato e 1,15·v entro la sua '
      + 'velocità d’urto; per i modelli del catalogo, senza i dati del certificato, 300–2000 kg e 1,15 volte la seconda cifra di «v nom».',
    norma: `${T20}, 5.8.2.2.3; ${T50}, 5.5.4`,
  },
  {
    id: 'H5', componente: AMB,
    modello: 'Le voci «-» e vuote dell’elenco idraulico danno f = 0 (pagina con 0 mm, esito «NO!» non stampato).',
    correzione: 'Non sono offerte.',
  },
  {
    id: 'A1', componente: AMB,
    modello: 'Il foglio autan non calcola nulla: i dati inseriti non sono letti, l’esito è sempre «NO!» o FALSO e la pagina dice solo «Caratteristiche '
      + 'ammortizzatori come da certificato allegato».',
    correzione: 'Velocità nominale fino a 1 m/s, 1,15·v entro la velocità d’urto del certificato e massa su ogni ammortizzatore entro il suo campo; la '
      + 'pagina stampa modello, numero, freccia, carico linearizzato e le verifiche.',
    norma: `${T20}, 5.8.1.5 e 5.8.2.1.2.1; ${T50}, 5.5.4`,
  },
  {
    id: 'T1', componente: AMB,
    modello: 'Etichetta «Modulo elesatico G:».',
    correzione: '«Modulo elastico G:» (refuso).',
  },
  {
    id: 'T2', componente: AMB,
    modello: 'Il passo della molla del contrappeso è stampato in formato «Generale» (quello della cabina con due decimali).',
    correzione: 'Due decimali per entrambi.',
  },
  {
    id: 'T3', componente: AMB,
    modello: 'Il carico statico risultante degli idraulici («Fris:») è stampato senza unità.',
    correzione: 'Stampato con «N».',
  },
];
