// /servizi/ (хъб), /metodo/, /chi-siamo/.

import { esc, join, checkList, abs } from "../lib/html.mjs";
import { pageHead, section, steps, ctaBand, ledger, serviceRows, picture } from "../blocks.mjs";
import { howTo } from "../lib/schema.mjs";
import { R } from "../routes.mjs";
import { SITE, COMPANY } from "../config.mjs";
import { PROCESSO } from "./home.mjs";

export function serviziHub(ctx) {
  return {
    path: R.servizi,
    title: "Servizi di consulenza tecnica ascensori | LiftCon",
    description:
      "Sopralluogo tecnico, controllo qualità dei lavori, analisi dei preventivi, supporto al committente, preparazione alla verifica straordinaria e relazioni.",
    keywords: ["servizi consulenza ascensori", "consulenza tecnica ascensori", "controllo lavori ascensore", "analisi preventivi ascensore", "verifica straordinaria ascensore preparazione", "Carbon Stealth"],
    breadcrumbs: [{ name: "Servizi", path: R.servizi }],
    pageType: "CollectionPage",
    body: [
      pageHead({
        h1: "Servizi di consulenza tecnica per ascensori",
        lead: "Sei servizi, organizzati in quattro aree: conoscere l'impianto, controllare i lavori, decidere sui preventivi e arrivare preparati alla verifica. Ognuno si chiude con un documento scritto e firmato.",
      }),
      `<div class="wrap svc-hub">${serviceRows(ctx.servizi, ctx.gruppi)}</div>`,
      ledger(),
      section("come", "Come funziona un incarico", steps(PROCESSO), { cls: "tint" }),
      ctaBand(),
    ].join("\n"),
    schema: (page) => [
      {
        "@type": "ItemList",
        "@id": `${abs(SITE.url, page.path)}#servizi`,
        itemListElement: ctx.servizi.map((s, i) => ({ "@type": "ListItem", position: i + 1, url: abs(SITE.url, s.path), name: s.h1 })),
      },
    ],
    priority: 0.95,
    changefreq: "monthly",
  };
}

const PRINCIPI = [
  ["Descriviamo, non certifichiamo", "Le nostre relazioni riportano fatti, documenti e condizioni osservate. Non attestano la conformità né la sicurezza dell'impianto."],
  ["Osservato, dichiarato, documentato", "In ogni relazione teniamo separato ciò che abbiamo visto, ciò che ci è stato dichiarato e ciò che risulta dai documenti."],
  ["Scriviamo anche ciò che non abbiamo potuto esaminare", "Le parti non accessibili in sicurezza o i documenti mancanti sono elencati in modo esplicito."],
  ["Nessuna prova o manovra sull'impianto", "Le operazioni sull'ascensore restano al manutentore. Il sopralluogo si coordina con lui."],
  ["Il committente decide", "Mettiamo in fila elementi e differenze; le decisioni restano all'assemblea, all'amministratore o al proprietario."],
];

const LETTERA = [
  "Oggetto dell'incarico e impianto interessato",
  "Identificazione del committente",
  "Attività incluse ed escluse",
  "Elenco dei documenti messi a disposizione",
  "Regole di accesso ai locali e coordinamento con il manutentore",
  "Esclusione di prove e manovre non previste o non sicure",
  "Indicazione che il rapporto non sostituisce verifiche ufficiali o certificazioni",
  "Compenso, trasferte, tempi di consegna e modalità di pagamento",
  "Trattamento di fotografie e dati personali",
];

export function metodoPage() {
  const body = [
    pageHead({
      h1: "Il metodo LiftCon",
      lead: "Un consulente tecnico è utile solo se è chiaro che cosa ha fatto e su che cosa si basa. Per questo ogni incarico ha una lettera scritta, un perimetro dichiarato e una relazione che separa ciò che è stato osservato da ciò che è stato dichiarato.",
    }),
    section("principi", "Cinque principi di lavoro", `<dl class="scope">${join(PRINCIPI, ([t, d]) => `<div><dt>${esc(t)}</dt><dd>${esc(d)}</dd></div>`)}</dl>`),
    section("processo", "Le fasi di ogni incarico", steps(PROCESSO), { cls: "tint" }),
    section(
      "lettera",
      "Che cosa contiene la lettera d'incarico",
      `<p class="answer">Tutto ciò che serve a sapere prima che cosa verrà fatto, come e a quali condizioni.</p>${checkList(LETTERA)}`,
    ),
    ledger({ title: "Che cosa facciamo, e che cosa non facciamo mai" }),
    section(
      "norme",
      "Il quadro di riferimento",
      `<p>Il nostro lavoro si colloca accanto agli obblighi che le norme assegnano ad altri soggetti, senza sostituirli:</p>${checkList(
        [
          "il DPR 162/1999 per manutenzione, verifiche periodiche e straordinarie, libretto e messa in esercizio;",
          "il DM 37/2008 per le attività riservate alle imprese abilitate e per le dichiarazioni di conformità;",
          "il Codice civile per le decisioni e le spese in condominio.",
        ],
        "plain",
      )}<p>Le <a href="${R.guide}">guide</a> spiegano questi obblighi con i riferimenti agli articoli.</p>`,
    ),
    ctaBand(),
  ].join("\n");
  return {
    path: R.metodo,
    title: "Il metodo e i limiti dell'incarico | LiftCon",
    description:
      "Come lavora LiftCon: lettera d'incarico scritta, relazioni che separano osservato e dichiarato, nessuna prova sull'impianto, nessuna verifica ufficiale.",
    keywords: ["metodo consulenza ascensori", "lettera d'incarico consulente", "relazione tecnica ascensore", "limiti consulenza ascensore", "consulenza ascensori trasparente", "Carbon Stealth"],
    breadcrumbs: [{ name: "Il metodo", path: R.metodo }],
    body,
    schema: (page) => [howTo(page, "Le fasi di un incarico LiftCon", PROCESSO)],
    priority: 0.8,
    changefreq: "yearly",
  };
}

export function chiSiamoPage(ctx) {
  const img = picture(ctx, {
    base: "/img/render/dettaglio",
    widths: [600, 900, 1200],
    w: 900,
    h: 675,
    alt: "Pulsantiera di piano in acciaio con pulsanti circolari accanto al portale dell'ascensore",
    sizes: "(min-width: 1100px) 40vw, 100vw",
    cls: "about-pic",
  });
  const body = [
    pageHead({
      h1: "Chi siamo",
      lead: `LiftCon è il servizio di consulenza tecnica per ascensori di ${esc(
        COMPANY.legalName,
      )}, rivolto ad amministratori di condominio, proprietari e gestori immobiliari di Milano e della Lombardia.`,
      aside: `<div class="about-media">${img}</div>`,
    }),
    section(
      "perche",
      "Perché LiftCon",
      `<p>Chi gestisce un ascensore riceve preventivi, rapportini, verbali e fatture scritti da chi esegue i lavori. Spesso manca un documento scritto dalla parte del committente: che cosa si vede sull'impianto, che cosa è stato fatto, che cosa resta da chiarire. LiftCon nasce per scrivere quel documento, con un perimetro dichiarato e senza sovrapporsi a chi esegue verifiche ufficiali.</p>`,
    ),
    section(
      "azienda",
      "L'azienda",
      `<p>${esc(COMPANY.legalName)} sviluppa software e servizi tecnici per imprese e professionisti. Nel settore ascensoristico sviluppa anche <a href="https://rilievi.carbonstealth.eu" target="_blank" rel="noopener">Rilievi Impianti</a>, il portale per le schede di rilievo degli impianti ascensoristici.</p>
<dl class="company">
<div><dt>Ragione sociale</dt><dd>${esc(COMPANY.legalName)}</dd></div>
<div><dt>Sede legale</dt><dd>${esc(COMPANY.street)}, ${esc(COMPANY.postalCode)} ${esc(COMPANY.city)} (${esc(COMPANY.country)})</dd></div>
<div><dt>Partita IVA</dt><dd>${esc(COMPANY.vat)}</dd></div>
<div><dt>Zona servita</dt><dd>Milano, Città metropolitana di Milano, Monza e Brianza, Lombardia</dd></div>
</dl>`,
      { cls: "tint" },
    ),
    section(
      "persone",
      "Le persone",
      `<div class="person" id="stefan-kostadinov"><img src="/assets/brand/icon-192.png" width="72" height="72" alt="" loading="lazy" decoding="async"><div><h3>${esc(
        COMPANY.responsabile,
      )}</h3><p class="person-role">${esc(COMPANY.responsabileRuolo)}</p><p>Responsabile dei contenuti di questo sito: cura le guide e i loro riferimenti al testo vigente delle norme.</p></div></div>`,
    ),
    ctaBand(),
  ].join("\n");
  return {
    path: R.chiSiamo,
    title: "Chi siamo | LiftCon, consulenza tecnica ascensori",
    description: `LiftCon è il servizio di consulenza tecnica per ascensori di ${COMPANY.legalName} per amministratori di condominio e privati a Milano e in Lombardia.`,
    keywords: ["LiftCon chi siamo", "consulenza tecnica ascensori", "Carbon Stealth VCC", "consulente ascensori Milano", "Rilievi Impianti", "Carbon Stealth"],
    breadcrumbs: [{ name: "Chi siamo", path: R.chiSiamo }],
    pageType: "AboutPage",
    body,
    schema: () => [],
    priority: 0.6,
    changefreq: "yearly",
  };
}
