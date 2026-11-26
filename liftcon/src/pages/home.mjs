// Началната страница.

import { esc, join, checkList } from "../lib/html.mjs";
import { section, steps, faqList, ctaBand, ledger, serviceRows, picture, reportMock } from "../blocks.mjs";
import { faqPage, howTo } from "../lib/schema.mjs";
import { R } from "../routes.mjs";
import { PROVINCE } from "../config.mjs";
import { dataIt } from "./guida.mjs";

export const HERO_ALT =
  "Pianerottolo di un condominio milanese con le porte in acciaio dell'ascensore socchiuse, luce calda dalla cabina e indicatore di piano verde";

export const PROCESSO = [
  ["Richiesta", "Ci descrive l'impianto, la situazione e i documenti disponibili, per telefono o con il modulo."],
  ["Lettera d'incarico", "Oggetto, impianto, attività incluse ed escluse, tempi, trasferte e compenso, per iscritto prima di iniziare."],
  ["Esame e sopralluogo", "Documenti esaminati e, se previsto, sopralluogo coordinato con il manutentore, nei limiti di accessibilità e sicurezza."],
  ["Relazione", "Relazione firmata con fotografie, anomalie osservate, punti da chiarire e raccomandazioni."],
];

const DOMANDE = [
  ["Com'è davvero il nostro ascensore?", "Un sopralluogo descrittivo con fotografie e l'elenco delle anomalie osservate.", "sopralluogo"],
  ["Il preventivo che ci hanno presentato è corretto?", "Le offerte riportate sulle stesse voci, con esclusioni e condizioni a confronto.", "preventivi"],
  ["I lavori che paghiamo sono stati fatti?", "Lavori ordinati, dichiarati e osservati, confrontati punto per punto.", "controllo"],
  ["Il verbale ha prescrizioni: da dove si comincia?", "Un fascicolo documentale e la lista dei punti da chiarire prima della verifica.", "verifica"],
  ["Come lo spiego all'assemblea?", "Una relazione scritta per chi non è tecnico e il supporto durante la riunione.", "supporto"],
];

const DOCUMENTI = [
  "Relazione descrittiva di sopralluogo",
  "Report fotografico delle condizioni osservate",
  "Rapporto di controllo qualità delle lavorazioni",
  "Elenco delle anomalie con ubicazione e fotografie",
  "Verbale di riunione o confronto tecnico",
  "Rapporto di avanzamento lavori",
  "Rapporto di riscontro delle correzioni dichiarate",
  "Relazione di esame documentale",
  "Capitolato descrittivo e richiesta di offerta",
  "Relazione finale con limiti, osservazioni e raccomandazioni",
];

export const FAQ_HOME = [
  {
    q: "Che cosa fa un consulente tecnico per ascensori?",
    a: "Descrive lo stato dell'impianto, controlla lavori e documenti, rende confrontabili i preventivi e affianca il committente negli incontri con manutentore e imprese. Non esegue verifiche ufficiali né rilascia certificazioni.",
  },
  {
    q: "LiftCon esegue la verifica periodica dell'ascensore?",
    a: "No. La verifica periodica e quella straordinaria spettano ai soggetti abilitati previsti dal DPR 162/1999. LiftCon prepara documenti e punti da chiarire, e descrive ciò che osserva.",
  },
  {
    q: "In quali zone lavorate?",
    a: "A Milano, nei comuni della Città metropolitana, in provincia di Monza e della Brianza e in tutta la Lombardia.",
  },
  {
    q: "Quanto costa una consulenza sull'ascensore?",
    a: "Dipende dall'impianto, dalle attività richieste e dalle trasferte: il compenso è indicato nella lettera d'incarico, insieme a tempi e attività incluse ed escluse, prima di iniziare.",
  },
  {
    q: "Che cosa ricevo alla fine dell'incarico?",
    a: "Una relazione firmata in PDF, con fotografie numerate, documenti esaminati, anomalie osservate, punti da chiarire e raccomandazioni.",
  },
  {
    q: "Come si richiede un sopralluogo?",
    a: "Con il modulo di contatto o per telefono: ci indica indirizzo, tipo di impianto e situazione, e le inviamo una proposta d'incarico scritta.",
  },
];

export function homePage(ctx) {
  const hero = picture(ctx, {
    base: "/img/render/hero",
    widths: [800, 1200, 1600, 2400],
    w: 1600,
    h: 1200,
    alt: ctx.heroAlt ?? HERO_ALT,
    sizes: "(min-width: 1100px) 52vw, 100vw",
    cls: "hero-pic",
    eager: true,
  });
  const avifSet = [800, 1200, 1600, 2400]
    .filter((w) => ctx.exists(`/img/render/hero-${w}.avif`))
    .map((w) => `/img/render/hero-${w}.avif ${w}w`)
    .join(", ");

  const domande = `<ul class="questions">${join(
    DOMANDE,
    ([q, a, k]) => `<li><a href="${ctx.byKey[k].path}"><span class="q">${esc(q)}</span><span class="a">${esc(a)}</span><span class="svc">${esc(ctx.byKey[k].nome)}</span></a></li>`,
  )}</ul>`;

  const perChi = `<div class="audience">
<div class="aud aud-admin"><h3><a href="${R.amministratori}">Amministratori di condominio</a></h3><p>Preventivi confrontabili per l'assemblea, controllo dei lavori prima del saldo, verbali con prescrizioni, registro delle criticità e archivio tecnico.</p><a class="aud-link" href="${R.amministratori}">Come lavoriamo con gli amministratori</a></div>
<div class="aud aud-priv"><h3><a href="${R.proprietari}">Proprietari e privati</a></h3><p>Un edificio con ascensore, un immobile da acquistare, un preventivo da capire: una relazione chiara prima di decidere e di pagare.</p><a class="aud-link" href="${R.proprietari}">Come lavoriamo con i privati</a></div>
</div>`;

  const zone = `<div class="zone-home">
<div class="zone-main">
<p class="answer">Milano, la Città metropolitana, Monza e Brianza e tutte le province lombarde.</p>
<ul class="zone-links"><li><a href="${R.milano}">Milano</a></li><li><a href="${R.provMilano}">Provincia di Milano</a></li><li><a href="${R.monza}">Monza e Brianza</a></li><li><a href="${R.lombardia}">Tutta la Lombardia</a></li></ul>
</div>
<ul class="province">${join(PROVINCE, (p) => `<li>${esc(p)}</li>`)}</ul>
</div>`;

  const guide = `<ul class="guide-list guide-list-short">${join(
    ctx.guide.slice(0, 3),
    (g) => `<li><a class="guide-row" href="${g.path}"><span class="guide-title">${esc(g.h1)}</span><span class="guide-desc">${esc(g.description)}</span><span class="guide-date">Aggiornata il ${dataIt(
      g.modified,
    )}</span></a></li>`,
  )}</ul><p class="guide-more"><a href="${R.guide}">Tutte le guide</a></p>`;

  const body = [
    `<section class="hero" aria-labelledby="hero-t">
<div class="wrap hero-grid">
<div class="hero-text">
<h1 id="hero-t">Consulenza tecnica per ascensori a Milano e in Lombardia</h1>
<p class="lead">Sopralluoghi descrittivi, controllo qualità dei lavori, analisi dei preventivi e preparazione documentale alla verifica straordinaria. Per amministratori di condominio, proprietari e gestori immobiliari che vogliono decidere, e pagare, sapendo che cosa succede sull'impianto.</p>
<div class="hero-actions"><a class="btn btn-primary" href="${R.contatti}">Richieda un sopralluogo</a><a class="btn btn-ghost" href="${R.servizi}">Scopra i servizi</a></div>
${checkList(["Relazione scritta e firmata", "Fotografie con l'ubicazione di ogni osservazione", "Lettera d'incarico con attività incluse ed escluse"], "check hero-proof")}
</div>
<div class="hero-media">${hero}<p class="floor" aria-hidden="true"><span class="floor-arrow">▲</span><span>Milano e Lombardia</span></p></div>
</div>
</section>`,
    section("domande-start", "Le domande da cui partiamo", domande, {
      intro: "Ogni incarico nasce da una domanda concreta di chi gestisce o possiede l'impianto, come queste.",
    }),
    section("servizi", "Servizi di consulenza tecnica", serviceRows(ctx.servizi, ctx.gruppi), {
      cls: "tint",
      intro: "Quattro aree di lavoro, ciascuna con un risultato scritto.",
    }),
    ledger(),
    section("metodo", "Come lavoriamo", steps(PROCESSO), { intro: `Quattro passaggi, sempre gli stessi. <a href="${R.metodo}">Il metodo in dettaglio</a>.` }),
    section(
      "documenti",
      "Che cosa riceve",
      `<div class="split">${reportMock(ctx)}<div class="doc-list"><p>Ogni incarico si chiude con uno o più documenti scritti, scelti in base all'oggetto:</p>${checkList(DOCUMENTI)}<p><a href="${R.relazioni}">Relazioni e report fotografici</a></p></div></div>`,
      { cls: "tint" },
    ),
    section("per-chi", "Per chi lavoriamo", perChi),
    section("zone", "Dove lavoriamo", zone, { cls: "tint" }),
    section("guide", "Guide pratiche", guide, { intro: "Risposte brevi alle domande su verifiche, manutenzione e spese, con gli articoli di legge di riferimento." }),
    section("faq", "Domande frequenti", `${faqList(FAQ_HOME)}<p class="guide-more"><a href="${R.faq}">Tutte le domande frequenti</a></p>`),
    ctaBand(),
  ].join("\n");

  return {
    path: R.home,
    title: "Consulenza tecnica ascensori Milano e Lombardia | LiftCon",
    ogTitle: "LiftCon, consulenza tecnica ascensori a Milano e in Lombardia",
    description:
      "LiftCon: consulenza tecnica per ascensori a Milano e in Lombardia. Sopralluoghi, controllo dei lavori, preventivi e relazioni per amministratori e privati.",
    keywords: [
      "consulenza tecnica ascensori",
      "consulenza ascensori Milano",
      "consulente ascensori Lombardia",
      "controllo lavori ascensore",
      "sopralluogo ascensore condominio",
      "LiftCon",
      "Carbon Stealth",
    ],
    breadcrumbs: [],
    bodyClass: "is-home",
    preload: avifSet
      ? `<link rel="preload" as="image" type="image/avif" imagesrcset="${avifSet}" imagesizes="(min-width: 1100px) 52vw, 100vw" fetchpriority="high">`
      : "",
    body,
    schema: (page) => [faqPage(page, FAQ_HOME), howTo(page, "Come funziona un incarico LiftCon", PROCESSO)],
    priority: 1.0,
    changefreq: "weekly",
  };
}
