// Ръководства 1–4: проверки, поддръжка, книжка. Фактите са сверени с действащия DPR 162/1999.
// Всеки раздел започва с директния отговор (AEO); препратките са към конкретни членове.

import { F } from "./fonti.mjs";
import { R } from "../routes.mjs";

const A = (href, text) => `<a href="${href}">${text}</a>`;

export const G_PERIODICA = {
  slug: "verifica-periodica-ascensore",
  menu: "Verifica periodica",
  title: "Verifica periodica dell'ascensore: ogni 2 anni | LiftCon",
  description:
    "Ogni quanto va fatta la verifica periodica dell'ascensore, chi deve chiederla, chi può eseguirla e che cosa succede dopo il verbale (DPR 162/1999, art. 13).",
  keywords: ["verifica periodica ascensore", "verifica biennale ascensore", "DPR 162/1999 art. 13", "ATS Milano ascensori", "organismo notificato ascensore", "Carbon Stealth"],
  h1: "Verifica periodica dell'ascensore: ogni quanto e chi la esegue",
  lead:
    "L'ascensore va sottoposto a verifica periodica ogni due anni. Lo prevede l'articolo 13 del DPR 162/1999, che mette l'obbligo a carico del proprietario dello stabile o del suo legale rappresentante; la verifica la eseguono ingegneri dei soggetti abilitati indicati dallo stesso articolo.",
  sezioni: [
    {
      h2: "Chi deve far eseguire la verifica periodica?",
      html: `<p class="answer">Il proprietario dello stabile o il suo legale rappresentante: in condominio, di norma, l'amministratore.</p><p>Lo stesso articolo chiede anche di garantire una manutenzione regolare dell'impianto. Le due cose vanno insieme: il manutentore cura l'impianto nel tempo, il verificatore controlla ogni due anni che le condizioni di sicurezza siano rispettate.</p>`,
    },
    {
      h2: "Chi può eseguire la verifica?",
      html: `<p class="answer">Ingegneri di uno dei soggetti elencati dall'articolo 13, comma 1, del DPR 162/1999, scelto dal proprietario.</p><ul><li>L'ASL competente, oppure l'ARPA se la legge regionale le attribuisce la funzione.</li><li>La direzione territoriale del lavoro, per gli impianti di stabilimenti industriali o aziende agricole.</li><li>Gli uffici del Ministero competenti per il trasporto pubblico, per gli impianti di quel settore.</li><li>Gli organismi notificati per le procedure di valutazione della conformità previste dal regolamento.</li><li>Gli organismi di ispezione di tipo A accreditati secondo la norma UNI CEI EN ISO/IEC 17020:2012.</li></ul><p>In Lombardia l'ente pubblico competente è l'ATS, che ha preso il posto della ASL. ATS Milano Città Metropolitana, per esempio, accetta l'incarico su domanda del proprietario.</p>`,
    },
    {
      h2: "Che cosa controlla la verifica periodica?",
      html: `<p class="answer">Che le parti da cui dipende la sicurezza siano efficienti, che i dispositivi di sicurezza funzionino e che le prescrizioni delle verifiche precedenti siano state attuate.</p><p>Le operazioni materiali sull'impianto durante la verifica le esegue il manutentore, su indicazione del verificatore. Per questo conviene concordare la data con entrambi e avere a disposizione il libretto dell'impianto.</p>`,
    },
    {
      h2: "Che cosa succede dopo la verifica?",
      html: `<p class="answer">Il verificatore consegna il verbale al proprietario e alla ditta di manutenzione; se l'esito è negativo lo comunica anche al Comune.</p><p>Con un esito negativo il Comune dispone il fermo dell'impianto, che può tornare in servizio solo dopo una ${A(
        "/guide/verifica-straordinaria-ascensore/",
        "verifica straordinaria",
      )} con esito favorevole (art. 14, comma 1). Le prescrizioni riportate nel verbale vanno risolte: alla verifica successiva il verificatore controlla che siano state attuate.</p>`,
    },
    {
      h2: "Come prepararsi alla verifica periodica?",
      html: `<p class="answer">Con il libretto aggiornato, le prescrizioni precedenti risolte e documentate, e la data concordata con il manutentore.</p><ul><li>Rileggere il verbale precedente e controllare che ogni prescrizione abbia una risposta documentata (rapportino, fattura, fotografia).</li><li>Verificare che sul libretto siano annotate le visite di manutenzione.</li><li>Raccogliere le segnalazioni dei condomini degli ultimi mesi e sottoporle al manutentore prima della verifica.</li></ul><p>Se il quadro documentale è confuso, una ${A(
        R.sopralluogo,
        "ricognizione tecnica",
      )} o un ${A(R.supporto, "supporto al committente")} aiutano a mettere ordine prima della data.</p>`,
    },
  ],
  faq: [
    { q: "Ogni quanto si fa la verifica periodica dell'ascensore?", a: "Ogni due anni, come prevede l'articolo 13 del DPR 162/1999." },
    {
      q: "Il manutentore può eseguire la verifica periodica?",
      a: "No. Il manutentore esegue la manutenzione e i controlli previsti dall'articolo 15; la verifica periodica spetta ai soggetti abilitati indicati dall'articolo 13.",
    },
    {
      q: "Il proprietario può scegliere chi esegue la verifica?",
      a: "Sì: sceglie tra i soggetti abilitati elencati dall'articolo 13, comma 1, per esempio l'ente pubblico competente (in Lombardia l'ATS) o un organismo notificato o di ispezione accreditato.",
    },
  ],
  fonti: [F.dpr162art13, F.dpr162art14, F.dpr8, F.atsMilano],
  correlati: ["verifica", "sopralluogo"],
};

export const G_STRAORDINARIA = {
  slug: "verifica-straordinaria-ascensore",
  menu: "Verifica straordinaria",
  title: "Verifica straordinaria ascensore: quando serve | LiftCon",
  description:
    "I tre casi in cui serve la verifica straordinaria dell'ascensore (art. 14 DPR 162/1999): esito negativo, incidente, modifiche costruttive; chi la fa e chi paga.",
  keywords: ["verifica straordinaria ascensore", "modifiche costruttive ascensore", "fermo impianto ascensore", "DPR 162/1999 art. 14", "verbale negativo ascensore", "Carbon Stealth"],
  h1: "Verifica straordinaria dell'ascensore: quando serve e come prepararsi",
  lead:
    "La verifica straordinaria dell'ascensore serve in tre casi previsti dall'articolo 14 del DPR 162/1999: dopo una verifica periodica con esito negativo, dopo un incidente di notevole importanza e dopo una modifica costruttiva dell'impianto. Le spese sono a carico del proprietario dello stabile.",
  sezioni: [
    {
      h2: "Dopo una verifica periodica con esito negativo",
      html: `<p class="answer">Il Comune dispone il fermo dell'impianto finché una verifica straordinaria non dà esito favorevole.</p><p>La verifica si chiede dopo aver rimosso le cause dell'esito negativo, e il nuovo verbale deve documentare in dettaglio come sono state rimosse. Arrivare con le evidenze già raccolte (lavori eseguiti, componenti sostituiti, fotografie) rende il passaggio più ordinato.</p>`,
    },
    {
      h2: "Dopo un incidente di notevole importanza",
      html: `<p class="answer">Il proprietario deve avvisare subito il Comune, che dispone il fermo; per rimettere in servizio l'ascensore serve una verifica straordinaria con esito positivo.</p><p>L'obbligo vale anche se l'incidente non ha causato infortuni.</p>`,
    },
    {
      h2: "Dopo una modifica costruttiva",
      html: `<p class="answer">Le modifiche costruttive sono gli interventi che vanno oltre la manutenzione ordinaria e straordinaria, elencati oggi all'articolo 2, comma 1, lettera cc) del DPR 162/1999.</p><ul><li>Cambio della velocità, della portata o della corsa.</li><li>Cambio del tipo di azionamento, per esempio da idraulico a elettrico.</li><li>Sostituzione del macchinario, della cabina con la sua intelaiatura, del quadro elettrico, del gruppo cilindro-pistone, delle porte di piano, delle difese del vano o di altri componenti principali.</li></ul><p>Dopo questi interventi il proprietario rinnova la comunicazione al Comune e al soggetto delle verifiche (art. 12, comma 4) e fa eseguire la verifica straordinaria da uno dei soggetti dell'articolo 13 (art. 14, comma 3). Nei testi meno recenti la stessa definizione compare come «lettera i)»: la numerazione è cambiata con il DPR 23/2017.</p>`,
    },
    {
      h2: "Chi esegue la verifica straordinaria e chi paga?",
      html: `<p class="answer">La eseguono i soggetti abilitati per le verifiche periodiche (art. 13, comma 1); le spese sono del proprietario (art. 14, comma 4).</p>`,
    },
    {
      h2: "Come prepararsi alla verifica straordinaria?",
      html: `<p class="answer">Con un fascicolo che risponde, prescrizione per prescrizione, a ciò che il verificatore controllerà.</p><ul><li>Verbale precedente e prescrizioni da risolvere.</li><li>Evidenze dei lavori eseguiti: rapportini, documenti di fornitura, fotografie.</li><li>Libretto dell'impianto e comunicazioni al Comune.</li><li>Data concordata con il manutentore, che eseguirà le operazioni sull'impianto.</li></ul><p>La ${A(
        R.verifica,
        "preparazione documentale LiftCon",
      )} costruisce questo fascicolo e la lista dei punti da chiarire; non sostituisce la verifica e non ne anticipa l'esito.</p>`,
    },
  ],
  faq: [
    { q: "Chi paga la verifica straordinaria dell'ascensore?", a: "Il proprietario dello stabile, come prevede l'articolo 14, comma 4, del DPR 162/1999." },
    {
      q: "Sostituire le porte di piano è una modifica costruttiva?",
      a: "Sì: la sostituzione delle porte di piano è tra gli interventi elencati all'articolo 2, comma 1, lettera cc) del DPR 162/1999, e richiede la verifica straordinaria.",
    },
    {
      q: "Dopo un verbale negativo l'ascensore può restare in funzione?",
      a: "No: il Comune dispone il fermo e l'impianto torna in servizio solo dopo una verifica straordinaria con esito favorevole.",
    },
  ],
  fonti: [F.dpr162art14, F.dpr162art2, F.dpr162art12, F.dpr23],
  correlati: ["verifica", "controllo"],
};

export const G_MANUTENZIONE = {
  slug: "manutenzione-ascensore-obblighi",
  menu: "Manutenzione e obblighi",
  title: "Manutenzione ascensore: obblighi e controlli | LiftCon",
  description:
    "A chi affidare la manutenzione dell'ascensore, che cosa controlla il manutentore ogni sei mesi e quali obblighi ha il proprietario (DPR 162/1999, art. 15).",
  keywords: ["manutenzione ascensore obblighi", "manutentore ascensore", "controlli semestrali ascensore", "contratto manutenzione ascensore", "DPR 162/1999 art. 15", "Carbon Stealth"],
  h1: "Manutenzione dell'ascensore: obblighi del proprietario e del manutentore",
  lead:
    "Il proprietario deve affidare la manutenzione dell'ascensore a una persona con certificato di abilitazione o a una ditta specializzata (art. 15 del DPR 162/1999). Almeno ogni sei mesi il manutentore controlla i dispositivi di sicurezza, le funi e le catene, l'isolamento e la messa a terra, e annota gli esiti sul libretto.",
  sezioni: [
    {
      h2: "A chi va affidata la manutenzione?",
      html: `<p class="answer">A una persona munita di certificato di abilitazione, a una ditta specializzata o a un operatore dell'Unione europea con specializzazione equivalente, che opera tramite personale abilitato.</p><p>Il certificato di abilitazione lo rilascia il Prefetto dopo una prova teorico-pratica.</p>`,
    },
    {
      h2: "Che cosa controlla il manutentore ogni sei mesi?",
      html: `<p class="answer">Almeno ogni sei mesi per gli ascensori, e almeno una volta l'anno per i montacarichi, il manutentore:</p><ul><li>verifica integrità ed efficienza del paracadute, del limitatore di velocità e degli altri dispositivi di sicurezza;</li><li>esamina funi, catene e i loro attacchi;</li><li>controlla l'isolamento dell'impianto elettrico e l'efficienza dei collegamenti a terra;</li><li>annota i risultati sul libretto dell'impianto.</li></ul><p>Oltre a questi controlli, le visite periodiche seguono le esigenze dell'impianto e quanto previsto dal contratto.</p>`,
    },
    {
      h2: "Che cosa succede se il manutentore rileva un pericolo?",
      html: `<p class="answer">Deve fermare l'impianto fino alla riparazione e informare il proprietario, il soggetto incaricato delle verifiche periodiche e il Comune.</p><p>Il manutentore deve anche promuovere per tempo la riparazione o la sostituzione delle parti rotte o logorate; il proprietario deve provvedere prontamente.</p>`,
    },
    {
      h2: "Come leggere il contratto di manutenzione?",
      html: `<p class="answer">Distinguendo ciò che è compreso nel canone da ciò che viene preventivato a parte.</p><ul><li>Numero e contenuto delle visite programmate.</li><li>Interventi su chiamata: orari, tempi e costi.</li><li>Ricambi: quali sono compresi e quali no.</li><li>Assistenza durante le verifiche periodiche e straordinarie.</li><li>Durata, rinnovo e modalità di disdetta.</li></ul><p>Quando arrivano preventivi aggiuntivi, l'${A(
        R.preventivi,
        "analisi dei preventivi",
      )} aiuta a capire che cosa è già coperto dal contratto e che cosa no.</p>`,
    },
  ],
  faq: [
    {
      q: "Ogni quanto passa il manutentore dell'ascensore?",
      a: "Il DPR 162/1999 fissa i controlli sui dispositivi di sicurezza almeno ogni sei mesi per gli ascensori; la frequenza delle altre visite dipende dall'impianto e dal contratto.",
    },
    {
      q: "Il manutentore può fermare l'ascensore?",
      a: "Sì: se rileva un pericolo in atto deve fermare l'impianto fino alla riparazione e informare proprietario, soggetto delle verifiche e Comune.",
    },
    {
      q: "Dove vengono annotati i controlli del manutentore?",
      a: "Sul libretto dell'impianto, che raccoglie anche i verbali delle verifiche e le comunicazioni con il Comune.",
    },
  ],
  fonti: [F.dpr162art15, F.dpr162art16, F.dpr23],
  correlati: ["preventivi", "supporto"],
};

export const G_LIBRETTO = {
  slug: "libretto-ascensore-targa-cabina",
  menu: "Libretto e targa in cabina",
  title: "Libretto dell'ascensore e targa in cabina | LiftCon",
  description:
    "Che cosa contiene il libretto dell'ascensore, quando va reso disponibile e quali dati deve riportare la targa esposta in cabina (DPR 162/1999, art. 16).",
  keywords: ["libretto ascensore", "targa cabina ascensore", "matricola ascensore", "documenti ascensore condominio", "DPR 162/1999 art. 16", "Carbon Stealth"],
  h1: "Il libretto dell'ascensore e la targa in cabina",
  lead:
    "Il libretto dell'impianto raccoglie i verbali delle verifiche periodiche e straordinarie, gli esiti delle visite di manutenzione, la copia della dichiarazione di conformità e le comunicazioni con il Comune, compresa quella della matricola (art. 16 del DPR 162/1999). In cabina devono essere esposte le avvertenze d'uso e una targa con i dati essenziali dell'impianto.",
  sezioni: [
    {
      h2: "Che cosa contiene il libretto dell'ascensore?",
      html: `<p class="answer">Quattro gruppi di documenti, annotati o allegati:</p><ul><li>i verbali delle verifiche periodiche e straordinarie;</li><li>gli esiti delle visite di manutenzione;</li><li>la copia della dichiarazione di conformità dell'impianto;</li><li>le comunicazioni del proprietario al Comune e la comunicazione del Comune con il numero di matricola.</li></ul>`,
    },
    {
      h2: "Quando va reso disponibile il libretto?",
      html: `<p class="answer">Durante le verifiche periodiche e straordinarie: il proprietario o il suo legale rappresentante deve metterlo a disposizione del verificatore.</p>`,
    },
    {
      h2: "Che cosa riporta la targa in cabina?",
      html: `<p class="answer">La targa indica chi esegue le verifiche periodiche, l'installatore o il fabbricante con il numero di fabbricazione, il numero di matricola, la portata in chilogrammi e, se del caso, il numero massimo di persone.</p><p>Accanto alla targa vanno esposte le avvertenze per l'uso dell'ascensore.</p>`,
    },
    {
      h2: "Il libretto è incompleto: che cosa fare?",
      html: `<p class="answer">Ricostruire il quadro documento per documento, chiedendo le copie a chi le ha emesse.</p><ul><li>Verbali: al soggetto che ha eseguito le verifiche.</li><li>Esiti di manutenzione e rapportini: al manutentore.</li><li>Comunicazioni e matricola: all'ufficio comunale competente.</li></ul><p>Un ${A(R.relazioni, "esame documentale")} restituisce l'elenco dei documenti ricevuti e di quelli mancanti, utile prima di una verifica o di un cambio di manutentore.</p>`,
    },
  ],
  faq: [
    { q: "Che cos'è la matricola dell'ascensore?", a: "È il numero che il Comune assegna all'impianto dopo la comunicazione di messa in esercizio; compare sul libretto e sulla targa in cabina." },
    {
      q: "Il libretto deve contenere i verbali delle verifiche?",
      a: "Sì: i verbali delle verifiche periodiche e straordinarie vanno annotati o allegati al libretto, insieme agli esiti delle visite di manutenzione.",
    },
    {
      q: "Chi deve esporre la targa in cabina?",
      a: "Il proprietario o il suo legale rappresentante, come prevede l'articolo 16 del DPR 162/1999.",
    },
  ],
  fonti: [F.dpr162art16, F.dpr162art12],
  correlati: ["relazioni", "verifica"],
};
