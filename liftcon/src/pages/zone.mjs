// Локални страници (GEO): Милано, Città metropolitana, Monza e Brianza, Lombardia (хъб).
// Всяка страница има собствено съдържание (райони/общини, как работим там) — не са копия с друго име.

import { esc, join, checkList } from "../lib/html.mjs";
import { pageHead, section, faqList, ctaBand, serviceRows } from "../blocks.mjs";
import { faqPage, areaServed } from "../lib/schema.mjs";
import { R } from "../routes.mjs";
import { PROVINCE } from "../config.mjs";

const MUNICIPI = [
  ["Municipio 1", "Centro storico"],
  ["Municipio 2", "Stazione Centrale, Gorla, Turro, Greco, Crescenzago"],
  ["Municipio 3", "Città Studi, Lambrate, Porta Venezia"],
  ["Municipio 4", "Porta Vittoria, Forlanini"],
  ["Municipio 5", "Vigentino, Chiaravalle, Gratosoglio"],
  ["Municipio 6", "Barona, Lorenteggio"],
  ["Municipio 7", "Baggio, De Angeli, San Siro"],
  ["Municipio 8", "Fiera, Gallaratese, Quarto Oggiaro"],
  ["Municipio 9", "Porta Garibaldi, Niguarda"],
];

const COMUNI_MI = [
  "Sesto San Giovanni", "Cinisello Balsamo", "Legnano", "Rho", "Cologno Monzese", "Paderno Dugnano", "Rozzano", "San Giuliano Milanese",
  "Pioltello", "Segrate", "Bollate", "Corsico", "San Donato Milanese", "Abbiategrasso", "Cernusco sul Naviglio", "Magenta", "Bresso",
  "Garbagnate Milanese", "Lainate", "Parabiago", "Buccinasco", "Peschiera Borromeo", "Arese", "Novate Milanese", "Settimo Milanese",
  "Cormano", "Melzo", "Trezzano sul Naviglio", "Senago", "Cesano Boscone", "Gorgonzola", "Opera",
];

const COMUNI_MB = [
  "Monza", "Lissone", "Seregno", "Desio", "Cesano Maderno", "Limbiate", "Brugherio", "Vimercate", "Muggiò", "Giussano", "Nova Milanese",
  "Meda", "Seveso", "Agrate Brianza", "Arcore", "Varedo", "Carate Brianza", "Besana in Brianza", "Concorezzo", "Bovisio-Masciago",
];

const zoneLinks = (exclude) =>
  `<ul class="zone-links">${join(
    [
      [R.milano, "Milano"],
      [R.provMilano, "Provincia di Milano"],
      [R.monza, "Monza e Brianza"],
      [R.lombardia, "Tutta la Lombardia"],
    ].filter(([p]) => p !== exclude),
    ([p, n]) => `<li><a href="${p}">${esc(n)}</a></li>`,
  )}</ul>`;

const chips = (list) => `<ul class="chips">${join(list, (c) => `<li>${esc(c)}</li>`)}</ul>`;

const COME = [
  "Sopralluoghi e assemblee in presenza, con data concordata con l'amministratore e con il manutentore.",
  "Esame dei documenti, preparazione degli incontri e report anche a distanza.",
  "Trasferte, tempi di consegna e compenso indicati nella lettera d'incarico, prima di iniziare.",
];

function zonePage({ path, title, description, keywords, h1, lead, geo, crumbs, blocks, faq, ctx }) {
  const body = [
    pageHead({ h1, lead }),
    ...blocks,
    section("servizi", "Servizi disponibili in zona", serviceRows(ctx.servizi, ctx.gruppi), { cls: "tint" }),
    section("come", "Come lavoriamo sul territorio", checkList(COME, "plain")),
    section("domande", "Domande frequenti", faqList(faq)),
    `<div class="wrap more-links"><p>Altre zone servite:</p>${zoneLinks(path)}</div>`,
    ctaBand(),
  ].join("\n");
  return {
    path,
    title,
    description,
    keywords,
    geo,
    breadcrumbs: crumbs,
    body,
    schema: (page) => [
      faqPage(page, faq),
      {
        "@type": "Service",
        "@id": `${ctx.site}${path}#service`,
        name: h1,
        serviceType: "Consulenza tecnica ascensori",
        provider: { "@id": `${ctx.site}/#liftcon` },
        areaServed: page.areaServedNode ?? areaServed(),
        url: `${ctx.site}${path}`,
      },
    ],
    priority: 0.85,
    changefreq: "monthly",
  };
}

export function milanoPage(ctx) {
  const faq = [
    {
      q: "Fate sopralluoghi in tutti i quartieri di Milano?",
      a: "Sì: lavoriamo in tutti i nove Municipi della città. La data del sopralluogo si concorda con l'amministratore e con il manutentore dell'impianto.",
    },
    {
      q: "Chi esegue le verifiche periodiche degli ascensori a Milano?",
      a: "I soggetti abilitati previsti dall'articolo 13 del DPR 162/1999, scelti dal proprietario: l'ATS Milano Città Metropolitana oppure un organismo notificato o di ispezione accreditato. LiftCon non esegue verifiche.",
    },
    {
      q: "Potete partecipare a un'assemblea di condominio a Milano?",
      a: "Sì, su incarico dell'amministratore, per illustrare i punti tecnici all'ordine del giorno.",
    },
  ];
  const p = zonePage({
    path: R.milano,
    title: "Consulenza ascensori a Milano | LiftCon",
    description:
      "Consulenza tecnica ascensori a Milano, in tutti i nove Municipi: sopralluoghi, controllo lavori, preventivi e preparazione alla verifica.",
    keywords: ["consulenza ascensori Milano", "consulente ascensori Milano", "sopralluogo ascensore Milano", "controllo lavori ascensore Milano", "amministratori condominio Milano ascensore", "Carbon Stealth"],
    h1: "Consulenza tecnica ascensori a Milano",
    lead: "A Milano seguiamo amministratori di condominio, proprietari e gestori immobiliari in tutti i nove Municipi: sopralluoghi descrittivi, controllo dei lavori, analisi dei preventivi e preparazione documentale prima delle verifiche.",
    geo: { region: "IT-MI", place: "Milano", lat: 45.4642, lng: 9.19 },
    crumbs: [
      { name: "Lombardia", path: R.lombardia },
      { name: "Milano", path: R.milano },
    ],
    blocks: [
      section(
        "municipi",
        "In quali zone di Milano lavoriamo?",
        `<p class="answer">In tutta la città, Municipio per Municipio.</p><dl class="municipi">${join(MUNICIPI, ([m, q]) => `<div><dt>${esc(m)}</dt><dd>${esc(q)}</dd></div>`)}</dl>`,
      ),
      section(
        "milano-casi",
        "Quando può servire un consulente tecnico a Milano",
        checkList(
          [
            "Impianti in servizio da molti anni, con un libretto da ricostruire prima di una verifica o di un cambio di manutentore.",
            "Ammodernamenti approvati in assemblea, con più preventivi da rendere confrontabili.",
            "Verbali di verifica con prescrizioni da chiudere, in vista della verifica straordinaria.",
            "Edifici gestiti da amministratori con molti condomini, che chiedono un riferimento tecnico unico.",
          ],
          "plain",
        ),
      ),
    ],
    faq,
    ctx,
  });
  return { ...p, areaServedNode: [{ "@type": "City", name: "Milano" }] };
}

export function provinciaMilanoPage(ctx) {
  const faq = [
    {
      q: "Lavorate anche fuori dal comune di Milano?",
      a: "Sì, in tutti i comuni della Città metropolitana di Milano. Le eventuali trasferte sono indicate nella lettera d'incarico.",
    },
    {
      q: "Un sopralluogo in provincia richiede tempi diversi?",
      a: "Dipende dalla disponibilità del manutentore e dall'accesso all'impianto; tempi e date si concordano prima, per iscritto.",
    },
  ];
  return zonePage({
    path: R.provMilano,
    title: "Consulenza ascensori provincia di Milano | LiftCon",
    description:
      "Consulenza tecnica ascensori nei comuni della Città metropolitana di Milano: Sesto San Giovanni, Rho, Legnano, Cinisello Balsamo e gli altri comuni.",
    keywords: ["consulenza ascensori provincia di Milano", "ascensori Città metropolitana di Milano", "consulente ascensori Sesto San Giovanni", "consulenza ascensori Rho", "consulenza ascensori Legnano", "Carbon Stealth"],
    h1: "Consulenza tecnica ascensori nella provincia di Milano",
    lead: "Fuori dal capoluogo il lavoro è lo stesso: sopralluoghi descrittivi, controllo dei lavori, preventivi e documenti in ordine. Seguiamo condomini e proprietari in tutti i comuni della Città metropolitana di Milano.",
    geo: { region: "IT-MI", place: "Città metropolitana di Milano", lat: 45.4642, lng: 9.19 },
    crumbs: [
      { name: "Lombardia", path: R.lombardia },
      { name: "Provincia di Milano", path: R.provMilano },
    ],
    blocks: [
      section(
        "comuni",
        "In quali comuni della provincia lavoriamo?",
        `<p class="answer">In tutti i comuni della Città metropolitana di Milano; tra i principali:</p>${chips(COMUNI_MI)}<p class="note">Il suo comune non è nell'elenco? Lavoriamo comunque: ci indichi l'indirizzo dell'impianto.</p>`,
      ),
    ],
    faq,
    ctx,
  });
}

export function monzaPage(ctx) {
  const faq = [
    {
      q: "Seguite condomini a Monza e in Brianza?",
      a: "Sì, a Monza e in tutti i comuni della provincia di Monza e della Brianza, con sopralluoghi in presenza e lavoro documentale anche a distanza.",
    },
    {
      q: "Chi esegue le verifiche periodiche in Brianza?",
      a: "I soggetti abilitati previsti dall'articolo 13 del DPR 162/1999, scelti dal proprietario: l'ente pubblico competente oppure un organismo notificato o di ispezione accreditato.",
    },
  ];
  return zonePage({
    path: R.monza,
    title: "Consulenza ascensori Monza e Brianza | LiftCon",
    description:
      "Consulenza tecnica ascensori a Monza e in Brianza: sopralluoghi, controllo dei lavori, analisi dei preventivi e supporto ad amministratori e proprietari.",
    keywords: ["consulenza ascensori Monza", "consulenza ascensori Brianza", "consulente ascensori Monza e Brianza", "sopralluogo ascensore Monza", "amministratori condominio Brianza", "Carbon Stealth"],
    h1: "Consulenza tecnica ascensori a Monza e in Brianza",
    lead: "Per i condomini di Monza e della Brianza offriamo gli stessi servizi del capoluogo: sopralluoghi descrittivi, controllo dei lavori, preventivi confrontabili e preparazione alla verifica straordinaria.",
    geo: { region: "IT-MB", place: "Monza", lat: 45.5845, lng: 9.2744 },
    crumbs: [
      { name: "Lombardia", path: R.lombardia },
      { name: "Monza e Brianza", path: R.monza },
    ],
    blocks: [
      section(
        "comuni",
        "In quali comuni della Brianza lavoriamo?",
        `<p class="answer">In tutta la provincia di Monza e della Brianza; tra i comuni principali:</p>${chips(COMUNI_MB)}`,
      ),
    ],
    faq,
    ctx,
  });
}

export function lombardiaPage(ctx) {
  const faq = [
    {
      q: "In quali province della Lombardia lavorate?",
      a: `In tutte le dodici: ${PROVINCE.join(", ")}.`,
    },
    {
      q: "Lavorate anche a distanza?",
      a: "Sì per l'esame dei documenti, il confronto dei preventivi e la preparazione degli incontri; sopralluoghi e assemblee si svolgono in presenza.",
    },
    {
      q: "Come vengono gestite le trasferte?",
      a: "Sono indicate nella lettera d'incarico insieme a compenso e tempi di consegna, prima di iniziare.",
    },
  ];
  const province = `<ul class="province">${join(PROVINCE, (p) => {
    const href = p === "Milano" ? R.milano : p === "Monza e Brianza" ? R.monza : "";
    const label = p === "Milano" ? "Milano e Città metropolitana" : p;
    return `<li>${href ? `<a href="${href}">${esc(label)}</a>` : esc(label)}</li>`;
  })}</ul>`;
  return zonePage({
    path: R.lombardia,
    title: "Consulenza ascensori in Lombardia | LiftCon",
    description:
      "Consulenza tecnica ascensori in tutta la Lombardia, dalle province di Milano e Monza a Bergamo, Brescia, Como, Varese e Pavia, per condomini e privati.",
    keywords: ["consulenza ascensori Lombardia", "consulente ascensori Lombardia", "ascensori condominio Lombardia", "consulenza ascensori Bergamo Brescia", "consulenza ascensori Como Varese", "Carbon Stealth"],
    h1: "Consulenza tecnica ascensori in Lombardia",
    lead: "Partiamo da Milano e seguiamo condomini, proprietari e gestori immobiliari in tutte le dodici province lombarde. Il lavoro documentale si svolge anche a distanza; sopralluoghi e assemblee in presenza, con trasferte concordate per iscritto.",
    geo: { region: "IT-25", place: "Lombardia", lat: 45.4642, lng: 9.19 },
    crumbs: [{ name: "Lombardia", path: R.lombardia }],
    blocks: [
      section("province", "Le province servite", `<p class="answer">Tutte le dodici province della Lombardia.</p>${province}${zoneLinks(R.lombardia)}`),
    ],
    faq,
    ctx,
  });
}
