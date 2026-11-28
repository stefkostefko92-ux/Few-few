// Каталог на огледа, част 1: достъп и машинно помещение, табло без помещение, машина, хидравлична централа,
// ограничител на скоростта. Само визуални наблюдения с наши думи; пробите са на manutentore.
import type { SezioneChecklist } from "../tipi.js";

export const SEZIONI_1: SezioneChecklist[] = [
  {
    id: "locale-macchina",
    titolo: "Accesso e locale del macchinario",
    ubicazione: "Locale macchina",
    applicabile: ["elettrico_lm", "oleodinamico", "montacarichi"],
    voci: [
      {
        id: "locale-macchina.percorso", testo: "Percorso di accesso al locale (scale, scale a pioli, passaggi, coperture)",
        aiuto: "Annotare il tipo di percorso e se è libero da ostacoli; fotografare i tratti su copertura o con scale a pioli.",
        anomalie: [
          { id: "locale-macchina.percorso.a1", testo: "Percorso di accesso ingombro da materiali o arredi", raccomandazione: "Chiedere all'amministratore di liberare il percorso e di mantenerlo sgombro", priorita: "media" },
          { id: "locale-macchina.percorso.a2", testo: "Scala o scala a pioli di accesso danneggiata, instabile o priva di appigli", raccomandazione: "Informare subito il manutentore e l'amministratore e chiedere la messa in sicurezza del percorso", priorita: "alta" },
          { id: "locale-macchina.percorso.a3", testo: "Accesso attraverso la copertura senza protezioni visibili contro la caduta", raccomandazione: "Chiedere all'amministratore una valutazione tecnica del percorso da parte di un professionista", priorita: "media" },
        ],
        chiarimenti: ["Chiedere all'amministratore chi detiene le chiavi del locale e con quale modalità vengono consegnate."],
      },
      {
        id: "locale-macchina.porta", testo: "Porta del locale: chiusura a chiave, stato e cartello di accesso riservato",
        anomalie: [
          { id: "locale-macchina.porta.a1", testo: "Porta del locale trovata aperta o priva di serratura funzionante", raccomandazione: "Informare subito il manutentore e l'amministratore e chiedere il ripristino della chiusura", priorita: "alta" },
          { id: "locale-macchina.porta.a2", testo: "Porta danneggiata o che si chiude con difficoltà", raccomandazione: "Chiedere all'amministratore la riparazione della porta", priorita: "bassa" },
          { id: "locale-macchina.porta.a3", testo: "Assenza di cartello che indichi l'accesso riservato al personale autorizzato", raccomandazione: "Chiedere al manutentore di esporre il cartello", priorita: "bassa" },
        ],
        chiarimenti: ["Chiedere all'amministratore se altre persone, oltre al manutentore, hanno accesso al locale."],
      },
      {
        id: "locale-macchina.illuminazione", testo: "Illuminazione del locale e posizione del suo interruttore",
        aiuto: "Osservare se la luce si accende dall'ingresso e se tutte le lampade funzionano.",
        anomalie: [
          { id: "locale-macchina.illuminazione.a1", testo: "Illuminazione del locale non funzionante o con lampade spente", raccomandazione: "Chiedere al manutentore o all'amministratore la sostituzione delle lampade", priorita: "media" },
          { id: "locale-macchina.illuminazione.a2", testo: "Interruttore della luce non raggiungibile dall'ingresso del locale", raccomandazione: "Chiedere al manutentore un parere sullo spostamento del comando", priorita: "bassa" },
        ],
        chiarimenti: [],
      },
      {
        id: "locale-macchina.pavimento", testo: "Pavimento, dislivelli, botole e aperture nel pavimento del locale",
        anomalie: [
          { id: "locale-macchina.pavimento.a1", testo: "Apertura o botola nel pavimento lasciata aperta o senza protezione", raccomandazione: "Informare subito il manutentore e chiedere la chiusura o la protezione dell'apertura", priorita: "alta" },
          { id: "locale-macchina.pavimento.a2", testo: "Pavimento sconnesso, scivoloso o con tracce di olio", raccomandazione: "Chiedere al manutentore la pulizia e l'individuazione della causa", priorita: "media" },
          { id: "locale-macchina.pavimento.a3", testo: "Dislivello nel locale senza parapetto o segnalazione visibile", raccomandazione: "Chiedere al manutentore una valutazione dell'intervento di protezione", priorita: "media" },
        ],
        chiarimenti: [],
      },
      {
        id: "locale-macchina.ordine", testo: "Ordine e pulizia: materiali estranei, depositi, ricambi o rifiuti",
        anomalie: [
          { id: "locale-macchina.ordine.a1", testo: "Materiali estranei all'impianto depositati nel locale", raccomandazione: "Chiedere all'amministratore la rimozione dei materiali non pertinenti", priorita: "media" },
          { id: "locale-macchina.ordine.a2", testo: "Presenza di polvere o sporcizia diffusa sulle apparecchiature", raccomandazione: "Chiedere al manutentore la pulizia del locale e delle apparecchiature", priorita: "bassa" },
          { id: "locale-macchina.ordine.a3", testo: "Liquidi infiammabili o bombole conservati nel locale", raccomandazione: "Informare subito l'amministratore e chiedere la rimozione immediata", priorita: "alta" },
        ],
        chiarimenti: [],
      },
      {
        id: "locale-macchina.ambiente", testo: "Aerazione, temperatura percepita, infiltrazioni d'acqua e umidità",
        aiuto: "Fotografare aperture di aerazione, macchie d'acqua sul soffitto o sulle pareti, condensa sulle apparecchiature.",
        anomalie: [
          { id: "locale-macchina.ambiente.a1", testo: "Tracce di infiltrazione d'acqua dal soffitto o dalle pareti", raccomandazione: "Chiedere all'amministratore la ricerca e l'eliminazione della causa", priorita: "media" },
          { id: "locale-macchina.ambiente.a2", testo: "Acqua presente vicino alle apparecchiature elettriche", raccomandazione: "Informare subito il manutentore perché valuti l'eventuale fermo dell'impianto", priorita: "alta" },
          { id: "locale-macchina.ambiente.a3", testo: "Aperture di aerazione ostruite o locale percepito come molto caldo", raccomandazione: "Chiedere al manutentore un parere sulle condizioni ambientali del locale", priorita: "media" },
        ],
        chiarimenti: ["Chiedere al manutentore se in estate ci sono stati fermi attribuiti al surriscaldamento."],
      },
      {
        id: "locale-macchina.interruttore", testo: "Interruttore generale dell'impianto: presenza, identificazione e accessibilità",
        aiuto: "Solo osservazione: non azionare. Annotare se l'interruttore è contrassegnato e raggiungibile dall'ingresso.",
        anomalie: [
          { id: "locale-macchina.interruttore.a1", testo: "Interruttore generale non identificato con un'etichetta", raccomandazione: "Chiedere al manutentore di etichettare l'interruttore", priorita: "bassa" },
          { id: "locale-macchina.interruttore.a2", testo: "Interruttore generale non raggiungibile con facilità dall'ingresso", raccomandazione: "Chiedere al manutentore un parere sulla posizione del comando", priorita: "media" },
        ],
        chiarimenti: ["Chiedere al manutentore se l'interruttore generale può essere bloccato in posizione di apertura durante gli interventi."],
      },
      {
        id: "locale-macchina.quadro", testo: "Quadro di manovra: chiusura, stato esterno, cablaggi e schemi presenti nel locale",
        aiuto: "L'interno si osserva solo se il manutentore apre il quadro. Fotografare senza toccare.",
        anomalie: [
          { id: "locale-macchina.quadro.a1", testo: "Quadro di manovra aperto o con parti in tensione accessibili", raccomandazione: "Informare subito il manutentore e chiedere la chiusura del quadro", priorita: "alta" },
          { id: "locale-macchina.quadro.a2", testo: "Cablaggi disordinati, provvisori o con giunzioni volanti", raccomandazione: "Chiedere al manutentore il riordino e la sistemazione dei collegamenti", priorita: "media" },
          { id: "locale-macchina.quadro.a3", testo: "Segni di surriscaldamento o bruciature su componenti visibili", raccomandazione: "Informare subito il manutentore perché accerti la causa", priorita: "alta" },
          { id: "locale-macchina.quadro.a4", testo: "Schemi elettrici non presenti nel locale", raccomandazione: "Chiedere al manutentore di rendere disponibili gli schemi aggiornati", priorita: "bassa" },
        ],
        chiarimenti: ["Chiedere al manutentore l'anno di installazione del quadro e se è stato sostituito nel tempo."],
      },
      {
        id: "locale-macchina.emergenza", testo: "Istruzioni e attrezzi per la manovra di emergenza presenti nel locale",
        aiuto: "Per gli elettrici: volantino o comando di movimento manuale e leva di apertura del freno. Per gli oleodinamici: comando di discesa e pompa a mano.",
        anomalie: [
          { id: "locale-macchina.emergenza.a1", testo: "Istruzioni per la manovra di emergenza non esposte o illeggibili", raccomandazione: "Chiedere al manutentore di esporre istruzioni leggibili", priorita: "media" },
          { id: "locale-macchina.emergenza.a2", testo: "Attrezzi per la manovra manuale non presenti nel locale", raccomandazione: "Chiedere al manutentore dove sono custoditi e di riportarli nel locale", priorita: "media" },
        ],
        chiarimenti: ["Chiedere al manutentore chi è in grado di eseguire la manovra di emergenza nell'edificio e con quali tempi di intervento."],
      },
    ],
  },
  {
    id: "armadio-comandi",
    titolo: "Quadro di manovra senza locale dedicato",
    ubicazione: "Pianerottolo / armadio",
    applicabile: ["elettrico_mrl", "piattaforma"],
    voci: [
      {
        id: "armadio-comandi.chiusura", testo: "Armadio o pannello del quadro: chiusura a chiave e stato esterno",
        anomalie: [
          { id: "armadio-comandi.chiusura.a1", testo: "Armadio del quadro aperto o con serratura non funzionante", raccomandazione: "Informare subito il manutentore e chiedere il ripristino della chiusura", priorita: "alta" },
          { id: "armadio-comandi.chiusura.a2", testo: "Armadio danneggiato o con ante deformate", raccomandazione: "Chiedere al manutentore la riparazione o la sostituzione", priorita: "media" },
        ],
        chiarimenti: [],
      },
      {
        id: "armadio-comandi.interno", testo: "Interno del quadro: cablaggi, pulizia, schemi (solo se aperto dal manutentore)",
        anomalie: [
          { id: "armadio-comandi.interno.a1", testo: "Cablaggi disordinati o collegamenti provvisori visibili", raccomandazione: "Chiedere al manutentore il riordino dei collegamenti", priorita: "media" },
          { id: "armadio-comandi.interno.a2", testo: "Segni di surriscaldamento o di umidità sui componenti", raccomandazione: "Informare subito il manutentore perché accerti la causa", priorita: "alta" },
        ],
        chiarimenti: ["Chiedere al manutentore dove sono conservati gli schemi elettrici del quadro."],
      },
      {
        id: "armadio-comandi.emergenza", testo: "Comandi e istruzioni per la manovra di emergenza accanto al quadro",
        anomalie: [
          { id: "armadio-comandi.emergenza.a1", testo: "Istruzioni per la manovra di emergenza assenti o illeggibili", raccomandazione: "Chiedere al manutentore di esporre istruzioni leggibili", priorita: "media" },
          { id: "armadio-comandi.emergenza.a2", testo: "Nessuna indicazione visibile della posizione della cabina durante la manovra di emergenza", raccomandazione: "Chiedere al manutentore come viene individuata la posizione della cabina in emergenza", priorita: "media" },
        ],
        chiarimenti: ["Chiedere al manutentore se la manovra di emergenza richiede alimentazione da batteria e quando sono state sostituite le batterie."],
      },
      {
        id: "armadio-comandi.interruttore", testo: "Interruttore generale dell'impianto: presenza e identificazione",
        aiuto: "Solo osservazione: non azionare.",
        anomalie: [
          { id: "armadio-comandi.interruttore.a1", testo: "Interruttore generale non individuabile o non etichettato", raccomandazione: "Chiedere al manutentore di indicare e etichettare l'interruttore", priorita: "bassa" },
        ],
        chiarimenti: ["Chiedere al manutentore dove si trova il sezionamento dell'alimentazione dell'impianto."],
      },
    ],
  },
  {
    id: "macchina",
    titolo: "Macchinario di trazione (argano o motore)",
    ubicazione: "Locale macchina / vano",
    applicabile: ["elettrico_lm", "elettrico_mrl", "montacarichi"],
    voci: [
      {
        id: "macchina.fissaggio", testo: "Basamento, supporti e fissaggi del macchinario",
        aiuto: "Negli impianti senza locale la macchina si osserva solo se il manutentore la rende visibile.",
        anomalie: [
          { id: "macchina.fissaggio.a1", testo: "Bulloneria di fissaggio arrugginita o con elementi mancanti", raccomandazione: "Chiedere al manutentore il controllo e il ripristino dei fissaggi", priorita: "media" },
          { id: "macchina.fissaggio.a2", testo: "Supporti antivibranti deteriorati o schiacciati", raccomandazione: "Chiedere al manutentore la valutazione della sostituzione", priorita: "media" },
        ],
        chiarimenti: [],
      },
      {
        id: "macchina.lubrificante", testo: "Perdite di olio o grasso da riduttore, cuscinetti e motore",
        anomalie: [
          { id: "macchina.lubrificante.a1", testo: "Tracce di olio sotto il riduttore o sul basamento", raccomandazione: "Chiedere al manutentore l'individuazione e l'eliminazione della perdita", priorita: "media" },
          { id: "macchina.lubrificante.a2", testo: "Olio o grasso che raggiunge la puleggia, le funi o il freno", raccomandazione: "Informare subito il manutentore perché valuti l'eventuale fermo dell'impianto", priorita: "alta" },
        ],
        chiarimenti: ["Chiedere al manutentore con quale frequenza viene rabboccato o sostituito l'olio del riduttore."],
      },
      {
        id: "macchina.puleggia", testo: "Puleggia di trazione e funi sulla puleggia (aspetto visibile)",
        anomalie: [
          { id: "macchina.puleggia.a1", testo: "Gole della puleggia visibilmente consumate o con funi a quote diverse", raccomandazione: "Chiedere al manutentore la misura dell'usura e un parere sulla sostituzione", priorita: "media" },
          { id: "macchina.puleggia.a2", testo: "Ruggine o polvere metallica sulla puleggia", raccomandazione: "Chiedere al manutentore il controllo dello stato di puleggia e funi", priorita: "media" },
        ],
        chiarimenti: ["Chiedere al manutentore quando sono state sostituite la puleggia e le funi."],
      },
      {
        id: "macchina.protezioni", testo: "Protezioni delle parti rotanti accessibili (puleggia, volano, giunti)",
        anomalie: [
          { id: "macchina.protezioni.a1", testo: "Parti rotanti accessibili senza carter o con carter rimosso", raccomandazione: "Informare subito il manutentore e chiedere il ripristino delle protezioni", priorita: "alta" },
          { id: "macchina.protezioni.a2", testo: "Parti rotanti non evidenziate con colore o segnaletica", raccomandazione: "Chiedere al manutentore di segnalarle", priorita: "bassa" },
        ],
        chiarimenti: [],
      },
      {
        id: "macchina.freno", testo: "Freno (solo aspetto esterno): pulizia, tracce di olio, polvere di attrito, leva di apertura manuale",
        aiuto: "Il funzionamento del freno non si prova: è riferito dal manutentore.",
        anomalie: [
          { id: "macchina.freno.a1", testo: "Tracce di olio o grasso sulle superfici del freno", raccomandazione: "Informare subito il manutentore perché valuti l'eventuale fermo dell'impianto", priorita: "alta" },
          { id: "macchina.freno.a2", testo: "Accumulo di polvere di attrito attorno al freno", raccomandazione: "Chiedere al manutentore il controllo delle guarnizioni del freno", priorita: "media" },
          { id: "macchina.freno.a3", testo: "Leva di apertura manuale del freno non presente o non individuabile", raccomandazione: "Chiedere al manutentore dove è custodita", priorita: "media" },
        ],
        chiarimenti: ["Chiedere al manutentore l'esito dell'ultimo controllo del freno e la data in cui è stato eseguito."],
      },
      {
        id: "macchina.rumore", testo: "Rumori, odori o riscaldamento percepiti vicino al macchinario durante le corse",
        anomalie: [
          { id: "macchina.rumore.a1", testo: "Rumore metallico o ritmico percepito durante la marcia", raccomandazione: "Chiedere al manutentore l'individuazione della causa", priorita: "media" },
          { id: "macchina.rumore.a2", testo: "Odore di bruciato percepito vicino al motore o al freno", raccomandazione: "Informare subito il manutentore perché accerti la causa", priorita: "alta" },
        ],
        chiarimenti: [],
      },
      {
        id: "macchina.targhe", testo: "Targhe identificative del macchinario leggibili",
        anomalie: [
          { id: "macchina.targhe.a1", testo: "Targhe del macchinario assenti o illeggibili", raccomandazione: "Chiedere al manutentore i dati del macchinario da riportare nella documentazione", priorita: "bassa" },
        ],
        chiarimenti: ["Chiedere al manutentore il tipo e l'anno del macchinario installato."],
      },
    ],
  },
  {
    id: "centralina",
    titolo: "Centralina oleodinamica e circuito idraulico",
    ubicazione: "Locale macchina",
    applicabile: ["oleodinamico", "piattaforma"],
    voci: [
      {
        id: "centralina.stato", testo: "Centralina: fissaggio, stato esterno, coperchi e collegamenti elettrici",
        aiuto: "Nelle piattaforme senza azionamento idraulico segnare «non applicabile».",
        anomalie: [
          { id: "centralina.stato.a1", testo: "Coperchi della centralina rimossi o danneggiati", raccomandazione: "Chiedere al manutentore il ripristino dei coperchi", priorita: "media" },
          { id: "centralina.stato.a2", testo: "Ruggine o danni visibili sul gruppo motore-pompa", raccomandazione: "Chiedere al manutentore una valutazione dello stato del gruppo", priorita: "media" },
        ],
        chiarimenti: ["Chiedere al manutentore l'anno della centralina e se sono stati sostituiti motore, pompa o valvole."],
      },
      {
        id: "centralina.serbatoio", testo: "Serbatoio dell'olio: indicatore di livello, aspetto e tappi",
        anomalie: [
          { id: "centralina.serbatoio.a1", testo: "Indicatore di livello dell'olio non leggibile o assente", raccomandazione: "Chiedere al manutentore come viene controllato il livello", priorita: "bassa" },
          { id: "centralina.serbatoio.a2", testo: "Olio visibilmente scuro o con schiuma (riferito o osservato)", raccomandazione: "Chiedere al manutentore un parere sulla sostituzione dell'olio", priorita: "media" },
        ],
        chiarimenti: ["Chiedere al manutentore quando è stato sostituito l'olio e se vengono eseguiti rabbocchi frequenti."],
      },
      {
        id: "centralina.perdite", testo: "Tracce di olio sotto la centralina, sul pavimento e nell'eventuale vasca di raccolta",
        anomalie: [
          { id: "centralina.perdite.a1", testo: "Olio sul pavimento attorno alla centralina", raccomandazione: "Chiedere al manutentore la pulizia e l'eliminazione della perdita", priorita: "media" },
          { id: "centralina.perdite.a2", testo: "Perdita di olio in atto da raccordi o valvole", raccomandazione: "Informare subito il manutentore perché valuti l'eventuale fermo dell'impianto", priorita: "alta" },
          { id: "centralina.perdite.a3", testo: "Materiale assorbente o contenitori usati per raccogliere l'olio", raccomandazione: "Chiedere al manutentore la causa e l'intervento risolutivo", priorita: "media" },
        ],
        chiarimenti: [],
      },
      {
        id: "centralina.tubazioni", testo: "Tubazioni e tubi flessibili visibili: stato, raccordi, protezione negli attraversamenti",
        anomalie: [
          { id: "centralina.tubazioni.a1", testo: "Tubo flessibile screpolato, schiacciato o con abrasioni", raccomandazione: "Informare subito il manutentore e chiedere la sostituzione", priorita: "alta" },
          { id: "centralina.tubazioni.a2", testo: "Tubazione non protetta nel passaggio tra locale e vano", raccomandazione: "Chiedere al manutentore un parere sulla protezione del tratto", priorita: "media" },
        ],
        chiarimenti: ["Chiedere al manutentore quando sono stati sostituiti i tubi flessibili."],
      },
      {
        id: "centralina.emergenza", testo: "Comando di discesa di emergenza, pompa a mano e relative istruzioni",
        anomalie: [
          { id: "centralina.emergenza.a1", testo: "Istruzioni per la discesa di emergenza non esposte", raccomandazione: "Chiedere al manutentore di esporre le istruzioni", priorita: "media" },
          { id: "centralina.emergenza.a2", testo: "Comandi di emergenza non identificati con etichette", raccomandazione: "Chiedere al manutentore di etichettarli", priorita: "bassa" },
        ],
        chiarimenti: ["Chiedere al manutentore se la discesa di emergenza è automatica in mancanza di alimentazione (riferito dal manutentore)."],
      },
    ],
  },
  {
    id: "limitatore",
    titolo: "Limitatore di velocità (osservazione visiva)",
    ubicazione: "Locale macchina / vano",
    applicabile: ["elettrico_lm", "elettrico_mrl", "oleodinamico", "montacarichi"],
    voci: [
      {
        id: "limitatore.stato", testo: "Limitatore: fissaggio, pulizia, sigillo di taratura e contatto elettrico visibili",
        aiuto: "Negli oleodinamici diretti il limitatore può non esserci: segnare «non applicabile». Il funzionamento è riferito dal manutentore.",
        anomalie: [
          { id: "limitatore.stato.a1", testo: "Sigillo di taratura non visibile o rotto", raccomandazione: "Chiedere al manutentore un chiarimento sullo stato della taratura", priorita: "media" },
          { id: "limitatore.stato.a2", testo: "Limitatore sporco, arrugginito o con parti allentate", raccomandazione: "Chiedere al manutentore pulizia e controllo", priorita: "media" },
          { id: "limitatore.stato.a3", testo: "Contatto elettrico del limitatore scollegato o con cablaggio danneggiato", raccomandazione: "Informare subito il manutentore perché ne accerti lo stato", priorita: "alta" },
        ],
        chiarimenti: ["Chiedere al manutentore la data dell'ultima prova del paracadute e del limitatore (prova eseguita dal manutentore)."],
      },
      {
        id: "limitatore.fune", testo: "Fune del limitatore: aspetto, posizione nella gola, tensione apparente",
        anomalie: [
          { id: "limitatore.fune.a1", testo: "Fune del limitatore con fili rotti, ruggine o deformazioni visibili", raccomandazione: "Chiedere al manutentore il controllo della fune", priorita: "media" },
          { id: "limitatore.fune.a2", testo: "Fune del limitatore visibilmente allentata o fuori dalla gola", raccomandazione: "Informare subito il manutentore perché ne accerti lo stato", priorita: "alta" },
        ],
        chiarimenti: [],
      },
      {
        id: "limitatore.targa", testo: "Targa identificativa del limitatore leggibile",
        anomalie: [
          { id: "limitatore.targa.a1", testo: "Targa del limitatore assente o illeggibile", raccomandazione: "Chiedere al manutentore i dati del componente da riportare nella documentazione", priorita: "bassa" },
        ],
        chiarimenti: [],
      },
    ],
  },
];
