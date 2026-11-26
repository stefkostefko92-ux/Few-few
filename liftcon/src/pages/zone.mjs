// Локални страници (GEO): Milano, Città metropolitana di Milano и Lombardia (хъб, с Monza e Brianza вътре).
// Точно трите зони, които собственикът поиска. Всяка има собствено съдържание (райони/общини, кой проверява
// там, как работим), а не копие с друго име — иначе е doorway страница.

import { esc, join, checkList } from "../lib/html.mjs";
import { pageHead, section, faqList, ctaBand, serviceRows, quickAside } from "../blocks.mjs";
import { faqPage } from "../lib/schema.mjs";
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
      [R.lombardia, "Tutta la Lombardia"],
    ].filter(([p]) => p !== exclude),
    ([p, n]) => `<li><a href="${p}">${esc(n)}</a></li>`,
  )}</ul>`;

const chips = (list) => `<ul class="chips">${join(list, (c) => `<li>${esc(c)}</li>`)}</ul>`;

function zonePage({ path, title, description, keywords, h1, lead, aside, geo, crumbs, blocks, come, faq, area, ctx }) {
  const body = [
    pageHead({ h1, lead, aside: quickAside("In sintesi", aside) }),
    ...blocks,
    section("servizi", "Servizi disponibili in zona", serviceRows(ctx.servizi, ctx.gruppi), { cls: "tint" }),
    section("come", come.title, checkList(come.items, "plain")),
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
    schema: () => [
      faqPage({ path }, faq),
      {
        "@type": "Service",
        "@id": `${ctx.site}${path}#service`,
        name: h1,
        description,
        serviceType: "Consulenza tecnica ascensori",
        provider: { "@id": `${ctx.site}/#liftcon` },
        areaServed: area,
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
      a: "Sì: LiftCon lavora in tutti i nove Municipi della città. La data del sopralluogo si concorda con l'amministratore e con il manutentore dell'impianto.",
    },
    {
      q: "Chi esegue le verifiche periodiche degli ascensori a Milano?",
      a: "Uno dei soggetti abilitati previsti dall'articolo 13 del DPR 162/1999, scelto dal proprietario: l'ATS Milano Città Metropolitana oppure un organismo notificato o di ispezione accreditato. LiftCon non esegue verifiche.",
    },
    {
      q: "A chi si comunica la messa in esercizio di un ascensore a Milano?",
      a: "Al Comune di Milano, entro 60 giorni dalla dichiarazione di conformità; il Comune assegna poi il numero di matricola entro 30 giorni (art. 12 del DPR 162/1999).",
    },
    {
      q: "Potete partecipare a un'assemblea di condominio a Milano?",
      a: "Sì, su incarico dell'amministratore, per illustrare i punti tecnici all'ordine del giorno.",
    },
  ];
  return zonePage({
    path: R.milano,
    title: "Consulenza ascensori a Milano | LiftCon",
    description:
      "Consulenza tecnica ascensori a Milano, in tutti i nove Municipi: sopralluoghi, controllo lavori, preventivi e preparazione alla verifica straordinaria.",
    keywords: [
      "consulenza ascensori Milano",
      "consulente ascensori Milano",
      "ascensore condominio Milano",
      "lavori ascensore condominio Milano",
      "matricola ascensore Comune di Milano",
      "Carbon Stealth",
    ],
    h1: "Consulenza tecnica ascensori a Milano",
    lead: "A Milano LiftCon segue amministratori di condominio, proprietari e gestori immobiliari in tutti i nove Municipi: sopralluoghi descrittivi, controllo dei lavori, analisi dei preventivi e preparazione documentale prima delle verifiche.",
    aside: ["Tutti i nove Municipi", "Sopralluoghi coordinati con il manutentore", "Relazione scritta con fotografie"],
    geo: { region: "IT-MI", place: "Milano", lat: 45.4642, lng: 9.19 },
    crumbs: [
      { name: "Lombardia", path: R.lombardia },
      { name: "Milano", path: R.milano },
    ],
    blocks: [
      section(
        "municipi",
        "In quali zone di Milano lavoriamo?",
        `<p class="answer">LiftCon lavora in tutta la città di Milano, in ognuno dei nove Municipi.</p><dl class="municipi">${join(
          MUNICIPI,
          ([m, q]) => `<div><dt>${esc(m)}</dt><dd>${esc(q)}</dd></div>`,
        )}</dl>`,
      ),
      section(
        "milano-casi",
        "Quando può servire un consulente tecnico a Milano",
        checkList(
          [
            "Prima della verifica periodica, quando il libretto è incompleto o le prescrizioni del verbale precedente non hanno una risposta documentata.",
            "Quando l'assemblea deve scegliere tra preventivi diversi per un ammodernamento o una sostituzione.",
            "Durante e dopo i lavori, prima di autorizzare il saldo.",
            "Quando un amministratore con molti condomini vuole un riferimento tecnico unico per più impianti.",
          ],
          "plain",
        ),
      ),
    ],
    come: {
      title: "Come lavoriamo a Milano",
      items: [
        "Sopralluoghi in presenza, con data concordata con l'amministratore e con il manutentore che apre i locali tecnici.",
        "Riunioni con le imprese e assemblee in presenza su incarico dell'amministratore.",
        "Esame dei documenti, preparazione degli incontri e report anche a distanza.",
      ],
    },
    faq,
    area: { "@type": "City", name: "Milano" },
    ctx,
  });
}

export function provinciaMilanoPage(ctx) {
  const faq = [
    {
      q: "Lavorate anche fuori dal comune di Milano?",
      a: "Sì: LiftCon lavora in tutti i comuni della Città metropolitana di Milano. Le eventuali trasferte sono indicate nella lettera d'incarico, prima di iniziare.",
    },
    {
      q: "Chi esegue le verifiche periodiche degli ascensori in provincia di Milano?",
      a: "Uno dei soggetti abilitati dell'articolo 13 del DPR 162/1999, scelto dal proprietario: l'ATS Milano Città Metropolitana oppure un organismo notificato o di ispezione accreditato.",
    },
    {
      q: "Un sopralluogo in provincia richiede tempi diversi?",
      a: "Dipende dalla disponibilità del manutentore e dall'accesso all'impianto; data e tempi di consegna si concordano per iscritto.",
    },
  ];
  return zonePage({
    path: R.provMilano,
    title: "Consulenza ascensori provincia di Milano | LiftCon",
    description:
      "Consulenza tecnica ascensori nei comuni della Città metropolitana di Milano: Sesto San Giovanni, Rho, Legnano, Cinisello Balsamo e gli altri comuni.",
    keywords: [
      "consulenza ascensori provincia di Milano",
      "ascensore condominio Città metropolitana di Milano",
      "consulente ascensori Sesto San Giovanni",
      "consulenza ascensori Rho",
      "consulenza ascensori Legnano",
      "Carbon Stealth",
    ],
    h1: "Consulenza tecnica ascensori nella provincia di Milano",
    lead: "Fuori dal capoluogo il lavoro è lo stesso, con trasferte concordate: sopralluoghi descrittivi, controllo dei lavori, preventivi confrontabili e documenti in ordine. LiftCon segue condomini e proprietari in tutti i comuni della Città metropolitana di Milano.",
    aside: ["Tutti i comuni della Città metropolitana", "Trasferte indicate nella lettera d'incarico", "Documenti esaminati anche a distanza"],
    geo: { region: "IT-MI", place: "Città metropolitana di Milano", lat: 45.4642, lng: 9.19 },
    crumbs: [
      { name: "Lombardia", path: R.lombardia },
      { name: "Provincia di Milano", path: R.provMilano },
    ],
    blocks: [
      section(
        "comuni",
        "In quali comuni della provincia lavoriamo?",
        `<p class="answer">LiftCon lavora in tutti i comuni della Città metropolitana di Milano; tra i principali:</p>${chips(
          COMUNI_MI,
        )}<p class="note">Il suo comune non è nell'elenco? Lavoriamo comunque: ci indichi l'indirizzo dell'impianto.</p>`,
      ),
    ],
    come: {
      title: "Come lavoriamo in provincia",
      items: [
        "La parte documentale (libretto, verbali, preventivi) si esamina prima, anche a distanza, così il sopralluogo si concentra su ciò che va visto.",
        "Più impianti dello stesso amministratore nella stessa zona si possono raggruppare nella stessa giornata.",
        "Trasferte, tempi di consegna e compenso sono indicati nella lettera d'incarico.",
      ],
    },
    faq,
    area: { "@type": "AdministrativeArea", name: "Città metropolitana di Milano" },
    ctx,
  });
}

export function lombardiaPage(ctx) {
  const faq = [
    {
      q: "In quali province della Lombardia lavorate?",
      a: `LiftCon lavora in tutte le dodici province lombarde: ${PROVINCE.join(", ")}.`,
    },
    {
      q: "Seguite condomini a Monza e in Brianza?",
      a: "Sì: a Monza e in tutti i comuni della provincia di Monza e della Brianza, con sopralluoghi in presenza e lavoro documentale anche a distanza.",
    },
    {
      q: "Lavorate anche a distanza?",
      a: "Sì per l'esame dei documenti, il confronto dei preventivi e la preparazione degli incontri; sopralluoghi e assemblee si svolgono in presenza.",
    },
    {
      q: "Come vengono gestite le trasferte fuori provincia di Milano?",
      a: "Sono indicate nella lettera d'incarico insieme a compenso e tempi di consegna, prima di iniziare.",
    },
  ];
  const province = `<ul class="province">${join(PROVINCE, (p) => {
    const href = p === "Milano" ? R.milano : p === "Monza e Brianza" ? "#monza-brianza" : "";
    const label = p === "Milano" ? "Milano e Città metropolitana" : p;
    return `<li>${href ? `<a href="${href}">${esc(label)}</a>` : esc(label)}</li>`;
  })}</ul>`;
  return zonePage({
    path: R.lombardia,
    title: "Consulenza ascensori in Lombardia | LiftCon",
    description:
      "Consulenza tecnica ascensori in tutta la Lombardia: Milano, Monza e Brianza, Bergamo, Brescia, Como, Varese, Pavia e le altre province.",
    keywords: [
      "consulenza ascensori Lombardia",
      "consulente ascensori Lombardia",
      "consulenza ascensori Monza e Brianza",
      "ascensore condominio Lombardia",
      "consulenza ascensori Bergamo Brescia",
      "Carbon Stealth",
    ],
    h1: "Consulenza tecnica ascensori in Lombardia",
    lead: "Partiamo da Milano e seguiamo condomini, proprietari e gestori immobiliari in tutte le dodici province lombarde. Il lavoro documentale si svolge anche a distanza; sopralluoghi e assemblee in presenza, con trasferte concordate per iscritto.",
    aside: ["Tutte le dodici province lombarde", "Lavoro documentale anche a distanza", "Trasferte concordate per iscritto"],
    geo: { region: "IT-25", place: "Lombardia", lat: 45.4642, lng: 9.19 },
    crumbs: [{ name: "Lombardia", path: R.lombardia }],
    blocks: [
      section(
        "province",
        "Le province servite",
        `<p class="answer">LiftCon lavora in tutte le dodici province della Lombardia.</p>${province}${zoneLinks(R.lombardia)}`,
      ),
      section(
        "monza-brianza",
        "Monza e Brianza",
        `<p class="answer">A Monza e in Brianza LiftCon offre gli stessi servizi di Milano, con sopralluoghi in presenza; tra i comuni principali:</p>${chips(COMUNI_MB)}`,
        { cls: "tint" },
      ),
    ],
    come: {
      title: "Come lavoriamo nelle province lombarde",
      items: [
        "Prima i documenti: libretto, verbali e preventivi si esaminano a distanza, così il sopralluogo è mirato.",
        "Sopralluoghi e assemblee in presenza, con date concordate con amministratore e manutentore.",
        "Trasferte, tempi di consegna e compenso indicati nella lettera d'incarico.",
      ],
    },
    faq,
    area: { "@type": "State", name: "Lombardia" },
    ctx,
  });
}
