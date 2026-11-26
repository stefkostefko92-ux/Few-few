// Услуги от т. 1 на каталога („Consulenza tecnica indipendente“): оглед и контрол на работите.
// Всяко твърдение остава в рамките на т. 1–4; ограниченията са от т. 8 (не сме verifica ufficiale).

import { R } from "../routes.mjs";

export const SOPRALLUOGO = {
  key: "sopralluogo",
  path: R.sopralluogo,
  gruppo: "consulenza",
  nome: "Sopralluogo tecnico",
  menu: "Condizioni osservabili dell'impianto, descritte e fotografate.",
  title: "Sopralluogo tecnico ascensore a Milano | LiftCon",
  description:
    "Sopralluogo tecnico descrittivo dell'ascensore a Milano e in Lombardia: cabina, porte, accessi, vano e locali tecnici, con relazione e report fotografico.",
  keywords: [
    "sopralluogo tecnico ascensore",
    "sopralluogo ascensore Milano",
    "stato ascensore condominio",
    "relazione di sopralluogo ascensore",
    "consulenza ascensori Lombardia",
    "Carbon Stealth",
  ],
  h1: "Sopralluogo tecnico dell'ascensore",
  lead:
    "Il sopralluogo tecnico descrittivo registra in modo ordinato le condizioni osservabili dell'impianto — cabina, porte, accessi, vano e locali tecnici — e le consegna in una relazione con fotografie. Serve a sapere com'è davvero l'ascensore prima di decidere un preventivo, un intervento o un confronto con il manutentore.",
  perChi: [
    "Amministratori che prendono in carico un nuovo condominio e vogliono un quadro iniziale dell'impianto.",
    "Proprietari e gestori immobiliari che devono decidere se riparare, ammodernare o chiedere nuovi preventivi.",
    "Committenti che ricevono segnalazioni ripetute di guasti e vogliono capire che cosa si vede sull'impianto.",
  ],
  comprende: [
    ["Sopralluogo conoscitivo", "Raccolta delle informazioni disponibili e descrizione delle condizioni osservabili dell'impianto."],
    [
      "Esame dello stato apparente",
      "Cabina, porte di piano e di cabina, accessi, vano e locali tecnici, nei limiti di accessibilità e sicurezza del giorno del sopralluogo.",
    ],
    ["Documentazione fotografica", "Fotografie numerate, con l'ubicazione di ogni osservazione sull'impianto."],
    ["Anomalie e punti da chiarire", "Elenco delle anomalie osservate e delle domande da sottoporre al manutentore."],
  ],
  fasi: [
    ["Richiesta e documenti", "Ci descrive l'impianto e la situazione; raccogliamo libretto, ultimi verbali e contratto di manutenzione, se disponibili."],
    ["Lettera d'incarico", "Oggetto, impianto, attività incluse ed escluse, tempi e compenso, messi per iscritto prima di iniziare."],
    ["Sopralluogo coordinato", "L'accesso ai locali tecnici e al vano si concorda con il manutentore, che resta l'unico a operare sull'impianto."],
    ["Relazione", "Relazione descrittiva con report fotografico, anomalie osservate e punti da chiarire."],
  ],
  consegne: ["Relazione descrittiva di sopralluogo", "Report fotografico delle condizioni osservate", "Elenco delle anomalie osservate, con ubicazione e fotografie"],
  limiti: [
    "Descrive condizioni osservabili: non è una verifica periodica o straordinaria ai sensi del DPR 162/1999.",
    "Non è una certificazione di sicurezza o di conformità dell'ascensore.",
    "Non comprende prove o manovre sull'impianto: le parti non accessibili in sicurezza sono indicate nella relazione come non esaminate.",
  ],
  faq: [
    {
      q: "Il sopralluogo sostituisce la verifica periodica dell'ascensore?",
      a: "No. La verifica periodica è prevista dal DPR 162/1999 e la eseguono i soggetti abilitati indicati dal regolamento. Il sopralluogo LiftCon descrive le condizioni osservabili e aiuta il committente a preparare domande e decisioni.",
    },
    {
      q: "Serve la presenza del manutentore?",
      a: "Per entrare nei locali tecnici e nel vano sì: l'accesso si coordina con il manutentore dell'impianto. Le aree che non si possono esaminare in sicurezza vengono indicate nella relazione.",
    },
    {
      q: "Quali documenti conviene preparare?",
      a: "Il libretto dell'impianto, gli ultimi verbali di verifica, il contratto di manutenzione, i rapportini recenti e gli eventuali preventivi in discussione. Ogni documento ricevuto viene elencato nella relazione.",
    },
  ],
  correlati: ["controllo", "relazioni", "preventivi"],
};

export const CONTROLLO = {
  key: "controllo",
  path: R.controllo,
  gruppo: "consulenza",
  nome: "Controllo qualità dei lavori",
  menu: "Lavori richiesti, dichiarati e osservati: il confronto punto per punto.",
  title: "Controllo qualità lavori ascensore | LiftCon",
  description:
    "Controllo qualità dei lavori sull'ascensore: sostituzioni, avanzamento, fine lavori e correzioni, confrontati con preventivo, ordine e documenti.",
  keywords: [
    "controllo qualità lavori ascensore",
    "controllo fine lavori ascensore",
    "verifica sostituzione componenti ascensore",
    "ammodernamento ascensore condominio",
    "consulenza tecnica ascensori Milano",
    "Carbon Stealth",
  ],
  h1: "Controllo qualità dei lavori sull'ascensore",
  lead:
    "Quando il condominio paga una riparazione, una sostituzione o un ammodernamento, deve poter sapere che cosa è stato fatto. Il controllo qualità confronta ciò che era stato richiesto e preventivato con ciò che è stato dichiarato, documentato e osservato sull'impianto.",
  perChi: [
    "Amministratori che devono autorizzare il saldo di un intervento approvato in assemblea.",
    "Committenti che seguono un ammodernamento lungo, con più fasi e più fornitori.",
    "Proprietari che vogliono un riscontro indipendente sui componenti dichiarati come sostituiti.",
  ],
  comprende: [
    ["Controllo qualità delle lavorazioni", "Riscontro delle lavorazioni visibili rispetto a preventivo, ordine o capitolato."],
    ["Controllo delle sostituzioni", "Riscontro documentale e visivo dei componenti dichiarati come sostituiti."],
    ["Controllo di avanzamento", "Documentazione dello stato dei lavori durante riparazioni e ammodernamenti."],
    ["Controllo di fine lavori", "Elenco delle attività ancora da completare e delle anomalie osservate prima della chiusura."],
    ["Controllo di corrispondenza", "Confronto tra lavori richiesti, lavori dichiarati, documenti disponibili e situazione osservata."],
    ["Secondo sopralluogo", "Riscontro delle correzioni dichiarate dopo la segnalazione delle anomalie."],
  ],
  fasi: [
    ["Prima dei lavori", "Fissiamo il riferimento: preventivo, ordine o capitolato, con l'elenco delle lavorazioni attese."],
    ["Durante i lavori", "Documentiamo l'avanzamento alle scadenze concordate, con fotografie e note."],
    ["A fine lavori", "Confrontiamo il dichiarato con l'osservato e consegniamo l'elenco delle anomalie e delle attività da completare."],
    ["Dopo le correzioni", "Con un secondo sopralluogo riscontriamo le correzioni dichiarate dall'impresa."],
  ],
  consegne: [
    "Rapporto di controllo qualità delle lavorazioni commissionate",
    "Rapporto di avanzamento lavori",
    "Elenco delle anomalie osservate, con ubicazione e fotografie",
    "Rapporto di riscontro delle correzioni dichiarate",
  ],
  limiti: [
    "Riguarda le lavorazioni visibili e i documenti messi a disposizione: non è un collaudo.",
    "Se l'intervento è una modifica costruttiva, la verifica straordinaria prevista dal DPR 162/1999 resta di competenza dei soggetti abilitati: il controllo la precede o l'affianca, non la sostituisce.",
    "Quando un dato non è riscontrabile (per esempio un componente non visibile), la relazione lo dice in modo esplicito.",
  ],
  faq: [
    {
      q: "Conviene chiamarvi prima o dopo i lavori?",
      a: "Prima, quando è possibile: con il preventivo o il capitolato come riferimento, ogni fase successiva ha un termine di confronto chiaro. Il controllo di fine lavori si può comunque richiedere anche a lavori conclusi.",
    },
    {
      q: "Che cosa succede se trovate anomalie?",
      a: "Le elenchiamo con ubicazione e fotografie e le mettiamo a disposizione del committente, che le sottopone all'impresa. Dopo le correzioni dichiarate, un secondo sopralluogo ne registra il riscontro.",
    },
    {
      q: "Potete dire se un componente è stato davvero sostituito?",
      a: "Confrontiamo i documenti di fornitura con ciò che è visibile sull'impianto. Se un componente non è osservabile in sicurezza o i documenti non bastano, la relazione lo indica come non riscontrato.",
    },
  ],
  correlati: ["preventivi", "sopralluogo", "relazioni"],
};

export const PREVENTIVI = {
  key: "preventivi",
  path: R.preventivi,
  gruppo: "supporto",
  nome: "Analisi dei preventivi",
  menu: "Offerte rese confrontabili, voce per voce, prima dell'assemblea.",
  title: "Analisi preventivi ascensore condominio | LiftCon",
  description:
    "Analisi e confronto dei preventivi per manutenzione, riparazione e ammodernamento dell'ascensore, con richieste di offerta e capitolati descrittivi.",
  keywords: [
    "confronto preventivi ascensore",
    "preventivo ammodernamento ascensore",
    "capitolato ascensore condominio",
    "costi manutenzione ascensore",
    "consulenza ascensori amministratori",
    "Carbon Stealth",
  ],
  h1: "Analisi e confronto dei preventivi per l'ascensore",
  lead:
    "Tre preventivi per lo stesso intervento raramente descrivono lo stesso lavoro. Li rendiamo confrontabili — stesse voci, stesse quantità, stesse esclusioni — così l'assemblea decide su basi omogenee e l'amministratore può spiegare la scelta.",
  perChi: [
    "Amministratori che devono presentare all'assemblea offerte diverse per lo stesso intervento.",
    "Proprietari che valutano un ammodernamento e non sanno come leggere le voci tecniche.",
    "Committenti che vogliono una richiesta d'offerta uguale per tutti i fornitori.",
  ],
  comprende: [
    ["Analisi comparativa", "Preventivi per manutenzione, riparazione e ammodernamento messi a confronto voce per voce."],
    ["Confronto tecnico-commerciale", "Soluzioni, componenti e condizioni delle offerte dei diversi fornitori."],
    ["Richieste d'offerta e capitolati descrittivi", "Un testo unico da inviare a tutti i fornitori, quando non costituisce progettazione riservata."],
    ["Riscontro contabile-tecnico", "Confronto tra preventivo, ordine, rapportini d'intervento e fatture."],
    ["Pianificazione", "Supporto nel decidere l'ordine degli interventi e nella richiesta dei preventivi."],
  ],
  fasi: [
    ["Raccolta", "Riceviamo i preventivi e i documenti dell'impianto disponibili."],
    ["Normalizzazione", "Riportiamo ogni offerta sulle stesse voci, segnalando le differenze di oggetto, esclusioni e condizioni."],
    ["Domande ai fornitori", "Prepariamo l'elenco dei chiarimenti da chiedere, quando le offerte non sono confrontabili."],
    ["Prospetto per l'assemblea", "Consegniamo un prospetto comparativo leggibile anche da chi non è tecnico."],
  ],
  consegne: ["Prospetto comparativo delle offerte", "Elenco dei chiarimenti da chiedere ai fornitori", "Capitolato descrittivo e richiesta di offerta, nei limiti delle competenze"],
  limiti: [
    "Il capitolato descrittivo non è un progetto: se l'intervento richiede progettazione o calcoli riservati a professionisti abilitati, lo indichiamo.",
    "Il confronto non sceglie il fornitore al posto dell'assemblea: rende chiare le differenze su cui decidere.",
  ],
  faq: [
    {
      q: "Che cosa confrontate in un preventivo per l'ascensore?",
      a: "Oggetto dei lavori, componenti indicati, quantità, opere escluse (per esempio quelle edili o elettriche a monte), tempi e fermo dell'impianto, garanzie, condizioni di pagamento e ciò che resta a carico del condominio.",
    },
    {
      q: "Potete scrivere voi la richiesta d'offerta?",
      a: "Sì: prepariamo una richiesta d'offerta e un capitolato descrittivo uguali per tutti i fornitori, così le risposte arrivano già confrontabili. Se servono progettazione o calcoli riservati, lo segnaliamo.",
    },
    {
      q: "Controllate anche fatture e rapportini?",
      a: "Sì. Confrontiamo preventivo, ordine, rapportini d'intervento e fatture e segnaliamo le voci che non trovano corrispondenza.",
    },
  ],
  correlati: ["controllo", "supporto", "sopralluogo"],
};
