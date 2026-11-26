// Страници по аудитория: администратори на кондоминиуми и собственици/частни лица.

import { esc, join, checkList } from "../lib/html.mjs";
import { pageHead, section, faqList, ctaBand, ledger } from "../blocks.mjs";
import { faqPage } from "../lib/schema.mjs";
import { R } from "../routes.mjs";

function momenti(list, byKey) {
  return `<ol class="moments">${join(
    list,
    ([quando, testo, keys]) =>
      `<li class="moment"><h3>${esc(quando)}</h3><p>${testo}</p><p class="moment-links">${join(keys, (k) => `<a href="${byKey[k].path}">${esc(byKey[k].nome)}</a>`, "")}</p></li>`,
  )}</ol>`;
}

export function amministratoriPage(ctx) {
  const faq = [
    {
      q: "Perché un amministratore dovrebbe affidarsi a un consulente tecnico per l'ascensore?",
      a: "Per avere un riferimento scritto, dalla parte del committente, su preventivi, lavori e documenti, da portare in assemblea e da conservare agli atti, senza dover entrare da solo nel merito tecnico.",
    },
    {
      q: "Chi ha l'obbligo di far eseguire la verifica periodica in condominio?",
      a: "Il proprietario dello stabile o il suo legale rappresentante, cioè di norma l'amministratore, come prevede l'articolo 13 del DPR 162/1999.",
    },
    {
      q: "La relazione LiftCon può essere allegata al verbale di assemblea?",
      a: "Sì: indica oggetto, limiti e documenti esaminati ed è scritta per essere letta anche da chi non è tecnico.",
    },
    {
      q: "Lavorate per più condomini dello stesso amministratore?",
      a: "Sì. Ogni impianto ha la sua lettera d'incarico e il suo fascicolo, così documenti e questioni aperte restano separati.",
    },
  ];
  const body = [
    pageHead({
      h1: "Consulenza tecnica ascensori per amministratori di condominio",
      lead: "L'ascensore è la parte comune che genera più domande in assemblea: preventivi difficili da confrontare, lavori da controllare, verbali con prescrizioni. LiftCon affianca l'amministratore con relazioni scritte, prospetti comparativi e supporto negli incontri, a Milano e in tutta la Lombardia.",
    }),
    section(
      "momenti",
      "Dove interveniamo nella vita dell'impianto",
      momenti(
        [
          ["Quando prende in carico un condominio", "Un sopralluogo descrittivo e un esame dei documenti per sapere com'è l'impianto e che cosa manca nel libretto.", ["sopralluogo", "relazioni"]],
          ["Prima dell'assemblea", "Preventivi resi confrontabili e un prospetto leggibile da tutti, con le domande ancora aperte per i fornitori.", ["preventivi", "supporto"]],
          ["Durante i lavori", "Controllo dell'avanzamento rispetto a preventivo e ordine, con fotografie e note alle scadenze concordate.", ["controllo"]],
          ["Prima del saldo", "Confronto tra lavori ordinati, dichiarati e osservati; elenco delle anomalie e secondo sopralluogo dopo le correzioni.", ["controllo", "relazioni"]],
          ["Dopo un verbale con prescrizioni", "Fascicolo documentale e punti da chiarire prima della verifica straordinaria.", ["verifica"]],
          ["Nella gestione ordinaria", "Registro delle criticità segnalate dai condomini, archivio tecnico e report periodici.", ["supporto"]],
        ],
        ctx.byKey,
      ),
      { intro: "Ogni momento corrisponde a un servizio con un risultato scritto." },
    ),
    section(
      "vantaggi",
      "Che cosa cambia per l'amministratore",
      checkList(
        [
          "Decisioni motivate: ogni proposta all'assemblea si appoggia a un documento con oggetto, limiti e fonti.",
          "Meno discussioni tecniche in assemblea: le differenze tra le offerte sono già evidenziate.",
          "Un interlocutore tecnico per manutentore e imprese, con punti discussi e impegni verbalizzati.",
          "Un fascicolo dell'impianto ordinato, utile anche al prossimo amministratore.",
        ],
        "plain",
      ),
      { cls: "tint" },
    ),
    ledger({ title: "Il nostro ruolo, senza ambiguità" }),
    section("domande", "Domande frequenti degli amministratori", faqList(faq)),
    `<div class="wrap more-links"><p>Approfondimenti: <a href="/guide/verifica-periodica-ascensore/">verifica periodica</a>, <a href="/guide/spese-ascensore-condominio-ripartizione/">spese dell'ascensore in condominio</a>, <a href="/guide/confrontare-preventivi-ascensore/">come confrontare i preventivi</a>.</p></div>`,
    ctaBand({ title: "Un impianto da tenere sotto controllo?" }),
  ].join("\n");
  return {
    path: R.amministratori,
    title: "Consulenza ascensori per amministratori | LiftCon",
    description:
      "Consulenza tecnica ascensori per amministratori di condominio in Lombardia: preventivi, controllo lavori, assemblee e preparazione alle verifiche.",
    keywords: ["amministratore condominio ascensore", "ascensore condominio", "lavori straordinari ascensore condominio", "manutenzione ascensore condominio", "consulente tecnico amministratore condominio", "Carbon Stealth"],
    breadcrumbs: [{ name: "Amministratori di condominio", path: R.amministratori }],
    body,
    schema: (page) => [faqPage(page, faq)],
    priority: 0.9,
    changefreq: "monthly",
  };
}

export function proprietariPage(ctx) {
  const faq = [
    {
      q: "Sono un condomino: posso chiedere un sopralluogo sull'ascensore?",
      a: "Sì, ma l'ascensore è una parte comune: per accedere all'impianto e ai locali tecnici servono l'accordo dell'amministratore e il coordinamento con il manutentore. Possiamo comunque esaminare i documenti che ha a disposizione.",
    },
    {
      q: "Sto comprando casa in un condominio con ascensore: che cosa conviene controllare?",
      a: "Che il libretto riporti verifiche periodiche regolari, se l'ultimo verbale contiene prescrizioni ancora aperte e se l'assemblea ha deliberato lavori sull'ascensore. Un esame documentale mette in fila questi punti.",
    },
    {
      q: "Ho un edificio di proprietà con ascensore: quali sono i miei obblighi principali?",
      a: "Affidare la manutenzione a un soggetto abilitato e far eseguire la verifica periodica ogni due anni, come prevedono gli articoli 13 e 15 del DPR 162/1999.",
    },
  ];
  const body = [
    pageHead({
      h1: "Consulenza tecnica ascensori per proprietari e privati",
      lead: "Che si tratti di un edificio di proprietà, di un immobile da acquistare o di un ascensore che si ferma troppo spesso, il primo passo è sapere com'è davvero l'impianto. LiftCon descrive condizioni, documenti e lavori in una relazione chiara, prima che lei debba decidere o pagare.",
    }),
    section(
      "situazioni",
      "Le situazioni più comuni",
      `<div class="cases">${join(
        [
          ["Edificio di proprietà con ascensore", "Obblighi di manutenzione e verifica, preventivi da valutare, lavori da controllare.", R.sopralluogo, "Sopralluogo tecnico"],
          ["Acquisto di un immobile", "Libretto, ultimi verbali e prescrizioni aperte: che cosa dicono i documenti dell'impianto.", R.relazioni, "Esame documentale"],
          ["Un preventivo da valutare", "Una proposta di riparazione o ammodernamento letta voce per voce, con le domande da fare.", R.preventivi, "Analisi dei preventivi"],
          ["Lavori appena conclusi", "Confronto tra ciò che è stato ordinato, dichiarato e osservato, prima del saldo.", R.controllo, "Controllo qualità dei lavori"],
        ],
        ([t, d, href, cta]) => `<div class="case"><h3>${esc(t)}</h3><p>${esc(d)}</p><a href="${href}">${esc(cta)}</a></div>`,
      )}</div>`,
    ),
    section(
      "come",
      "Come funziona un incarico",
      checkList(
        [
          "Ci descrive l'impianto e la situazione, per telefono o con il modulo di contatto.",
          "Le inviamo una lettera d'incarico con oggetto, attività incluse ed escluse, tempi e compenso.",
          "Svolgiamo l'esame dei documenti e, se previsto, il sopralluogo coordinato con il manutentore.",
          "Riceve una relazione scritta, con il nome dell'autore, fotografie e punti da chiarire.",
        ],
        "plain",
      ),
      { cls: "tint" },
    ),
    ledger({ title: "Che cosa può aspettarsi, e che cosa no" }),
    section("domande", "Domande frequenti dei proprietari", faqList(faq)),
    ctaBand(),
  ].join("\n");
  return {
    path: R.proprietari,
    title: "Consulenza ascensori per proprietari e privati | LiftCon",
    description:
      "Consulenza tecnica ascensori per proprietari e privati in Lombardia: sopralluogo, esame dei documenti, preventivi e controllo dei lavori prima di pagare.",
    keywords: ["ascensore privato", "manutenzione ascensore privato", "obblighi proprietario ascensore", "acquisto casa con ascensore", "preventivo ascensore privato", "Carbon Stealth"],
    breadcrumbs: [{ name: "Proprietari e privati", path: R.proprietari }],
    body,
    schema: (page) => [faqPage(page, faq)],
    priority: 0.9,
    changefreq: "monthly",
  };
}
