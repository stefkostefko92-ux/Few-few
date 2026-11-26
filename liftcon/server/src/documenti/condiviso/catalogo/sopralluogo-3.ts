// Каталог на огледа, част 3: кабина, врати на кабината, врати на етажите и площадки, нормално движение,
// табели и надписи. Консултантът ползва асансьора само като пътник; пробите са на manutentore.
import type { SezioneChecklist } from "../tipi.js";

export const SEZIONI_3: SezioneChecklist[] = [
  {
    id: "cabina",
    titolo: "Cabina",
    ubicazione: "Cabina",
    voci: [
      {
        id: "cabina.pareti", testo: "Pareti, rivestimenti, corrimano, specchio e accessori: integrità e fissaggio",
        anomalie: [
          { id: "cabina.pareti.a1", testo: "Pannello o rivestimento staccato, con spigoli o parti taglienti esposte", raccomandazione: "Informare subito il manutentore e chiedere la messa in sicurezza", priorita: "alta" },
          { id: "cabina.pareti.a2", testo: "Rivestimenti rovinati, graffiati o con atti vandalici", raccomandazione: "Chiedere un preventivo per il ripristino delle finiture", priorita: "bassa" },
          { id: "cabina.pareti.a3", testo: "Specchio o corrimano allentato", raccomandazione: "Chiedere al manutentore il fissaggio", priorita: "media" },
        ],
        chiarimenti: [],
      },
      {
        id: "cabina.pavimento", testo: "Pavimento della cabina: usura, parti sollevate, dislivelli, scivolosità",
        anomalie: [
          { id: "cabina.pavimento.a1", testo: "Pavimento con bordi sollevati o parti che possono far inciampare", raccomandazione: "Chiedere al manutentore la riparazione del pavimento", priorita: "media" },
          { id: "cabina.pavimento.a2", testo: "Pavimento consumato o macchiato", raccomandazione: "Chiedere un preventivo per il rifacimento del pavimento", priorita: "bassa" },
        ],
        chiarimenti: [],
      },
      {
        id: "cabina.illuminazione", testo: "Illuminazione normale della cabina: lampade accese e luce uniforme",
        anomalie: [
          { id: "cabina.illuminazione.a1", testo: "Cabina buia o con una parte delle lampade spente", raccomandazione: "Chiedere al manutentore la sostituzione delle lampade", priorita: "media" },
          { id: "cabina.illuminazione.a2", testo: "Plafoniera danneggiata o con parti elettriche visibili", raccomandazione: "Informare subito il manutentore e chiedere la riparazione", priorita: "alta" },
        ],
        chiarimenti: [],
      },
      {
        id: "cabina.emergenza", testo: "Luce di emergenza della cabina: presenza e accensione in mancanza di rete",
        aiuto: "La prova con l'alimentazione tolta è eseguita dal manutentore; annotare se è stata fatta.",
        anomalie: [
          { id: "cabina.emergenza.a1", testo: "Luce di emergenza non individuata in cabina", raccomandazione: "Chiedere al manutentore se esiste e dove si trova", priorita: "media" },
          { id: "cabina.emergenza.a2", testo: "Luce di emergenza non accesa durante la prova del manutentore", raccomandazione: "Informare subito il manutentore e chiedere il ripristino", priorita: "alta" },
        ],
        chiarimenti: ["Chiedere al manutentore quando sono state sostituite le batterie dell'illuminazione di emergenza."],
      },
      {
        id: "cabina.bottoniera", testo: "Pulsantiera di cabina: pulsanti integri e leggibili, segnalazioni luminose, indicatore di posizione, caratteri in rilievo",
        anomalie: [
          { id: "cabina.bottoniera.a1", testo: "Pulsante rotto, bloccato o senza indicazione leggibile", raccomandazione: "Chiedere al manutentore la sostituzione del pulsante", priorita: "media" },
          { id: "cabina.bottoniera.a2", testo: "Segnalazioni luminose o indicatore di posizione non funzionanti", raccomandazione: "Chiedere al manutentore il ripristino", priorita: "bassa" },
          { id: "cabina.bottoniera.a3", testo: "Pulsantiera con placca allentata o parti interne esposte", raccomandazione: "Informare subito il manutentore e chiedere la messa in sicurezza", priorita: "alta" },
        ],
        chiarimenti: [],
      },
      {
        id: "cabina.allarme", testo: "Allarme e comunicazione bidirezionale: pulsante, prova di chiamata, chi risponde",
        aiuto: "La chiamata di prova è eseguita dal manutentore. Annotare chi risponde e in quanto tempo, come riferito.",
        anomalie: [
          { id: "cabina.allarme.a1", testo: "Chiamata di allarme senza risposta durante la prova del manutentore", raccomandazione: "Informare subito il manutentore e l'amministratore e chiedere il ripristino del collegamento", priorita: "alta" },
          { id: "cabina.allarme.a2", testo: "Pulsante di allarme non riconoscibile o senza simbolo", raccomandazione: "Chiedere al manutentore di rendere riconoscibile il pulsante", priorita: "media" },
          { id: "cabina.allarme.a3", testo: "Comunicazione disturbata o di difficile comprensione", raccomandazione: "Chiedere al manutentore il controllo dell'apparato fonico", priorita: "media" },
        ],
        chiarimenti: ["Chiedere al manutentore a quale centrale arrivano le chiamate e con quale linea (fissa, mobile)."],
      },
      {
        id: "cabina.targa", testo: "Targa in cabina con i dati dell'impianto: presenza e leggibilità",
        aiuto: "I dati da esporre sono elencati nel DPR 162/1999, art. 16, c. 3. Fotografare la targa.",
        anomalie: [
          { id: "cabina.targa.a1", testo: "Targa assente in cabina", raccomandazione: "Chiedere al manutentore e all'amministratore l'apposizione della targa", priorita: "media" },
          { id: "cabina.targa.a2", testo: "Targa illeggibile o con dati non aggiornati (ad esempio il soggetto delle verifiche periodiche)", raccomandazione: "Chiedere all'amministratore l'aggiornamento della targa", priorita: "bassa" },
        ],
        chiarimenti: [],
      },
      {
        id: "cabina.aerazione", testo: "Aperture di aerazione della cabina libere",
        anomalie: [
          { id: "cabina.aerazione.a1", testo: "Aperture di aerazione coperte o ostruite", raccomandazione: "Chiedere al manutentore di liberarle", priorita: "media" },
        ],
        chiarimenti: [],
      },
    ],
  },
  {
    id: "porte-cabina",
    titolo: "Porte di cabina e protezione in chiusura",
    ubicazione: "Cabina",
    voci: [
      {
        id: "porte-cabina.stato", testo: "Ante, guide, pattini e soglia della porta di cabina: danni e giochi visibili",
        anomalie: [
          { id: "porte-cabina.stato.a1", testo: "Anta deformata, urtata o che sporge dalla guida", raccomandazione: "Informare subito il manutentore perché ne accerti lo stato", priorita: "alta" },
          { id: "porte-cabina.stato.a2", testo: "Soglia di cabina sporca o con detriti nella guida", raccomandazione: "Chiedere al manutentore la pulizia", priorita: "bassa" },
          { id: "porte-cabina.stato.a3", testo: "Pattini consumati con ante che oscillano", raccomandazione: "Chiedere al manutentore la sostituzione dei pattini", priorita: "media" },
        ],
        chiarimenti: [],
      },
      {
        id: "porte-cabina.protezione", testo: "Dispositivo di protezione in chiusura (barriera o costola): presenza e riapertura",
        aiuto: "La riapertura si osserva durante la prova eseguita dal manutentore; il consulente non interrompe le porte.",
        anomalie: [
          { id: "porte-cabina.protezione.a1", testo: "Nessun dispositivo di protezione in chiusura individuato", raccomandazione: "Chiedere al manutentore e a un progettista una valutazione tecnica dell'intervento", priorita: "media" },
          { id: "porte-cabina.protezione.a2", testo: "Porta che non riapre durante la prova del manutentore", raccomandazione: "Informare subito il manutentore e chiedere il ripristino", priorita: "alta" },
        ],
        chiarimenti: [],
      },
      {
        id: "porte-cabina.chiusura", testo: "Chiusura in servizio normale: urti, rimbalzi, rumori, ripetizioni",
        anomalie: [
          { id: "porte-cabina.chiusura.a1", testo: "Porta che si chiude con urto o rumore marcato", raccomandazione: "Chiedere al manutentore la regolazione dell'operatore", priorita: "media" },
          { id: "porte-cabina.chiusura.a2", testo: "Porta che si apre e si richiude più volte prima della partenza", raccomandazione: "Chiedere al manutentore l'individuazione della causa", priorita: "media" },
        ],
        chiarimenti: ["Chiedere al manutentore se i fermi registrati riguardano spesso le porte."],
      },
      {
        id: "porte-cabina.vetri", testo: "Parti vetrate della porta di cabina: integrità e marcature",
        anomalie: [
          { id: "porte-cabina.vetri.a1", testo: "Vetro scheggiato, incrinato o con guarnizione staccata", raccomandazione: "Informare subito il manutentore e chiedere la sostituzione", priorita: "alta" },
          { id: "porte-cabina.vetri.a2", testo: "Marcatura del vetro non visibile", raccomandazione: "Chiedere al manutentore la documentazione del vetro installato", priorita: "bassa" },
        ],
        chiarimenti: [],
      },
      {
        id: "porte-cabina.assenza", testo: "Presenza di una porta sull'accesso di cabina",
        aiuto: "Negli impianti più vecchi la cabina può essere priva di porta: annotare e fotografare.",
        anomalie: [
          { id: "porte-cabina.assenza.a1", testo: "Cabina priva di porta: durante la corsa la parete del vano scorre davanti all'accesso", raccomandazione: "Chiedere al manutentore e a un progettista una valutazione tecnica dell'intervento", priorita: "media" },
        ],
        chiarimenti: [],
      },
    ],
  },
  {
    id: "porte-piano",
    titolo: "Porte di piano e pianerottoli",
    ubicazione: "Pianerottoli",
    voci: [
      {
        id: "porte-piano.stato", testo: "Ante e telai delle porte di piano a ogni fermata: danni, deformazioni, parti vetrate",
        aiuto: "Annotare il piano di ogni anomalia nella nota e fotografare.",
        anomalie: [
          { id: "porte-piano.stato.a1", testo: "Anta deformata o con segni di forzatura", raccomandazione: "Informare subito il manutentore perché ne accerti lo stato", priorita: "alta" },
          { id: "porte-piano.stato.a2", testo: "Vetro della porta di piano incrinato o scheggiato", raccomandazione: "Informare subito il manutentore e chiedere la sostituzione", priorita: "alta" },
          { id: "porte-piano.stato.a3", testo: "Vernice rovinata o ruggine superficiale", raccomandazione: "Chiedere un preventivo per il ripristino delle finiture", priorita: "bassa" },
        ],
        chiarimenti: [],
      },
      {
        id: "porte-piano.chiusura", testo: "Chiusura delle porte di piano dopo il passaggio, senza intervento dell'utente",
        anomalie: [
          { id: "porte-piano.chiusura.a1", testo: "Porta di piano che resta socchiusa dopo il passaggio", raccomandazione: "Informare subito il manutentore e chiedere la regolazione", priorita: "alta" },
          { id: "porte-piano.chiusura.a2", testo: "Porta che si chiude con urto o lentamente", raccomandazione: "Chiedere al manutentore la regolazione del chiudiporta", priorita: "media" },
        ],
        chiarimenti: [],
      },
      {
        id: "porte-piano.cabina-assente", testo: "Porte di piano con cabina assente: ante chiuse, nessun varco visibile",
        aiuto: "Solo osservazione: non tentare di aprire. L'efficienza delle serrature è riferita dal manutentore.",
        anomalie: [
          { id: "porte-piano.cabina-assente.a1", testo: "Porta di piano trovata aperta o socchiusa con la cabina a un altro piano", raccomandazione: "Informare subito il manutentore perché valuti l'eventuale fermo dell'impianto", priorita: "alta" },
          { id: "porte-piano.cabina-assente.a2", testo: "Fessura visibile tra le ante o tra anta e telaio", raccomandazione: "Chiedere al manutentore la regolazione delle ante", priorita: "media" },
        ],
        chiarimenti: ["Chiedere al manutentore l'esito dell'ultimo controllo delle serrature delle porte di piano."],
      },
      {
        id: "porte-piano.sblocco", testo: "Foro o dispositivo di sblocco di emergenza: presenza della copertura e stato",
        anomalie: [
          { id: "porte-piano.sblocco.a1", testo: "Copertura del foro di sblocco mancante o danneggiata", raccomandazione: "Chiedere al manutentore il ripristino", priorita: "media" },
        ],
        chiarimenti: ["Chiedere all'amministratore chi custodisce la chiave di sblocco e chi è autorizzato a usarla."],
      },
      {
        id: "porte-piano.soglie", testo: "Soglie di piano: pulizia della guida, danni, detriti",
        anomalie: [
          { id: "porte-piano.soglie.a1", testo: "Guida della soglia ostruita da sporcizia o detriti", raccomandazione: "Chiedere al manutentore la pulizia", priorita: "bassa" },
          { id: "porte-piano.soglie.a2", testo: "Soglia danneggiata o allentata", raccomandazione: "Chiedere al manutentore la riparazione", priorita: "media" },
        ],
        chiarimenti: [],
      },
      {
        id: "porte-piano.pianerottolo", testo: "Pianerottolo davanti alla porta: illuminazione e spazio libero da ostacoli",
        anomalie: [
          { id: "porte-piano.pianerottolo.a1", testo: "Pianerottolo poco illuminato davanti alla porta di piano", raccomandazione: "Chiedere all'amministratore il controllo dell'illuminazione delle parti comuni", priorita: "media" },
          { id: "porte-piano.pianerottolo.a2", testo: "Oggetti o arredi che ingombrano lo spazio davanti alla porta", raccomandazione: "Chiedere all'amministratore di liberare lo spazio", priorita: "bassa" },
        ],
        chiarimenti: [],
      },
      {
        id: "porte-piano.bottoniere", testo: "Pulsanti di chiamata ai piani e segnalazioni",
        anomalie: [
          { id: "porte-piano.bottoniere.a1", testo: "Pulsante di chiamata rotto o con parti interne esposte", raccomandazione: "Informare subito il manutentore e chiedere la messa in sicurezza", priorita: "alta" },
          { id: "porte-piano.bottoniere.a2", testo: "Segnalazione di chiamata registrata o di posizione non funzionante", raccomandazione: "Chiedere al manutentore il ripristino", priorita: "bassa" },
          { id: "porte-piano.bottoniere.a3", testo: "Chiamata dal piano non registrata o servita con ritardo marcato durante l'osservazione", raccomandazione: "Chiedere al manutentore l'individuazione della causa", priorita: "bassa" },
        ],
        chiarimenti: [],
      },
      {
        id: "porte-piano.marcature", testo: "Targhette o marcature identificative sulle porte di piano (se presenti)",
        anomalie: [
          { id: "porte-piano.marcature.a1", testo: "Nessuna targhetta identificativa visibile sulle porte di piano", raccomandazione: "Chiedere al manutentore i dati delle porte installate", priorita: "bassa" },
        ],
        chiarimenti: ["Chiedere all'amministratore se l'edificio ha documenti di prevenzione incendi che riguardano le porte di piano o il vano."],
      },
    ],
  },
  {
    id: "marcia",
    titolo: "Marcia osservata in servizio normale",
    ubicazione: "Cabina",
    voci: [
      {
        id: "marcia.avvio-arresto", testo: "Partenza e arresto: sobbalzi, strappi, scatti",
        aiuto: "Osservare alcune corse in salita e in discesa come normale passeggero.",
        anomalie: [
          { id: "marcia.avvio-arresto.a1", testo: "Sobbalzo marcato alla partenza o all'arresto", raccomandazione: "Chiedere al manutentore la regolazione dell'azionamento", priorita: "media" },
          { id: "marcia.avvio-arresto.a2", testo: "Arresto brusco e inatteso durante la corsa", raccomandazione: "Informare subito il manutentore perché ne accerti la causa", priorita: "alta" },
        ],
        chiarimenti: [],
      },
      {
        id: "marcia.rumori", testo: "Rumori percepiti in cabina durante la corsa (sfregamenti, colpi, fischi)",
        anomalie: [
          { id: "marcia.rumori.a1", testo: "Rumore di sfregamento o colpi in un tratto della corsa", raccomandazione: "Chiedere al manutentore l'individuazione della causa", priorita: "media" },
          { id: "marcia.rumori.a2", testo: "Rumore della marcia avvertito negli alloggi vicini (riferito)", raccomandazione: "Chiedere al manutentore un parere sulle cause e sui possibili interventi", priorita: "bassa" },
        ],
        chiarimenti: [],
      },
      {
        id: "marcia.vibrazioni", testo: "Vibrazioni e oscillazioni della cabina durante la corsa",
        anomalie: [
          { id: "marcia.vibrazioni.a1", testo: "Vibrazioni o oscillazioni laterali percepibili", raccomandazione: "Chiedere al manutentore il controllo di guide e pattini", priorita: "media" },
        ],
        chiarimenti: [],
      },
      {
        id: "marcia.livellamento", testo: "Allineamento tra pavimento di cabina e piano all'arresto",
        aiuto: "Osservare a ogni fermata se si forma un gradino; fotografare con un riferimento visivo.",
        anomalie: [
          { id: "marcia.livellamento.a1", testo: "Gradino percepibile tra cabina e piano a una o più fermate", raccomandazione: "Chiedere al manutentore la regolazione delle fermate", priorita: "media" },
          { id: "marcia.livellamento.a2", testo: "Gradino marcato che può far inciampare", raccomandazione: "Informare subito il manutentore e chiedere la regolazione", priorita: "alta" },
        ],
        chiarimenti: [],
      },
      {
        id: "marcia.deriva", testo: "Abbassamento della cabina durante la sosta al piano",
        applicabile: ["oleodinamico", "piattaforma"],
        anomalie: [
          { id: "marcia.deriva.a1", testo: "Cabina che si abbassa durante la sosta con le porte aperte", raccomandazione: "Chiedere al manutentore il controllo della tenuta del circuito", priorita: "media" },
        ],
        chiarimenti: ["Chiedere al manutentore se la cabina si ripristina da sola al piano e con quale frequenza."],
      },
      {
        id: "marcia.fermi", testo: "Fermi, guasti e persone bloccate in cabina negli ultimi mesi (riferito)",
        anomalie: [
          { id: "marcia.fermi.a1", testo: "Fermi frequenti riferiti dall'amministratore o dagli utenti", raccomandazione: "Chiedere al manutentore l'elenco degli interventi e un'analisi delle cause", priorita: "media" },
          { id: "marcia.fermi.a2", testo: "Persone rimaste bloccate in cabina in più occasioni (riferito)", raccomandazione: "Chiedere al manutentore un'analisi delle cause e delle azioni previste", priorita: "media" },
        ],
        chiarimenti: ["Chiedere al manutentore il numero di chiamate per guasto dell'ultimo anno.", "Chiedere all'amministratore se ci sono state segnalazioni scritte dei condomini."],
      },
    ],
  },
  {
    id: "segnaletica",
    titolo: "Targhe, avvisi e istruzioni sul posto",
    ubicazione: "Piani / cabina",
    voci: [
      {
        id: "segnaletica.uso", testo: "Avvertenze d'uso esposte in cabina",
        anomalie: [
          { id: "segnaletica.uso.a1", testo: "Avvertenze d'uso non esposte o illeggibili", raccomandazione: "Chiedere al manutentore e all'amministratore di esporle", priorita: "bassa" },
        ],
        chiarimenti: [],
      },
      {
        id: "segnaletica.soccorso", testo: "Indicazioni per chiedere soccorso e riferimenti del manutentore",
        anomalie: [
          { id: "segnaletica.soccorso.a1", testo: "Nessuna indicazione visibile per richiedere soccorso", raccomandazione: "Chiedere al manutentore di esporre le indicazioni", priorita: "media" },
          { id: "segnaletica.soccorso.a2", testo: "Riferimenti del manutentore non aggiornati", raccomandazione: "Chiedere all'amministratore l'aggiornamento", priorita: "bassa" },
        ],
        chiarimenti: [],
      },
      {
        id: "segnaletica.incendio", testo: "Avviso sull'uso dell'ascensore in caso di incendio (se presente)",
        anomalie: [
          { id: "segnaletica.incendio.a1", testo: "Nessun avviso visibile sull'uso in caso di incendio", raccomandazione: "Chiedere al manutentore e all'amministratore se è previsto e dove esporlo", priorita: "bassa" },
        ],
        chiarimenti: [],
      },
      {
        id: "segnaletica.uso-consentito", testo: "Indicazione dell'uso consentito (solo merci o anche persone) e della portata ai piani",
        applicabile: ["montacarichi"],
        anomalie: [
          { id: "segnaletica.uso-consentito.a1", testo: "Nessuna indicazione visibile sull'uso consentito dell'impianto", raccomandazione: "Chiedere al manutentore di esporre l'indicazione", priorita: "media" },
          { id: "segnaletica.uso-consentito.a2", testo: "Uso osservato o riferito diverso da quello indicato", raccomandazione: "Chiedere all'amministratore un chiarimento con gli utenti e con il manutentore", priorita: "media" },
        ],
        chiarimenti: ["Chiedere all'amministratore chi utilizza l'impianto e per quali carichi."],
      },
    ],
  },
];
