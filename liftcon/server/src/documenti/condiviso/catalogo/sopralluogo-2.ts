// Каталог на огледа, част 2: шахта, приямък, покрив на кабината, глава на шахтата. Приямъкът, покривът и
// главата се наблюдават само ако manutentore ги направи достъпни; консултантът не управлява уредбата.
import type { SezioneChecklist } from "../tipi.js";

export const SEZIONI_2: SezioneChecklist[] = [
  {
    id: "vano",
    titolo: "Vano di corsa",
    ubicazione: "Vano di corsa",
    voci: [
      {
        id: "vano.pareti", testo: "Pareti del vano: integrità, aperture, parti a rete o forate verso zone frequentate",
        aiuto: "Osservare dai pianerottoli e, se il manutentore lo consente, dal tetto di cabina. Annotare da dove è stata fatta l'osservazione.",
        anomalie: [
          { id: "vano.pareti.a1", testo: "Apertura o parte mancante nella chiusura del vano verso una zona accessibile", raccomandazione: "Informare subito il manutentore e l'amministratore e chiedere la chiusura dell'apertura", priorita: "alta" },
          { id: "vano.pareti.a2", testo: "Chiusura del vano a rete o forata in corrispondenza di zone frequentate", raccomandazione: "Chiedere al manutentore e a un progettista una valutazione tecnica dell'intervento", priorita: "media" },
          { id: "vano.pareti.a3", testo: "Crepe, distacchi di intonaco o calcinacci sulle pareti del vano", raccomandazione: "Chiedere all'amministratore un controllo delle murature da parte di un tecnico", priorita: "media" },
        ],
        chiarimenti: ["Chiedere all'amministratore se il vano è condiviso con altri impianti o confina con locali abitati."],
      },
      {
        id: "vano.pulizia", testo: "Materiali estranei, sporcizia o oggetti caduti nel vano",
        anomalie: [
          { id: "vano.pulizia.a1", testo: "Oggetti o materiali estranei appoggiati su mensole, staffe o sporgenze del vano", raccomandazione: "Chiedere al manutentore la rimozione e l'accertamento della loro provenienza", priorita: "media" },
          { id: "vano.pulizia.a2", testo: "Accumulo di polvere o sporcizia lungo il vano", raccomandazione: "Chiedere al manutentore la pulizia del vano", priorita: "bassa" },
        ],
        chiarimenti: [],
      },
      {
        id: "vano.acqua", testo: "Tracce d'acqua, umidità o infiltrazioni nel vano",
        anomalie: [
          { id: "vano.acqua.a1", testo: "Tracce di infiltrazione d'acqua sulle pareti del vano", raccomandazione: "Chiedere all'amministratore la ricerca della causa e al manutentore il controllo delle parti interessate", priorita: "media" },
          { id: "vano.acqua.a2", testo: "Acqua che raggiunge apparecchiature elettriche nel vano", raccomandazione: "Informare subito il manutentore perché valuti l'eventuale fermo dell'impianto", priorita: "alta" },
        ],
        chiarimenti: [],
      },
      {
        id: "vano.illuminazione", testo: "Illuminazione del vano: presenza, lampade accese, comando",
        aiuto: "L'accensione è fatta dal manutentore; annotare se tutte le lampade si accendono.",
        anomalie: [
          { id: "vano.illuminazione.a1", testo: "Illuminazione del vano non presente", raccomandazione: "Chiedere al manutentore un preventivo per l'illuminazione del vano", priorita: "media" },
          { id: "vano.illuminazione.a2", testo: "Lampade del vano spente o mancanti in alcuni tratti", raccomandazione: "Chiedere al manutentore la sostituzione delle lampade", priorita: "bassa" },
        ],
        chiarimenti: ["Chiedere al manutentore dove si trovano i comandi della luce del vano."],
      },
      {
        id: "vano.guide", testo: "Guide e staffe di fissaggio visibili: ruggine, fissaggi, lubrificazione",
        anomalie: [
          { id: "vano.guide.a1", testo: "Ruggine diffusa su guide o staffe", raccomandazione: "Chiedere al manutentore una valutazione dello stato delle guide", priorita: "media" },
          { id: "vano.guide.a2", testo: "Staffa allentata, deformata o con tasselli sfilati", raccomandazione: "Informare subito il manutentore perché ne accerti lo stato", priorita: "alta" },
          { id: "vano.guide.a3", testo: "Lubrificante in eccesso che cola lungo le guide", raccomandazione: "Chiedere al manutentore la pulizia e la regolazione della lubrificazione", priorita: "bassa" },
        ],
        chiarimenti: [],
      },
      {
        id: "vano.funi", testo: "Funi o cinghie di sospensione visibili: aspetto, ruggine, fili rotti, tensione apparente",
        aiuto: "Non applicabile agli impianti senza funi o cinghie (ad esempio oleodinamico diretto). Lo stato delle funi è riferito dal manutentore.",
        anomalie: [
          { id: "vano.funi.a1", testo: "Fili rotti visibili su una o più funi", raccomandazione: "Informare subito il manutentore perché ne accerti lo stato", priorita: "alta" },
          { id: "vano.funi.a2", testo: "Funi arrugginite o secche", raccomandazione: "Chiedere al manutentore il controllo e la lubrificazione", priorita: "media" },
          { id: "vano.funi.a3", testo: "Funi con tensione apparentemente diversa tra loro", raccomandazione: "Chiedere al manutentore il controllo dell'equilibratura delle funi", priorita: "media" },
        ],
        chiarimenti: ["Chiedere al manutentore l'anno dell'ultima sostituzione delle funi o delle cinghie."],
      },
      {
        id: "vano.contrappeso", testo: "Contrappeso: blocchi, fissaggio dei blocchi, protezione del suo percorso",
        applicabile: ["elettrico_lm", "elettrico_mrl", "montacarichi"],
        anomalie: [
          { id: "vano.contrappeso.a1", testo: "Blocchi del contrappeso non trattenuti o spostati", raccomandazione: "Informare subito il manutentore perché ne accerti lo stato", priorita: "alta" },
          { id: "vano.contrappeso.a2", testo: "Percorso del contrappeso non separato verso zone raggiungibili", raccomandazione: "Chiedere al manutentore e a un progettista una valutazione tecnica", priorita: "media" },
        ],
        chiarimenti: [],
      },
      {
        id: "vano.cavo", testo: "Cavo flessibile della cabina: aspetto, ancoraggi, sfregamenti",
        anomalie: [
          { id: "vano.cavo.a1", testo: "Cavo flessibile con guaina abrasa o tagliata", raccomandazione: "Informare subito il manutentore perché ne accerti lo stato", priorita: "alta" },
          { id: "vano.cavo.a2", testo: "Cavo flessibile che sfrega contro pareti o strutture", raccomandazione: "Chiedere al manutentore il controllo degli ancoraggi", priorita: "media" },
        ],
        chiarimenti: [],
      },
      {
        id: "vano.estranei", testo: "Tubazioni, cavi o impianti estranei all'ascensore che attraversano il vano",
        anomalie: [
          { id: "vano.estranei.a1", testo: "Tubazioni o cavi non appartenenti all'ascensore presenti nel vano", raccomandazione: "Chiedere all'amministratore e al manutentore una valutazione dello spostamento", priorita: "media" },
        ],
        chiarimenti: ["Chiedere all'amministratore a quale impianto appartengono le tubazioni o i cavi estranei."],
      },
      {
        id: "vano.aerazione", testo: "Aperture di aerazione del vano o della testata: presenza e stato",
        anomalie: [
          { id: "vano.aerazione.a1", testo: "Apertura di aerazione ostruita o chiusa", raccomandazione: "Chiedere al manutentore e all'amministratore un parere sul ripristino", priorita: "bassa" },
        ],
        chiarimenti: ["Chiedere all'amministratore se le aperture del vano sono state modificate in lavori sull'edificio."],
      },
    ],
  },
  {
    id: "fossa",
    titolo: "Fossa",
    ubicazione: "Fossa",
    voci: [
      {
        id: "fossa.accesso", testo: "Modalità di accesso alla fossa (porta di piano, scala, porta dedicata)",
        aiuto: "L'accesso è a cura del manutentore. Se la fossa non è stata resa accessibile, segnare «non verificabile».",
        anomalie: [
          { id: "fossa.accesso.a1", testo: "Mezzo di discesa in fossa non presente o non individuato", raccomandazione: "Chiedere al manutentore come avviene la discesa in fossa", priorita: "media" },
          { id: "fossa.accesso.a2", testo: "Scala di discesa danneggiata o non fissata", raccomandazione: "Chiedere al manutentore la riparazione o la sostituzione", priorita: "media" },
        ],
        chiarimenti: [],
      },
      {
        id: "fossa.pulizia", testo: "Pulizia del fondo fossa: rifiuti, materiali estranei, oggetti caduti",
        anomalie: [
          { id: "fossa.pulizia.a1", testo: "Presenza di materiale estraneo sul fondo della fossa", raccomandazione: "Chiedere al manutentore la rimozione e l'accertamento della provenienza", priorita: "media" },
          { id: "fossa.pulizia.a2", testo: "Materiale infiammabile accumulato in fossa", raccomandazione: "Informare subito il manutentore e chiedere la rimozione immediata", priorita: "alta" },
        ],
        chiarimenti: [],
      },
      {
        id: "fossa.acqua", testo: "Acqua, fango o umidità sul fondo della fossa",
        anomalie: [
          { id: "fossa.acqua.a1", testo: "Acqua stagnante sul fondo della fossa", raccomandazione: "Informare subito il manutentore perché valuti l'eventuale fermo e chiedere all'amministratore l'eliminazione della causa", priorita: "alta" },
          { id: "fossa.acqua.a2", testo: "Tracce di infiltrazioni pregresse (aloni, calcare, ruggine)", raccomandazione: "Chiedere all'amministratore un controllo dell'impermeabilizzazione", priorita: "media" },
        ],
        chiarimenti: ["Chiedere al manutentore se in passato la fossa si è allagata e con quale frequenza."],
      },
      {
        id: "fossa.arresto", testo: "Dispositivo di arresto in fossa: presenza e identificazione (non azionato dal consulente)",
        anomalie: [
          { id: "fossa.arresto.a1", testo: "Dispositivo di arresto in fossa non individuato", raccomandazione: "Chiedere al manutentore dove si trova e se è funzionante (prova eseguita dal manutentore)", priorita: "media" },
          { id: "fossa.arresto.a2", testo: "Dispositivo di arresto danneggiato o privo di indicazione", raccomandazione: "Chiedere al manutentore la riparazione e l'etichettatura", priorita: "media" },
        ],
        chiarimenti: [],
      },
      {
        id: "fossa.dotazioni", testo: "Luce, presa di corrente e comando della luce del vano raggiungibili dalla fossa",
        anomalie: [
          { id: "fossa.dotazioni.a1", testo: "Nessun comando di illuminazione raggiungibile dalla fossa", raccomandazione: "Chiedere al manutentore un parere sull'aggiunta del comando", priorita: "bassa" },
          { id: "fossa.dotazioni.a2", testo: "Presa o scatola elettrica danneggiata in fossa", raccomandazione: "Chiedere al manutentore la sostituzione", priorita: "media" },
        ],
        chiarimenti: [],
      },
      {
        id: "fossa.ammortizzatori", testo: "Ammortizzatori o arresti di fine corsa: presenza, fissaggio, aspetto",
        aiuto: "Per gli ammortizzatori a olio fotografare eventuali tracce d'olio alla base.",
        anomalie: [
          { id: "fossa.ammortizzatori.a1", testo: "Ammortizzatore allentato, arrugginito o danneggiato", raccomandazione: "Chiedere al manutentore il controllo e il ripristino", priorita: "media" },
          { id: "fossa.ammortizzatori.a2", testo: "Tracce di olio alla base di un ammortizzatore a olio", raccomandazione: "Chiedere al manutentore il controllo del livello e della tenuta", priorita: "media" },
        ],
        chiarimenti: [],
      },
      {
        id: "fossa.tenditore", testo: "Puleggia tenditrice della fune del limitatore: posizione, fissaggio, contatto",
        applicabile: ["elettrico_lm", "elettrico_mrl", "oleodinamico", "montacarichi"],
        anomalie: [
          { id: "fossa.tenditore.a1", testo: "Tenditore appoggiato a terra o fuori dalla posizione di lavoro", raccomandazione: "Informare subito il manutentore perché ne accerti lo stato", priorita: "alta" },
          { id: "fossa.tenditore.a2", testo: "Tenditore arrugginito o sporco", raccomandazione: "Chiedere al manutentore la pulizia e il controllo", priorita: "bassa" },
        ],
        chiarimenti: [],
      },
      {
        id: "fossa.cilindro", testo: "Cilindro e pistone visibili: tracce di olio, ruggine, stato della testa del cilindro",
        applicabile: ["oleodinamico", "piattaforma"],
        aiuto: "Nelle piattaforme senza cilindro segnare «non applicabile».",
        anomalie: [
          { id: "fossa.cilindro.a1", testo: "Olio raccolto attorno alla base o alla testa del cilindro", raccomandazione: "Chiedere al manutentore il controllo della tenuta del cilindro", priorita: "media" },
          { id: "fossa.cilindro.a2", testo: "Pistone con rigature o ruggine visibili", raccomandazione: "Chiedere al manutentore una valutazione dello stato del pistone", priorita: "media" },
        ],
        chiarimenti: ["Chiedere al manutentore se il cilindro è interrato e se esistono informazioni sulla sua protezione."],
      },
    ],
  },
  {
    id: "tetto-cabina",
    titolo: "Tetto della cabina",
    ubicazione: "Tetto di cabina",
    voci: [
      {
        id: "tetto-cabina.stato", testo: "Stato generale del tetto: pulizia, oggetti appoggiati, parti danneggiate",
        aiuto: "Osservare solo se il manutentore porta la cabina in posizione e rende accessibile il tetto; altrimenti «non verificabile».",
        anomalie: [
          { id: "tetto-cabina.stato.a1", testo: "Oggetti, attrezzi o materiali lasciati sul tetto di cabina", raccomandazione: "Chiedere al manutentore la rimozione", priorita: "media" },
          { id: "tetto-cabina.stato.a2", testo: "Pannelli del tetto deformati o danneggiati", raccomandazione: "Chiedere al manutentore una valutazione dello stato del tetto", priorita: "media" },
        ],
        chiarimenti: [],
      },
      {
        id: "tetto-cabina.comandi", testo: "Pulsantiera di manovra di ispezione e arresto sul tetto: presenza e stato",
        aiuto: "Il funzionamento è provato dal manutentore; il consulente annota solo quanto osservato o riferito.",
        anomalie: [
          { id: "tetto-cabina.comandi.a1", testo: "Pulsantiera di ispezione danneggiata o con pulsanti mancanti", raccomandazione: "Informare subito il manutentore e chiedere la riparazione", priorita: "alta" },
          { id: "tetto-cabina.comandi.a2", testo: "Comando di arresto sul tetto non individuato", raccomandazione: "Chiedere al manutentore dove si trova (prova eseguita dal manutentore)", priorita: "media" },
        ],
        chiarimenti: [],
      },
      {
        id: "tetto-cabina.protezione", testo: "Protezione perimetrale del tetto (balaustra o parapetto) dove sono presenti vuoti verso il vano",
        anomalie: [
          { id: "tetto-cabina.protezione.a1", testo: "Nessuna protezione perimetrale verso un vuoto ampio tra tetto e pareti", raccomandazione: "Chiedere al manutentore e a un progettista una valutazione tecnica", priorita: "media" },
          { id: "tetto-cabina.protezione.a2", testo: "Balaustra allentata o danneggiata", raccomandazione: "Chiedere al manutentore la riparazione", priorita: "media" },
        ],
        chiarimenti: [],
      },
      {
        id: "tetto-cabina.botola", testo: "Botola di soccorso (se presente): chiusura e stato",
        anomalie: [
          { id: "tetto-cabina.botola.a1", testo: "Botola di soccorso non chiusa o con chiusura danneggiata", raccomandazione: "Informare subito il manutentore e chiedere il ripristino", priorita: "alta" },
        ],
        chiarimenti: [],
      },
      {
        id: "tetto-cabina.operatore", testo: "Operatore delle porte di cabina: fissaggio, cinghie o catene, cablaggi",
        anomalie: [
          { id: "tetto-cabina.operatore.a1", testo: "Cinghia o catena dell'operatore usurata o allentata", raccomandazione: "Chiedere al manutentore la sostituzione o la regolazione", priorita: "media" },
          { id: "tetto-cabina.operatore.a2", testo: "Cablaggi dell'operatore non fissati o con guaine danneggiate", raccomandazione: "Chiedere al manutentore il riordino dei cablaggi", priorita: "media" },
        ],
        chiarimenti: ["Chiedere al manutentore se l'operatore porte è stato sostituito e quando."],
      },
      {
        id: "tetto-cabina.attacchi", testo: "Attacchi delle funi o delle cinghie alla cabina, molle e coppiglie visibili",
        applicabile: ["elettrico_lm", "elettrico_mrl", "montacarichi"],
        anomalie: [
          { id: "tetto-cabina.attacchi.a1", testo: "Coppiglia o dado di sicurezza mancante su un attacco", raccomandazione: "Informare subito il manutentore perché ne accerti lo stato", priorita: "alta" },
          { id: "tetto-cabina.attacchi.a2", testo: "Molle degli attacchi con compressione visibilmente diversa", raccomandazione: "Chiedere al manutentore il controllo dell'equilibratura delle funi", priorita: "media" },
        ],
        chiarimenti: [],
      },
      {
        id: "tetto-cabina.paracadute", testo: "Tiranteria del paracadute e contatto collegato (aspetto visibile)",
        applicabile: ["elettrico_lm", "elettrico_mrl", "oleodinamico", "montacarichi"],
        anomalie: [
          { id: "tetto-cabina.paracadute.a1", testo: "Tiranteria del paracadute arrugginita, sporca o bloccata da materiali", raccomandazione: "Chiedere al manutentore pulizia e controllo", priorita: "media" },
          { id: "tetto-cabina.paracadute.a2", testo: "Contatto del paracadute scollegato o con cablaggio danneggiato", raccomandazione: "Informare subito il manutentore perché ne accerti lo stato", priorita: "alta" },
        ],
        chiarimenti: [],
      },
      {
        id: "tetto-cabina.dotazioni", testo: "Luce e presa di corrente sul tetto di cabina",
        anomalie: [
          { id: "tetto-cabina.dotazioni.a1", testo: "Luce del tetto di cabina non funzionante o assente", raccomandazione: "Chiedere al manutentore il ripristino", priorita: "bassa" },
        ],
        chiarimenti: [],
      },
    ],
  },
  {
    id: "testata",
    titolo: "Testata del vano",
    ubicazione: "Testata",
    voci: [
      {
        id: "testata.stato", testo: "Stato della testata: pulizia, oggetti appoggiati, infiltrazioni dal solaio o dalla copertura",
        aiuto: "Osservabile dal tetto di cabina solo se il manutentore lo rende accessibile.",
        anomalie: [
          { id: "testata.stato.a1", testo: "Infiltrazioni d'acqua dalla copertura nella testata", raccomandazione: "Chiedere all'amministratore la ricerca della causa e al manutentore il controllo delle parti bagnate", priorita: "media" },
          { id: "testata.stato.a2", testo: "Materiali estranei appoggiati in testata", raccomandazione: "Chiedere al manutentore la rimozione", priorita: "media" },
        ],
        chiarimenti: [],
      },
      {
        id: "testata.ancoraggi", testo: "Ganci, travi e punti di ancoraggio visibili in testata",
        anomalie: [
          { id: "testata.ancoraggi.a1", testo: "Gancio o trave in testata con ruggine estesa o danni visibili", raccomandazione: "Chiedere al manutentore e a un tecnico una valutazione strutturale", priorita: "media" },
          { id: "testata.ancoraggi.a2", testo: "Ganci di sollevamento senza indicazione del carico ammesso", raccomandazione: "Chiedere al manutentore se esistono dati sui ganci", priorita: "bassa" },
        ],
        chiarimenti: [],
      },
      {
        id: "testata.pulegge", testo: "Pulegge di rinvio o macchina in testata: protezioni e aspetto",
        applicabile: ["elettrico_lm", "elettrico_mrl", "oleodinamico", "montacarichi"],
        anomalie: [
          { id: "testata.pulegge.a1", testo: "Puleggia in testata senza protezione delle parti rotanti", raccomandazione: "Chiedere al manutentore una valutazione dell'aggiunta delle protezioni", priorita: "media" },
          { id: "testata.pulegge.a2", testo: "Tracce di olio o rumorosità dei cuscinetti delle pulegge", raccomandazione: "Chiedere al manutentore il controllo dei cuscinetti", priorita: "media" },
        ],
        chiarimenti: [],
      },
      {
        id: "testata.arresto", testo: "Dispositivo di arresto nel locale delle pulegge di rinvio (se esiste un locale)",
        applicabile: ["elettrico_lm", "montacarichi"],
        anomalie: [
          { id: "testata.arresto.a1", testo: "Dispositivo di arresto nel locale pulegge non individuato", raccomandazione: "Chiedere al manutentore dove si trova (prova eseguita dal manutentore)", priorita: "media" },
        ],
        chiarimenti: ["Chiedere al manutentore se esiste un locale pulegge separato e come si accede."],
      },
    ],
  },
];
