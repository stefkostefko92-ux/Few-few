// The standards an acceptance test can name, as the documents present them (research/argano-geared, chapter 16, read on
// 2026-10-02): the citation that gives (or not) the presumption of conformity, where a standard can be added to the base
// one (the compatibility matrix, §5.2: to a new lift — or one tested as new — or to a modification) and the points the
// engineer checks on site, with their clause and value in our words — never the standards' text (CEN-CENELEC and UNI
// copyright; the laws are paraphrased). A point is `confermato` when read on the official text, `da_verificare` when it
// comes from a secondary source or an interpretation. And what DPR 162/1999 asks for a new lift and for a modification.
// Pure.
import type { Norma } from './collaudo';

/** A lift built or tested as new (N, NE), or a modification of an existing one (M). */
export type AmbitoNorma = 'nuovo' | 'modifica';

export interface PuntoInSito {
  rif: string;
  testo: string;
  stato: 'confermato' | 'da_verificare';
  /** where it was read, for the engineer's checklist (absent: research, chapter 16) */
  fonte?: string;
}

export interface NormaInfo {
  /** where it can be added to the base standard */
  ambiti: readonly AmbitoNorma[];
  /** its citation in the Official Journal, or what it is when it is not a harmonised standard */
  citazione: string;
  /** a warning for the documents (an edition that gives no presumption, a scope that excludes the lift) */
  avviso?: string;
  punti: readonly PuntoInSito[];
}

const ok = (rif: string, testo: string): PuntoInSito => ({ rif, testo, stato: 'confermato' });
// read on the standard's text (2026-10-06) or on the official text of DM 236/1989 (research/norme-ascensori/leggi)
const LETTO = 'testo della norma, letto il 2026-10-06 (punti e valori con parole nostre)', DM236 = 'testo ufficiale del DM 236/1989';
const lt = (rif: string, testo: string, fonte = LETTO): PuntoInSito => ({ rif, testo, stato: 'confermato', fonte });
const dv = (rif: string, testo: string): PuntoInSito => ({ rif, testo, stato: 'da_verificare' });
const BOTH: readonly AmbitoNorma[] = ['nuovo', 'modifica'], NEW: readonly AmbitoNorma[] = ['nuovo'], MOD: readonly AmbitoNorma[] = ['modifica'];
const D2023 = 'Decisione (UE) 2023/1646 (GU L 206 del 21/08/2023)', D2021 = 'Decisione (UE) 2021/1220 (GU L 267 del 27/07/2021)';

export const NORME_INFO: Readonly<Record<Norma, NormaInfo>> = {
  en81: {
    ambiti: MOD,
    citazione: 'Decisione (UE) 2021/76 (GU L 27 del 27/01/2021); valide come UNI fino al 23/07/2029. Le UNI EN ISO 8100-1/-2:2026 sono in vigore dal 23/07/2026 ma non risultano citate in GUUE (elenco del 26/11/2025)',
    punti: [
      ok('DPR 162/1999, All. V 3.3 (All. VIII 4)', 'prove dell\'organismo notificato: funzionamento a vuoto e a pieno carico, in mancanza di energia, prova statica a 1,25 volte la portata e controllo che non restino deformazioni'),
      ok('DPR 162/1999, All. VIII 3 e), g), h)', 'documentazione tecnica con i risultati dei calcoli di progetto, le relazioni sulle prove e l\'elenco delle norme armonizzate applicate, anche in parte'),
      ok('Regolamento (UE) 2023/1230, art. 51 par. 2', 'per gli ascensori dichiarati conformi dal 20/01/2027: requisiti dell\'All. III del Regolamento macchine (tra cui 1.1.9 e 1.2.1), con una valutazione aggiuntiva per i requisiti nuovi o cambiati'),
      // in sito, in our words, read on the texts the client supplied (2026-10-06); EN 81-50 also from its public extract
      lt('UNI EN 81-50:2020, 5.12.1 e 5.12.2.1', 'il metodo del coefficiente di sicurezza delle funi vale solo per pulegge di acciaio o ghisa e funi d\'acciaio secondo EN 12385-5; la flessione è semplice se il raggio della gola non supera 0,53 volte il diametro della fune: rilevare il materiale della puleggia e il raggio delle gole'),
      lt('UNI EN 81-20:2020, 5.6.2.2.1.2', 'tempo di risposta del limitatore di velocità: i suoi punti d\'intervento distano al massimo 250 mm di corsa della fune del limitatore'),
      lt('UNI EN 81-20:2020, 5.8.2.1.2.1 e 5.8.2.2.3', 'ammortizzatori (dato del fornitore): decelerazione non oltre 1 gn, sopra 2,5 gn al massimo per 0,04 s; per quelli ad accumulo non lineari anche picco non oltre 6 gn e rimbalzo non oltre 1 m/s'),
      lt('UNI EN 81-20:2020, 5.2.5.7.1', 'cartello sopra o accanto allo schermo del contrappeso (5.2.5.5.1) con il gioco massimo ammesso tra contrappeso e ammortizzatore con la cabina al piano più alto, per conservare gli spazi in testata'),
      lt('UNI EN 81-20:2020, 5.2.2.4', 'fossa più profonda di 2,50 m: porta di accesso; fino a 2,50 m porta di accesso oppure scala dentro il vano (appendice F)'),
      lt('UNI EN 81-20:2020, 5.2.1.5.1 b)', 'in fossa un commutatore di ispezione fisso, manovrabile da non oltre 0,30 m da uno spazio di rifugio'),
      lt('UNI EN 81-20:2020, 5.2.5.7.1 e 5.2.5.8.1', 'uno spazio di rifugio per ogni persona, tutti dello stesso tipo e senza sovrapposizioni; cartello con il numero di persone ammesse e la postura'),
      lt('UNI EN 81-20:2020, 5.2.1.4.1', 'illuminazione del vano: almeno 50 lux a 1 m sopra il tetto della cabina nella sua proiezione e a 1 m sopra il fondo della fossa dove si sta, si lavora o si passa tra le zone di lavoro; almeno 20 lux altrove'),
      lt('UNI EN 81-20:2020, 5.4.10.1 e 5.4.10.4', 'luce in cabina almeno 100 lux sui comandi e a 1 m dal pavimento; luce di emergenza di almeno 5 lux per un\'ora presso gli allarmi in cabina e sul tetto e al centro di cabina e tetto, a 1 m'),
      lt('UNI EN 81-20:2020, 5.4.4', 'materiali della cabina secondo EN 13501-1: pavimento Cfl-s2, pareti C-s2,d1, soffitto C-s2,d0'),
      lt('UNI EN 81-20:2020, 6.3.1', 'prova del freno: da solo ferma la cabina che scende a velocità nominale con il 125 % della portata; con un gruppo fuori servizio rallenta la cabina con la portata in discesa; con il carico tra (q − 0,1)·Q e (q + 0,1)·Q lo sblocco manuale fa partire la cabina da sola, altrimenti servono i mezzi della 5.9.2.2.2.9 b)'),
      lt('UNI EN 81-20:2020, 6.3.2', 'impianto elettrico: esame a vista, continuità dei conduttori di protezione, isolamento circuito per circuito con l\'elettronica scollegata, efficacia dell\'interruzione automatica in caso di guasto'),
      lt('UNI EN 81-20:2020, 6.3.3', 'aderenza: arresti con la frenatura più severa, in salita a cabina vuota nella parte alta e in discesa con il 125 % della portata verso il basso; con il contrappeso sugli ammortizzatori e la macchina in moto le funi slittano oppure la cabina non sale; bilanciamento come dichiarato'),
      lt('UNI EN 81-20:2020, 6.3.4, 6.3.5 e 6.3.7', 'paracadute di cabina in discesa (istantaneo con la portata a velocità nominale; progressivo, negli impianti a frizione, con il 125 % della portata a velocità nominale o inferiore), del contrappeso a cabina vuota; ammortizzatori ad accumulo compressi dalla cabina con la portata, a dissipazione provati alla velocità nominale (o a quella usata per la corsa ridotta); dopo, nessun danno all\'esame a vista'),
      lt('UNI EN 81-20:2020, 6.3.11, 6.3.12 e 6.3.13', 'ACOP: cabina vuota in salita a velocità non inferiore alla nominale, frenata solo dal dispositivo; livellamento verificato a ogni fermata e, al piano più sfavorevole, durante carico e scarico; UCM: cabina vuota verso l\'alto e piena verso il basso a una velocità prestabilita, con il movimento entro il limite della 5.6.7.5 e l\'autosorveglianza dove richiesta'),
      lt('UNI EN 81-20:2020, 6.3.14', 'cabina fuori dalla zona di sbloccaggio e porta di piano tenuta aperta di 100 mm: lasciata, la porta si richiude e si blocca'),
      lt('UNI EN 81-20:2020, C.2 e 7.3.2', 'la sostituzione della macchina o della puleggia di frizione è una trasformazione importante: si annota nel registro dell\'impianto, da aggiornare'),
      lt('UNI EN 81-20:2020, 5.3.5.3.2, 5.3.5.3.4, 5.3.6.2.2.1 b) e 5.3.15.2 b)', 'pannelli delle porte con i dispositivi di ritenuta e le prove a pendolo (morbido da 800 mm; rigido da 500 mm sui pannelli in vetro); sulle porte automatiche un dispositivo di protezione che copre da 25 a 1600 mm sopra la soglia e rileva ostacoli di 50 mm; fuori dalla zona di sbloccaggio la porta di cabina, spinta con 1000 N, non si apre più di 50 mm'),
      lt('UNI EN 81-20:2020, 5.3.6.2.2.1 a)–d)', 'porte scorrevoli automatiche: energia cinetica in chiusura non oltre 10 J alla velocità media (corsa senza 25 mm per estremità sulle porte centrali, 50 mm sulle laterali); con il dispositivo di protezione guasto o escluso e l\'impianto in servizio non oltre 4 J, con un segnale acustico a ogni chiusura; forza per trattenere la porta in chiusura non oltre 150 N fuori dal primo terzo della corsa, e la porta trattenuta si riapre'),
    ],
  },
  '10411-1': {
    ambiti: [], citazione: 'norma nazionale volontaria, in vigore dal 31/10/2024 (sostituisce la 2021); il DPR 162/1999 non la richiama',
    punti: [
      lt('UNI 10411-1:2024, scopo', 'impianti elettrici a frizione fuori dalla 95/16/CE e dalla 2014/33/UE; esclude le modifiche che cambiano le misure antincendio (per queste, a nostro giudizio, il DM 15/09/2005 o il Codice V.3)'),
      lt('UNI 10411-1:2024, 14.4 a)–g)', 'con la macchina nuova: temporizzatore del motore (EN 81-20 5.9.2.7); arresto in salita prima della velocità d\'intervento del limitatore; protezioni ACOP e UCM esistenti che continuano a funzionare; dispositivo d\'arresto presso la macchina (5.12.1.11.1 e)); pulegge nel locale secondo la 5.5.7; senza UCM e con la regolazione di velocità, macchinario senza alimentazione se il freno non si apre, con ripristino solo manuale'),
    ],
  },
  '10411-11': {
    ambiti: [], citazione: 'norma nazionale volontaria, in vigore dal 31/10/2024 (sostituisce UNI 10411-3:2016 e 10411-5:2017); il DPR 162/1999 non la richiama',
    punti: [
      lt('UNI 10411-11:2024, scopo', 'impianti elettrici a frizione marcati CE secondo la Direttiva; esclude le modifiche che cambiano le misure antincendio (per queste, a nostro giudizio, il DM 15/09/2005 o il Codice V.3)'),
      lt('UNI 10411-11:2024, 14.3 a) e App. A (14); UNI EN 81-20:2020, 5.6.6.2 e 5.6.7.3', 'cambiando la macchina: le protezioni UCM esistenti devono continuare a funzionare (14.3 a)); per l\'ACOP esistente l\'App. A (14) chiede una relazione sulla compatibilità della nuova macchina, oppure nuovi dispositivi con certificato di esame di tipo e dichiarazione di conformità; il freno della macchina vale come organo d\'arresto solo se ridondante e autocontrollato'),
      lt('UNI 10411-11:2024, 14.3 b)', 'senza UCM conforme alla 5.6.7 e con il rallentamento controllato: macchinario senza alimentazione se il freno non si apre, al più tardi all\'arrivo al piano, con ripristino solo manuale'),
    ],
  },
  'en81-21': {
    ambiti: NEW, citazione: D2023,
    punti: [
      lt('UNI EN 81-21:2022, 1', 'ascensori nuovi in un edificio esistente, dove l\'edificio non permette di rispettare tutta la UNI EN 81-20:2020; esclusi gli impianti montati prima della sua pubblicazione'),
      lt('UNI EN 81-21:2022, 6.2 e 7.1', 'oltre alle prove della EN 81-20 6.3: arresti mobili e sistema di arresto preattivato provati in moto a velocità nominale (in testata a cabina vuota, in fossa con il carico nominale), corsa dei loro ammortizzatori e distanza di frenatura; nelle istruzioni: quanto frena il sistema, col valore nominale e i due limiti'),
      ok('DPR 162/1999, art. 17-bis; DM 19/03/2015; linee guida MIMIT 2022', 'spazi di rifugio ridotti solo con l\'accordo preventivo: in edificio esistente PEC al Ministero con la certificazione dell\'organismo prima dell\'installazione (Procedura 2: dichiarazione dei punti della EN 81-21 applicati); la EN 81-21 da sola non giustifica la deroga'),
    ],
  },
  'en81-28': {
    ambiti: BOTH, citazione: D2023,
    punti: [
      lt('UNI EN 81-20:2020, 5.12.3.1; UNI EN 81-28:2004, 4.1.3, 4.2.1 e 7', 'la EN 81-20 richiama con data la EN 81-28:2003 (UNI EN 81-28:2004): prova automatica del collegamento almeno ogni 3 giorni; con alimentazione a batteria, avviso al servizio di soccorso quando l\'autonomia residua scende sotto 1 h; pulsante d\'allarme giallo con il simbolo della campana'),
      dv('UNI EN 81-28:2022', 'requisiti dell\'edizione citata in GUUE da verificare sul testo; nelle modifiche la UNI 10411-1/-11:2024 (punto 23) ammette l\'allarme nuovo secondo la EN 81-20 5.12.3.1 o la UNI EN 81-28:2022'),
    ],
  },
  'en81-58': {
    ambiti: BOTH, citazione: `${D2023}: metodo di prova`,
    punti: [ok('UNI EN 81-58:2022; DM 15/09/2005, 3.2–3.3 e art. 1 c.2 lett. c)', 'porte di piano resistenti al fuoco (classi E, EI, EW) provate secondo la norma, quando fanno parte della compartimentazione del vano; sostituirle con modelli diversi è una modifica sostanziale ai fini antincendio (la UNI EN 81-20:2020, 5.3.5.2, richiama con data la EN 81-58:2003: quale certificato accettare lo decide l\'organismo)')],
  },
  'en81-70': {
    ambiti: NEW, citazione: `${D2023}: edizione 2021+A1:2022`,
    punti: [
      dv('UNI EN 81-70:2022, 5.3.1', 'tipi di cabina (larghezza × profondità, luce della porta): 1) 1000 × 1300, 800; 2) 1100 × 1400, 900; 3) 1100 × 2100, 900; 4) 1600 × 1400 o 1400 × 1600, 900; 5) 2000 × 1400 o 1400 × 2000, 1100 mm (la UNI EN 81-70:2005 letta, Prospetto 1, ha tre tipi: 1000 × 1250, 1100 × 1400 e 2000 × 1400 mm)'),
      dv('UNI EN 81-70:2022, 5.3.2 e 5.4', 'specchio nei tipi 1–3; finiture che riducono le misure nominali al massimo di 15 mm per parete; segnale acustico regolabile 35–65 dB(A), fino a 80 in ambienti rumorosi; contrasto di Michelson con la A1:2022 (nella UNI EN 81-70:2005 letta: specchio nei tipi 1 e 2, 15 mm, 35–65 dB(A); non ci sono gli 80 dB(A) né il contrasto di Michelson)'),
      ok('UNI EN 81-70:2022, scopo', 'si usa con la UNI EN 81-20:2020; per gli impianti esistenti vale la UNI EN 81-82'),
    ],
  },
  'en81-71': {
    ambiti: NEW, citazione: 'citata in GUUE solo l\'edizione 2005+A1:2006 (GU C 138 del 20/04/2016)',
    avviso: 'la UNI EN 81-71:2022 in vigore non è citata in GUUE: non dà presunzione di conformità',
    punti: [dv('UNI EN 81-71', 'categoria antivandalo da concordare con il committente; per la presunzione di conformità vale l\'edizione 2005+A1:2006')],
  },
  'en81-72': {
    ambiti: NEW, citazione: D2021,
    punti: [
      ok('DM 15/09/2005, punto 7 (valori); Codice V.3.3.4', 'ascensore antincendio: tutti i piani serviti; vano e porte di piano almeno REI 60; cabina interna almeno 1,10 × 2,10 m con accesso sul lato corto; botola sul tetto almeno 0,50 × 0,70 m; area dedicata almeno 5 m² a ogni piano; luce d\'emergenza almeno 5 lux con 1 h di autonomia; IPX3 dove arriva l\'acqua; linea dedicata con alimentazione di sicurezza'),
      ok('Codice S.10, Tab. S.10-2', 'alimentazione di sicurezza dell\'ascensore antincendio: interruzione al massimo 15 s, autonomia oltre 30 min'),
      dv('UNI EN 81-72:2020', 'requisiti propri della norma (cabina, tempi, protezione dall\'acqua) da verificare sul testo'),
    ],
  },
  'en81-73': {
    ambiti: BOTH, citazione: D2021,
    punti: [
      ok('DM 15/09/2005, punto 6; Codice V.3.3.1', 'quando la compartimentazione lo richiede, su comando della rivelazione incendio la cabina va al piano prestabilito e lascia uscire i passeggeri; con il Codice l\'ascensore «dovrebbe» essere conforme alla UNI EN 81-73'),
      dv('UNI EN 81-73:2020', 'segnali e comportamento della manovra da verificare sul testo; la norma serve anche da base per migliorare gli esistenti (così la UNI EN 81-73:2005 letta, punto 1)'),
    ],
  },
  'en81-76': {
    ambiti: NEW, citazione: 'Decisione (UE) 2025/2383 (GU L del 26/11/2025)',
    punti: [dv('UNI EN 81-76:2025', 'evacuazione delle persone con disabilità con l\'ascensore: requisiti aggiuntivi alla EN 81-20 (manovra, alimentazione) da verificare sul testo')],
  },
  'en81-77': {
    ambiti: NEW, citazione: D2023,
    punti: [
      ok('UNI EN 81-77:2022, 1', 'con accelerazione di progetto a_d fino a 1 m/s² nessuna prescrizione specifica; a_d e la posizione dei rilevatori si concordano con il progettista dell\'edificio'),
      dv('UNI EN 81-77:2022, 5.4–5.10, All. A, B, D', 'oltre 1 m/s²: massa della cabina nei calcoli (5.4.1), ritegni della cabina (5.4.2) e del contrappeso (5.5), protezione delle pulegge (5.6.1), tensioni e frecce delle guide (5.8.2, All. D), rilevazione e modo sismico (5.10.3, 5.10.4); soglie delle categorie dell\'All. A da verificare sul testo'),
      ok('UNI EN 81-77:2022, 0.3', 'non si applica agli impianti installati prima della sua pubblicazione'),
    ],
  },
  'en81-80': {
    ambiti: MOD, citazione: 'non citata in GUUE; norma volontaria',
    avviso: 'nessun obbligo nazionale di adeguamento risulta in vigore (il DM 23/07/2009 risulterebbe annullato dal TAR Lazio nel 2010 — fonte giornalistica, da verificare; lo stato del DM 26/10/2005 è da chiarire)',
    punti: [
      lt('UNI EN 81-80:2004 e 2009, 1 e appendice A', 'analisi dei rischi dell\'impianto esistente e piano di miglioramento per priorità; quali misure e in che tempi lo decide la legislazione nazionale, non la norma'),
      dv('UNI EN 81-80:2019', 'la stessa analisi nell\'edizione in vigore, con una struttura diversa: da verificare sul testo'),
    ],
  },
  'en81-82': {
    ambiti: MOD, citazione: 'norma volontaria (UNI EN 81-82:2026, in vigore dal 26/03/2026)',
    punti: [ok('UNI EN 81-82:2026', 'miglioramento dell\'accessibilità di un impianto esistente secondo i requisiti della EN 81-70')],
  },
  'en81-83': {
    ambiti: MOD, citazione: 'norma volontaria (UNI EN 81-83:2026, in vigore dal 26/03/2026)',
    punti: [ok('UNI EN 81-83:2026', 'miglioramento della resistenza agli atti vandalici di un impianto esistente secondo la EN 81-71:2022 (voce 1.2 della Tab. A.1 della EN 81-80)')],
  },
  dm236: {
    ambiti: BOTH, citazione: 'legge nazionale: L. 13/1989, DM 236/1989, DPR 503/1996 per gli edifici pubblici',
    punti: [
      lt('DM 236/1989, 8.1.12', 'piattaforma di distribuzione davanti alla porta di cabina: 1,50 × 1,50 m negli edifici nuovi, 1,40 × 1,40 m nell\'adeguamento (fuori dal vano: in sito)', DM236),
      lt('DM 236/1989, 8.1.12', 'porte di cabina e di piano a scorrimento automatico (nell\'adeguamento la porta di piano può essere a battente se ad apertura automatica); porte aperte almeno 8 s, chiusura in almeno 4 s', DM236),
      lt('DM 236/1989, 8.1.12', 'arresto ai piani con autolivellamento entro ± 2 cm; sosta ai piani con le porte chiuse', DM236),
      lt('DM 236/1989, 8.1.12 e 8.0.1', 'pulsanti di cabina e di piano: il più alto tra 1,10 e 1,40 m, misurato all\'asse del comando; bottoniera di cabina su una parete laterale ad almeno 0,35 m dalla porta', DM236),
      lt('DM 236/1989, 8.1.12 e 4.1.12', 'citofono in cabina tra 1,10 e 1,30 m; luce d\'emergenza con almeno 3 h di autonomia; campanello d\'allarme e segnale luminoso di allarme ricevuto; arresto e inversione della chiusura; segnale acustico d\'arrivo; numeri in rilievo e Braille, targa Braille di piano; sedile ribaltabile dove possibile', DM236),
      lt('DM 236/1989, 3.2; L. 13/1989, art. 1 c.3 lett. d)', 'ascensore obbligatorio oltre il terzo livello (contati interrati e porticati); negli immobili con più di tre livelli fuori terra un ascensore per ogni scala principale', `${DM236}; L. 13/1989: ricerca, cap. 16`),
      lt('DM 236/1989, 7.5; DPR 503/1996, art. 19', 'nelle ristrutturazioni deroghe per impossibilità tecnica strutturale o impiantistica (privati: concesse dal Sindaco); edifici vincolati: deroga se le opere pregiudicano il bene', `${DM236}; DPR 503/1996: ricerca, cap. 16`),
    ],
  },
  antincendio: {
    ambiti: BOTH, citazione: 'DM 15/09/2005 oppure Codice di prevenzione incendi (DM 3/8/2015), RTV V.3, nelle attività soggette ai controlli',
    avviso: 'le finiture della cabina nelle classi minime della UNI EN 81-20 (5.4.4) risultano in classe italiana 2, non nella 1 che chiede il DM '
      + '15/09/2005 (punto 2): vanno scelte in classe 1 con il progettista antincendio',
    punti: [
      ok('DM 3/8/2015, art. 5 c.1-bis lett. e)', 'il progettista applica il DM 15/09/2005 oppure la RTV V.3 del Codice: dove si usa il Codice il DM 2005 non si applica'),
      ok('DM 15/09/2005, art. 1 c.2', 'sugli impianti esistenti vale per le modifiche sostanziali: nuovo impianto; più fermate o altro azionamento; pareti del vano, porte di piano, locale macchina o pulegge sostituiti con materiali, modelli, dimensioni o criteri diversi; solai o scale rifatti che coinvolgono l\'impianto; sopraelevazione; cambio di destinazione d\'uso'),
      ok('DM 15/09/2005, 3.1–3.3; Codice V.3.2', 'tipo di vano: aperto, protetto o a prova di fumo (Codice: classi da SA a SE)'),
      ok('DM 15/09/2005, punto 2', 'pareti del vano, locale macchina e pulegge, setti e arcata non combustibili; pareti, pavimento e tetto della cabina in classe di reazione al fuoco non oltre 1'),
      dv('DM 15/03/2005 (tabella di confronto); UNI EN 81-20:2020, 5.4.4', 'le classi minime della EN 81-20 per la cabina (pavimento Cfl-s2, pareti C-s2,d1, soffitto C-s2,d0) corrispondono alla classe italiana 2; la classe 1 vuole pareti in A2 o B (fumo s1–s2, gocce d0–d1), soffitto in A2 o B-s1/s2,d0, pavimento in A2fl o Bfl (corrispondenza letta su una scheda commerciale del decreto, da confermare sul testo ufficiale)'),
      ok('DM 15/09/2005, punto 5', 'aerazione permanente in alto verso spazi scoperti di almeno il 3 % della pianta (vano almeno 0,20 m², locale macchina o pulegge almeno 0,05 m²), con una protezione che non lascia passare una sfera oltre 15 mm; non serve se il vano è aperto su spazi scoperti'),
      ok('DM 15/09/2005, punto 6; Codice V.3.3.1 c.5', 'estintore 21A89BC vicino all\'accesso al macchinario; richiamo della cabina al piano prestabilito su comando della rivelazione quando la compartimentazione lo richiede'),
      ok('Codice S.9, Tab. S.9-3', 'piani tra 32 e 54 m: almeno un ascensore antincendio; oltre 54 m: almeno uno di soccorso; interrati tra −10 e −15 m: antincendio; sotto −15 m: soccorso'),
    ],
  },
  ntc2018: {
    ambiti: BOTH, citazione: 'DM 17/01/2018 (NTC 2018), obbligatorie',
    punti: [
      ok('NTC 2018, §3.1.4', 'carichi del macchinario valutati caso per caso sui massimi prevedibili e riportati nel progetto e nel collaudo statico'),
      ok('NTC 2018, §8.4.1', 'su un edificio esistente l\'intervento è locale: verifica limitata alle parti interessate, senza ridurre la sicurezza preesistente'),
      ok('NTC 2018, §11.4.1', 'ancoranti per uso strutturale qualificati; con azioni sismiche categoria C2 per tutte le classi d\'uso'),
      ok('NTC 2018, §7.2.3–7.2.4', 'forza sismica sull\'elemento non strutturale Fa = Sa·Wa/qa; nessun vincolo ad attrito; studio specifico oltre il 30 % del carico permanente del solaio o il 10 % di quello dell\'intera struttura; progetto antisismico dell\'impianto del produttore, dei collegamenti dell\'installatore, dei solai e delle pareti d\'ancoraggio del progettista strutturale'),
      ok('NTC 2018, Tab. 7.3.III e §7.3.6.3', 'impianti: stabilità allo SLV per tutte le classi d\'uso; nelle classi III e IV anche funzionamento allo SLO'),
    ],
  },
};

/** What DPR 162/1999 asks of a new lift (and of one tested as new) and of a modification (paraphrased, read on the
 *  consolidated text). */
export const ADEMPIMENTI: Readonly<Record<AmbitoNorma, readonly PuntoInSito[]>> = {
  nuovo: [
    ok('DPR 162/1999, art. 4-bis', 'progetto, fabbricazione, installazione e prove conformi all\'All. I; documentazione tecnica e dichiarazione di conformità conservate per 10 anni'),
    ok('DPR 162/1999 e s.m.i., artt. 6-bis e 7 c.3', 'procedura con un organismo notificato (ascensore modello con esame UE del tipo, All. IV B, più All. V, X o XII; oppure All. VIII o XI); marcatura CE in cabina con il numero dell\'organismo'),
    ok('DPR 162/1999 e s.m.i., art. 12 c.1–3', 'comunicazione al Comune entro 60 giorni dalla dichiarazione di conformità (oltre: con il verbale di una verifica straordinaria di attivazione); matricola entro 30 giorni'),
    ok('DPR 162/1999, artt. 13, 15 c.4 e 16 c.3', 'verifiche periodiche ogni 2 anni; controllo dei dispositivi di sicurezza, delle funi e dell\'isolamento almeno ogni 6 mesi; targa in cabina'),
  ],
  modifica: [
    ok('DPR 162/1999, art. 2 c.1 lett. cc)', 'la modifica è costruttiva: la sostituzione del macchinario ne è il caso n. 5)'),
    ok('DPR 162/1999, art. 12 c.4', 'prima della comunicazione, adeguamento della parte modificata o sostituita e delle altre parti interessate'),
    ok('DPR 162/1999, art. 12 c.4–5', 'comunicazione al Comune e al soggetto delle verifiche periodiche; l\'impianto non resta in esercizio senza le comunicazioni aggiornate'),
    ok('DPR 162/1999 e s.m.i., art. 14 c.3; schema ICIM SCI 162 rev. 02', 'verifica straordinaria da uno dei soggetti dell\'art. 13 c.1 (la legge); secondo lo schema ICIM è di norma limitata ai controlli sulle modifiche, con la documentazione delle modifiche e dei componenti sostituiti'),
    lt('UNI 10411-1:2024 e UNI 10411-11:2024, 25', 'documentazione della modifica (App. C della -1, App. A della -11): il proprietario la tiene per chi esegue la verifica straordinaria e la allega alla dichiarazione di conformità (DM 37/2008); manuali della macchina, del quadro e dei nuovi componenti di sicurezza consegnati al proprietario'),
  ],
};
