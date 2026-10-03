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
      // in sito, in our words (EN 81-50 from the public extract of the text; the others from secondary sources: Otis and
      // KONE notes on EN 81-20/50, research chapter 16)
      ok('UNI EN 81-50:2020, 5.12.1 e 5.12.2.1', 'il metodo del coefficiente di sicurezza delle funi vale solo per pulegge di acciaio o ghisa e funi d\'acciaio secondo EN 12385-5; la flessione è semplice se il raggio della gola non supera 0,53 volte il diametro della fune: rilevare il materiale della puleggia e il raggio delle gole'),
      dv('UNI EN 81-20:2020, 5.6.2 (sottoclausola da verificare)', 'il limitatore di velocità fa intervenire il paracadute entro 250 mm di corsa verso il basso della cabina o del contrappeso'),
      dv('UNI EN 81-20:2020, 5.8 (sottoclausola da verificare)', 'ammortizzatori: decelerazione di picco non oltre 6 g per tempi sotto 0,04 s (dato del fornitore)'),
      dv('UNI EN 81-20:2020, 5.2.5.5.1', 'sullo schermo del contrappeso un cartello con le distanze di progetto sotto l\'ammortizzatore, per la regolazione e la rifunatura'),
      dv('UNI EN 81-20:2020, 5.2.2 (sottoclausola da verificare)', 'fossa più profonda di 2,50 m: porta di accesso alla base; fino a 2,50 m la scala di accesso come la definisce la norma'),
      dv('UNI EN 81-20:2020, 5.2.1.5 (sottoclausola da verificare)', 'in fossa una pulsantiera di ispezione per comandare l\'ascensore, vicino agli spazi di rifugio'),
      dv('UNI EN 81-20:2020, 5.2.5.7 e 5.2.5.8', 'un rifugio per ogni persona che lavora in quella zona, tutti dello stesso tipo, con un cartello che dice quale'),
      dv('UNI EN 81-20:2020, 5.2.1.4.1', 'illuminazione del vano: almeno 50 lux a 1 m sopra il tetto della cabina nella sua proiezione e a 1 m sopra il fondo della fossa dove si sta o si lavora; almeno 20 lux altrove'),
      dv('UNI EN 81-20:2020, 5.4.10 (sottoclausola da verificare)', 'illuminazione in cabina almeno 100 lux; illuminazione di emergenza di 5 lux per un\'ora in cabina e sul tetto della cabina'),
      dv('UNI EN 81-20:2020, 5.4.4 (sottoclausola da verificare)', 'materiali della cabina secondo EN 13501-1: pavimento Cfl-s2, pareti C-s2,d1, soffitto C-s2,d0'),
      dv('UNI EN 81-20:2020, 5.3 (sottoclausola da verificare)', 'porte con le trattenute dei pannelli e la prova d\'urto; protezione a cortina di luce (le fotocellule singole non bastano); la porta di cabina non si apre dall\'interno fuori dalla zona di sblocco'),
    ],
  },
  '10411-1': {
    ambiti: [], citazione: 'norma nazionale volontaria, in vigore dal 31/10/2024 (sostituisce la 2021); il DPR 162/1999 non la richiama',
    punti: [ok('UNI 10411-1:2024, scopo', 'ascensori elettrici a frizione non conformi alla 95/16/CE né alla 2014/33/UE; esclude le modifiche che cambiano le misure antincendio (valgono il DM 15/09/2005 o il Codice V.3)')],
  },
  '10411-11': {
    ambiti: [], citazione: 'norma nazionale volontaria, in vigore dal 31/10/2024 (sostituisce UNI 10411-3:2016 e 10411-5:2017); il DPR 162/1999 non la richiama',
    punti: [
      ok('UNI 10411-11:2024, scopo', 'ascensori elettrici a frizione conformi alla Direttiva Ascensori; esclude le modifiche che cambiano le misure antincendio (valgono il DM 15/09/2005 o il Codice V.3)'),
      dv('UNI EN 81-20:2020, 5.6.6 e 5.6.7', 'cambiando la macchina: se la protezione contro il movimento incontrollato della cabina o contro la velocità eccessiva in salita usava il freno della macchina, la combinazione certificata decade; serve un elemento di arresto certificato per la nuova macchina, con il certificato e i suoi limiti nella documentazione'),
    ],
  },
  'en81-21': {
    ambiti: NEW, citazione: D2023,
    punti: [
      dv('UNI EN 81-21:2022, scopo', 'impianto nuovo o sostituzione completa in un edificio esistente; non copre le modifiche parziali (letto sull\'edizione 2018)'),
      ok('DPR 162/1999, art. 17-bis; DM 19/03/2015; linee guida MIMIT 2022', 'spazi di rifugio ridotti solo con l\'accordo preventivo: in edificio esistente PEC al Ministero con la certificazione dell\'organismo prima dell\'installazione (Procedura 2: dichiarazione dei punti della EN 81-21 applicati); la EN 81-21 da sola non giustifica la deroga'),
    ],
  },
  'en81-28': {
    ambiti: BOTH, citazione: D2023,
    punti: [dv('UNI EN 81-28:2022', 'teleallarme verso un servizio di soccorso: requisiti da verificare sul testo della norma; il suo uso sugli impianti esistenti non è stato verificato')],
  },
  'en81-58': {
    ambiti: BOTH, citazione: `${D2023}: metodo di prova`,
    punti: [ok('UNI EN 81-58:2022; DM 15/09/2005, 3.2–3.3 e art. 1 c.2 lett. c)', 'porte di piano resistenti al fuoco (classi E, EI, EW) provate secondo la norma, quando fanno parte della compartimentazione del vano; sostituirle con modelli diversi è una modifica sostanziale ai fini antincendio')],
  },
  'en81-70': {
    ambiti: NEW, citazione: `${D2023}: edizione 2021+A1:2022`,
    punti: [
      dv('UNI EN 81-70:2022, 5.3.1', 'tipi di cabina (larghezza × profondità, luce della porta): 1) 1000 × 1300, 800; 2) 1100 × 1400, 900; 3) 1100 × 2100, 900; 4) 1600 × 1400 o 1400 × 1600, 900; 5) 2000 × 1400 o 1400 × 2000, 1100 mm'),
      dv('UNI EN 81-70:2022, 5.3.2 e 5.4', 'specchio nei tipi 1–3; finiture che riducono le misure nominali al massimo di 15 mm per parete; segnale acustico regolabile 35–65 dB(A), fino a 80 in ambienti rumorosi; contrasto di Michelson con la A1:2022'),
      ok('UNI EN 81-70:2022, scopo', 'si usa con la UNI EN 81-20:2020; per gli impianti esistenti vale la UNI EN 81-82'),
    ],
  },
  'en81-71': {
    ambiti: NEW, citazione: 'citata in GUUE solo l\'edizione 2005+A1:2006 (GU C 138 del 20/04/2016)',
    avviso: 'la UNI EN 81-71:2022 in vigore non è citata in GUUE: non dà presunzione di conformità',
    punti: [ok('UNI EN 81-71', 'categoria antivandalo da concordare con il committente; per la presunzione di conformità vale l\'edizione 2005+A1:2006')],
  },
  'en81-72': {
    ambiti: NEW, citazione: D2021,
    punti: [
      ok('DM 15/09/2005, punto 7; Codice V.3.3.4', 'ascensore antincendio: tutti i piani serviti; vano e porte di piano almeno REI 60; cabina interna almeno 1,10 × 2,10 m con accesso sul lato corto; botola sul tetto almeno 0,50 × 0,70 m; area dedicata almeno 5 m² a ogni piano; luce d\'emergenza almeno 5 lux con 1 h di autonomia; IPX3 dove arriva l\'acqua; linea dedicata con alimentazione di sicurezza'),
      ok('Codice S.10, Tab. S.10-2', 'alimentazione di sicurezza dell\'ascensore antincendio: interruzione al massimo 15 s, autonomia oltre 30 min'),
      dv('UNI EN 81-72:2020', 'requisiti propri della norma (cabina, tempi, protezione dall\'acqua) da verificare sul testo'),
    ],
  },
  'en81-73': {
    ambiti: BOTH, citazione: D2021,
    punti: [
      ok('DM 15/09/2005, punto 6; Codice V.3.3.1', 'su comando della rivelazione incendio la cabina va al piano prestabilito e lascia uscire i passeggeri; con il Codice l\'ascensore «dovrebbe» essere conforme alla UNI EN 81-73'),
      dv('UNI EN 81-73:2020', 'segnali e comportamento della manovra da verificare sul testo; la norma serve anche da base per migliorare gli esistenti'),
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
    avviso: 'nessun obbligo nazionale di adeguamento risulta in vigore (il DM 23/07/2009 è stato annullato dal TAR Lazio nel 2010; lo stato del DM 26/10/2005 è da chiarire)',
    punti: [dv('UNI EN 81-80:2019', 'analisi dei rischi dell\'impianto esistente e piano di miglioramento per priorità, scelta volontaria del proprietario')],
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
      ok('DM 236/1989, 8.1.12', 'piattaforma di distribuzione davanti alla porta di cabina: 1,50 × 1,50 m negli edifici nuovi, 1,40 × 1,40 m nell\'adeguamento (fuori dal vano: in sito)'),
      ok('DM 236/1989, 8.1.12', 'porte di cabina e di piano a scorrimento automatico (nell\'adeguamento la porta di piano può essere a battente se ad apertura automatica); porte aperte almeno 8 s, chiusura in almeno 4 s'),
      ok('DM 236/1989, 8.1.12', 'arresto ai piani con autolivellamento entro ± 2 cm; sosta ai piani con le porte chiuse'),
      dv('DM 236/1989, 8.1.12 e 8.0.1', 'pulsanti di cabina e di piano: il più alto tra 1,10 e 1,40 m, misurato all\'asse del comando; bottoniera di cabina su una parete laterale ad almeno 0,35 m dalla porta'),
      ok('DM 236/1989, 8.1.12 e 4.1.12', 'citofono in cabina tra 1,10 e 1,30 m; luce d\'emergenza con almeno 3 h di autonomia; campanello d\'allarme e segnale luminoso di allarme ricevuto; arresto e inversione della chiusura; segnale acustico d\'arrivo; numeri in rilievo e Braille, targa Braille di piano; sedile ribaltabile dove possibile'),
      ok('DM 236/1989, 3.2; L. 13/1989, art. 1 c.3 lett. d)', 'ascensore obbligatorio oltre il terzo livello (contati interrati e porticati); negli immobili con più di tre livelli fuori terra un ascensore per ogni scala principale'),
      ok('DM 236/1989, 7.5; DPR 503/1996, art. 19', 'nelle ristrutturazioni deroghe per impossibilità tecnica strutturale o impiantistica (privati: concesse dal Sindaco); edifici vincolati: deroga se le opere pregiudicano il bene'),
    ],
  },
  antincendio: {
    ambiti: BOTH, citazione: 'DM 15/09/2005 oppure Codice di prevenzione incendi (DM 3/8/2015), RTV V.3, nelle attività soggette ai controlli',
    punti: [
      ok('DM 3/8/2015, art. 5 c.1-bis lett. e)', 'il progettista applica il DM 15/09/2005 oppure la RTV V.3 del Codice: dove si usa il Codice il DM 2005 non si applica'),
      ok('DM 15/09/2005, art. 1 c.2', 'sugli impianti esistenti vale per le modifiche sostanziali: nuovo impianto; più fermate o altro azionamento; pareti del vano, porte di piano, locale macchine o pulegge sostituiti con materiali, modelli, dimensioni o criteri diversi; solai o scale rifatti che coinvolgono l\'impianto; sopraelevazione; cambio di destinazione d\'uso'),
      ok('DM 15/09/2005, 3.1–3.3; Codice V.3.2', 'tipo di vano: aperto, protetto o a prova di fumo (Codice: classi da SA a SE)'),
      ok('DM 15/09/2005, punto 2', 'pareti del vano, locale macchine e pulegge, setti e arcata non combustibili; pareti, pavimento e tetto della cabina in classe di reazione al fuoco non oltre 1'),
      ok('DM 15/09/2005, punto 5', 'aerazione permanente in alto verso spazi scoperti di almeno il 3 % della pianta (vano almeno 0,20 m², locale macchine o pulegge almeno 0,05 m²), con una protezione che non lascia passare una sfera oltre 15 mm; non serve se il vano è aperto su spazi scoperti'),
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
    ok('DPR 162/1999, artt. 6-bis e 7 c.3', 'procedura con un organismo notificato (All. V, VIII, X, XI o XII); marcatura CE in cabina con il numero dell\'organismo'),
    ok('DPR 162/1999, art. 12 c.1–3', 'comunicazione al Comune entro 60 giorni dalla dichiarazione di conformità (oltre: con il verbale di una verifica straordinaria di attivazione); matricola entro 30 giorni'),
    ok('DPR 162/1999, artt. 13, 15 c.4 e 16 c.3', 'verifiche periodiche ogni 2 anni; controllo dei dispositivi di sicurezza, delle funi e dell\'isolamento almeno ogni 6 mesi; targa in cabina'),
  ],
  modifica: [
    ok('DPR 162/1999, art. 2 c.1 lett. cc)', 'la modifica è costruttiva: la sostituzione del macchinario ne è il caso n. 5)'),
    ok('DPR 162/1999, art. 12 c.4', 'prima della comunicazione, adeguamento della parte modificata o sostituita e delle altre parti interessate'),
    ok('DPR 162/1999, art. 12 c.4–5', 'comunicazione al Comune e al soggetto delle verifiche periodiche; l\'impianto non resta in esercizio senza le comunicazioni aggiornate'),
    ok('DPR 162/1999, art. 14 c.3', 'verifica straordinaria da uno dei soggetti dell\'art. 13 c.1, di norma limitata ai controlli sulle modifiche, con la documentazione delle modifiche e dei componenti sostituiti'),
  ],
};
