// Услуги от т. 2–4 на каталога: подкрепа на възложителя, подготовка за verifica straordinaria, доклади.

import { R } from "../routes.mjs";

export const SUPPORTO = {
  key: "supporto",
  path: R.supporto,
  gruppo: "supporto",
  nome: "Supporto tecnico al committente",
  menu: "Riunioni, assemblee, registro delle criticità e archivio tecnico.",
  title: "Supporto tecnico ascensore per condomini | LiftCon",
  description:
    "Supporto tecnico al committente per l'ascensore: incontri con il manutentore, assemblee condominiali, registro delle criticità e archivio documentale.",
  keywords: ["amministratore condominio ascensore", "assemblea condominio ascensore", "manutenzione straordinaria ascensore condominio", "lavori straordinari ascensore condominio", "fermo ascensore condominiale", "Carbon Stealth"],
  h1: "Supporto tecnico al committente e in assemblea",
  lead:
    "Le decisioni sull'ascensore si prendono tra amministratore, condomini, manutentore e imprese. Le seguiamo al fianco del committente: prepariamo gli incontri, verbalizziamo i punti discussi e teniamo in ordine segnalazioni, documenti e questioni aperte.",
  perChi: [
    "Amministratori che gestiscono più condomini e vogliono un interlocutore tecnico stabile.",
    "Consiglieri e condomini incaricati di seguire un intervento sull'ascensore.",
    "Gestori immobiliari con più impianti da tenere sotto controllo.",
  ],
  comprende: [
    ["Incontri con le imprese", "Partecipazione agli incontri con manutentore, installatore o impresa esecutrice e verbalizzazione dei punti discussi."],
    ["Assemblee condominiali", "Assistenza tecnica durante le riunioni, con spiegazioni comprensibili anche a chi non è tecnico."],
    ["Registro delle criticità", "Raccolta delle segnalazioni dei condomini e registro da sottoporre al manutentore."],
    ["Archivio tecnico", "Organizzazione e archiviazione della documentazione dell'impianto."],
    ["Report periodici", "Stato delle attività e delle questioni aperte, alle scadenze concordate."],
  ],
  fasi: [
    ["Ricognizione", "Raccogliamo documenti, segnalazioni e questioni aperte sull'impianto."],
    ["Agenda", "Prepariamo i punti da discutere con il manutentore o in assemblea."],
    ["Incontro", "Partecipiamo e verbalizziamo i punti discussi e gli impegni presi."],
    ["Seguito", "Aggiorniamo il registro delle criticità e il report sulle questioni aperte."],
  ],
  consegne: ["Verbale di riunione o confronto tecnico", "Registro delle criticità da sottoporre al manutentore", "Report periodici sulle questioni aperte", "Archivio documentale ordinato"],
  limiti: [
    "Non sostituiamo il manutentore né l'impresa: ogni operazione sull'impianto resta di loro competenza.",
    "Le decisioni restano all'assemblea e all'amministratore; il nostro compito è renderle informate.",
  ],
  faq: [
    {
      q: "Potete partecipare all'assemblea del condominio?",
      a: "Sì, su incarico dell'amministratore: illustriamo i punti tecnici all'ordine del giorno e rispondiamo alle domande dei condomini, senza sostituirci alle decisioni dell'assemblea.",
    },
    {
      q: "A che cosa serve il registro delle criticità?",
      a: "Mette in fila le segnalazioni dei condomini (fermi, rumori, porte che non chiudono) con data e descrizione, così il manutentore riceve richieste precise e ogni punto ha una risposta tracciata.",
    },
    {
      q: "Lavorate anche a distanza?",
      a: "L'esame dei documenti, la preparazione degli incontri e i report si possono svolgere a distanza; sopralluoghi e assemblee in presenza si concordano nella lettera d'incarico.",
    },
  ],
  correlati: ["preventivi", "verifica", "relazioni"],
};

export const VERIFICA = {
  key: "verifica",
  path: R.verifica,
  gruppo: "preverifica",
  nome: "Preparazione alla verifica straordinaria",
  menu: "Documenti in ordine e punti chiari prima della verifica ufficiale.",
  title: "Preparazione verifica straordinaria ascensore | LiftCon",
  description:
    "Preparazione documentale alla verifica straordinaria dell'ascensore: documenti, prescrizioni dei verbali, evidenze dei lavori e punti da chiarire.",
  keywords: ["verifica straordinaria ascensore", "preparazione verifica straordinaria ascensore", "verbale verifica periodica ascensore", "prescrizioni verbale ascensore", "fermo ascensore condominiale", "Carbon Stealth"],
  h1: "Preparazione documentale alla verifica straordinaria",
  lead:
    "Prima della verifica straordinaria ordiniamo i documenti dell'impianto, controlliamo che le prescrizioni dei verbali precedenti abbiano una risposta documentata e prepariamo i punti da chiarire con il manutentore e con l'organismo incaricato. La verifica resta di competenza dei soggetti previsti dal DPR 162/1999.",
  perChi: [
    "Condomini con un verbale di verifica periodica negativo o con prescrizioni da risolvere.",
    "Committenti che hanno concluso una modifica costruttiva e attendono la verifica straordinaria.",
    "Amministratori che vogliono arrivare alla verifica con documenti completi e responsabilità chiare.",
  ],
  comprende: [
    ["Raccolta e ordinamento", "Documenti disponibili sull'impianto e sugli interventi, ordinati in un fascicolo."],
    ["Documenti mancanti", "Verifica della presenza dei documenti richiesti o indicati dal committente e segnalazione delle mancanze."],
    ["Prescrizioni precedenti", "Esame documentale delle prescrizioni riportate nei verbali precedenti."],
    ["Controllo visivo", "Parti interessate dai lavori, se accessibili in sicurezza."],
    ["Evidenze dei lavori", "Raccolta delle evidenze sugli interventi dichiarati come completati."],
    ["Lista dei punti", "Questioni da sottoporre al manutentore o all'organismo incaricato della verifica."],
    ["Coordinamento", "Organizzazione con manutentore e soggetto incaricato della verifica ufficiale."],
  ],
  fasi: [
    ["Fascicolo", "Raccogliamo verbali, libretto, documenti dei lavori e corrispondenza."],
    ["Riscontro", "Per ogni prescrizione cerchiamo l'evidenza documentale e, se accessibile, quella visiva."],
    ["Punti aperti", "Prepariamo la lista delle questioni da chiarire prima della data della verifica."],
    ["Report", "Consegniamo il report con fotografie, documenti esaminati e questioni da chiarire."],
  ],
  consegne: [
    "Relazione di esame documentale con documenti ricevuti e mancanti",
    "Report con fotografie, osservazioni e questioni da chiarire",
    "Lista dei punti per il manutentore e per l'organismo incaricato",
  ],
  limiti: [
    "Non sostituisce la verifica straordinaria prevista dal DPR 162/1999 e non ne anticipa l'esito.",
    "Non rilascia verbali ufficiali né attestazioni riservate agli organismi competenti.",
    "Le operazioni sull'impianto durante la verifica le esegue il manutentore, su indicazione del verificatore.",
  ],
  faq: [
    {
      q: "Chi esegue la verifica straordinaria dell'ascensore?",
      a: "I soggetti abilitati previsti dal DPR 162/1999 per le verifiche, su richiesta del proprietario o del suo legale rappresentante. LiftCon prepara i documenti e i punti da chiarire, ma non esegue la verifica.",
    },
    {
      q: "Potete garantire l'esito positivo della verifica?",
      a: "No. L'esito dipende dalle condizioni dell'impianto e dalla valutazione del verificatore. La preparazione riduce il rischio di arrivare con documenti incompleti o prescrizioni senza risposta.",
    },
    {
      q: "Quando serve una verifica straordinaria?",
      a: "Il DPR 162/1999 la prevede dopo un esito negativo della verifica periodica, dopo un incidente di notevole importanza e dopo le modifiche costruttive dell'impianto. La guida dedicata spiega i casi con i riferimenti agli articoli.",
    },
  ],
  correlati: ["relazioni", "controllo", "supporto"],
};

export const RELAZIONI = {
  key: "relazioni",
  path: R.relazioni,
  gruppo: "documenti",
  nome: "Relazioni e report fotografici",
  menu: "Relazioni scritte: che cosa è stato visto, documentato e chiarito.",
  title: "Relazioni tecniche e report ascensore | LiftCon",
  description:
    "Relazioni di sopralluogo, report fotografici, verbali di riunione e rapporti di controllo per ascensori in condominio, a Milano e in Lombardia.",
  keywords: ["relazione tecnica ascensore", "report fotografico ascensore", "ricostruzione libretto ascensore", "documenti ascensore condominio", "esame documentale ascensore", "Carbon Stealth"],
  h1: "Relazioni tecniche e report fotografici",
  lead:
    "Ogni incarico si chiude con un documento scritto: che cosa è stato esaminato, che cosa si è osservato, quali documenti sono arrivati e quali mancano, quali punti restano da chiarire. È il documento che l'amministratore allega agli atti e porta in assemblea.",
  perChi: [
    "Amministratori che devono documentare le decisioni prese sull'impianto.",
    "Committenti che vogliono un riferimento scritto da condividere con manutentore e imprese.",
    "Proprietari che hanno bisogno di una descrizione ordinata dell'impianto.",
  ],
  comprende: [
    ["Relazione descrittiva di sopralluogo", "Condizioni osservate, documenti ricevuti e limiti dell'esame."],
    ["Report fotografico", "Fotografie numerate con l'ubicazione di ogni osservazione."],
    ["Rapporto di controllo qualità", "Lavorazioni commissionate confrontate con quanto osservato."],
    ["Elenco delle anomalie", "Ubicazione e documentazione fotografica di ogni anomalia osservata."],
    ["Verbale di riunione", "Punti discussi e impegni presi in un incontro o confronto tecnico."],
    ["Rapporto di avanzamento", "Stato dei lavori alle scadenze concordate."],
    ["Rapporto di riscontro", "Correzioni dichiarate dall'impresa e loro riscontro."],
    ["Relazione di esame documentale", "Documenti ricevuti e documenti mancanti."],
    ["Capitolato e richiesta d'offerta", "Testo descrittivo per i fornitori, nei limiti delle competenze."],
    ["Relazione finale", "Limiti dell'incarico, osservazioni e raccomandazioni."],
  ],
  fasi: [
    ["Dati dell'incarico", "Committente, impianto, oggetto, attività incluse ed escluse."],
    ["Attività svolte", "Che cosa è stato esaminato, quando e con quali limiti di accesso."],
    ["Osservazioni", "Fotografie, ubicazione e descrizione, separando osservato, dichiarato e documentato."],
    ["Conclusioni", "Anomalie, punti da chiarire e raccomandazioni, con la firma dell'autore."],
  ],
  consegne: ["Documento in PDF con nome dell'autore", "Fotografie numerate e richiamate nel testo", "Elenco dei documenti ricevuti e di quelli mancanti"],
  limiti: [
    "La relazione identifica l'autore e documenta le attività effettivamente svolte.",
    "LiftCon non è un organismo notificato né un organismo di ispezione: la relazione non è un verbale di verifica.",
    "Non diventa per questo una certificazione di conformità, un collaudo o una verifica ufficiale.",
  ],
  faq: [
    {
      q: "La relazione LiftCon vale come certificazione dell'ascensore?",
      a: "No. Documenta le attività svolte e le condizioni osservate; certificazioni di conformità, collaudi e verifiche ufficiali spettano ai soggetti previsti dalle norme.",
    },
    {
      q: "Posso allegare la relazione al verbale dell'assemblea?",
      a: "Sì: è scritta per essere letta anche da chi non è tecnico e indica sempre oggetto, limiti e documenti esaminati, così chi la legge sa su che cosa si basa.",
    },
    {
      q: "In che formato ricevo la relazione?",
      a: "In PDF, con il nome dell'autore, le fotografie numerate e richiamate nel testo. Formato e tempi di consegna sono indicati nella lettera d'incarico.",
    },
  ],
  correlati: ["sopralluogo", "controllo", "verifica"],
};
