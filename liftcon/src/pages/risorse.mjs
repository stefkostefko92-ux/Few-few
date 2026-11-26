// /domande-frequenti/ (FAQPage, групирани) и /glossario/ (DefinedTermSet).

import { esc, join, abs } from "../lib/html.mjs";
import { pageHead, faqList, ctaBand } from "../blocks.mjs";
import { faqPage } from "../lib/schema.mjs";
import { R } from "../routes.mjs";
import { SITE } from "../config.mjs";
import { FAQ_HOME } from "./home.mjs";

export function faqHub(ctx) {
  const gruppi = [
    ["LiftCon e i servizi", FAQ_HOME],
    ...ctx.servizi.map((s) => [s.nome, s.faq]),
    ["Norme e verifiche", ctx.guide.flatMap((g) => g.faq ?? []).slice(0, 9)],
  ];
  const seen = new Set();
  const groups = gruppi.map(([t, list]) => [t, list.filter((f) => (seen.has(f.q) ? false : (seen.add(f.q), true)))]).filter(([, l]) => l.length);
  const all = groups.flatMap(([, l]) => l);
  const toc = `<nav class="toc toc-inline" aria-label="Argomenti"><ol>${join(groups, ([t], i) => `<li><a href="#g${i + 1}">${esc(t)}</a></li>`)}</ol></nav>`;
  return {
    path: R.faq,
    title: "Domande frequenti sugli ascensori | LiftCon",
    description:
      "Risposte brevi su consulenza tecnica, sopralluoghi, controllo dei lavori, preventivi, verifiche periodiche e straordinarie degli ascensori in condominio.",
    keywords: ["domande frequenti ascensore", "FAQ ascensore condominio", "verifica ascensore domande", "consulenza ascensori FAQ", "manutenzione ascensore domande", "Carbon Stealth"],
    breadcrumbs: [{ name: "Domande frequenti", path: R.faq }],
    body: [
      pageHead({
        h1: "Domande frequenti su ascensori e consulenza tecnica",
        lead: "Le domande più comuni di amministratori e proprietari, con risposte brevi. Per gli approfondimenti con i riferimenti di legge, le guide.",
      }),
      `<div class="wrap">${toc}${join(
        groups,
        ([t, list], i) => `<section class="faq-group" id="g${i + 1}" aria-labelledby="g${i + 1}-t"><h2 id="g${i + 1}-t">${esc(t)}</h2>${faqList(list)}</section>`,
      )}</div>`,
      ctaBand(),
    ].join("\n"),
    schema: (page) => [faqPage(page, all)],
    priority: 0.7,
    changefreq: "monthly",
  };
}

const TERMINI = [
  ["Amministratore di condominio", "Rappresenta il condominio e, tra l'altro, compie gli atti conservativi sulle parti comuni, compreso l'ascensore (art. 1130 del Codice civile)."],
  ["Capitolato descrittivo", "Documento che descrive in modo uniforme il lavoro richiesto ai fornitori, così le offerte arrivano confrontabili. Non è un progetto."],
  ["Certificato di abilitazione", "Titolo rilasciato dal Prefetto dopo una prova teorico-pratica, richiesto per la manutenzione degli ascensori (art. 15 del DPR 162/1999)."],
  ["Dichiarazione di conformità", "Documento rilasciato dall'impresa installatrice abilitata a fine lavori, nei casi previsti dal DM 37/2008 (art. 7)."],
  ["Fermo dell'impianto", "Sospensione del servizio disposta dal Comune, per esempio dopo un verbale di verifica negativo o un incidente di notevole importanza."],
  ["Lettera d'incarico", "Documento che definisce oggetto, attività incluse ed escluse, tempi, trasferte e compenso di un incarico di consulenza."],
  ["Libretto dell'impianto", "Raccoglie verbali delle verifiche, esiti della manutenzione, dichiarazione di conformità e comunicazioni con il Comune (art. 16 del DPR 162/1999)."],
  ["Manutentore", "Persona abilitata o ditta specializzata a cui il proprietario affida la manutenzione; esegue anche le operazioni durante le verifiche."],
  ["Matricola", "Numero assegnato all'impianto dal Comune entro 30 giorni dalla comunicazione di messa in esercizio."],
  ["Messa in esercizio", "Primo utilizzo dell'ascensore; va comunicata al Comune entro 60 giorni dalla dichiarazione di conformità (art. 12 del DPR 162/1999)."],
  ["Modifiche costruttive", "Interventi che vanno oltre la manutenzione, come il cambio di velocità o la sostituzione del macchinario; richiedono la verifica straordinaria (art. 2, lett. cc, del DPR 162/1999)."],
  ["Organismo notificato", "Organismo autorizzato a svolgere valutazioni di conformità e, per gli ascensori, anche verifiche periodiche e straordinarie."],
  ["Prescrizione", "Indicazione riportata nel verbale di verifica su un punto da correggere; alla verifica successiva se ne controlla l'attuazione."],
  ["Rapportino d'intervento", "Documento compilato dal tecnico a ogni intervento, con data, attività svolte ed eventuali materiali."],
  ["Relazione di sopralluogo", "Documento LiftCon che descrive condizioni osservate, documenti esaminati, limiti dell'esame e punti da chiarire."],
  ["Targa in cabina", "Riporta soggetto delle verifiche, installatore e numero di fabbricazione, matricola, portata e, se del caso, numero massimo di persone."],
  ["Verifica periodica", "Controllo obbligatorio ogni due anni da parte di un soggetto abilitato (art. 13 del DPR 162/1999)."],
  ["Verifica straordinaria", "Controllo dopo un esito periodico negativo, un incidente di notevole importanza o una modifica costruttiva (art. 14 del DPR 162/1999)."],
];

const slug = (t) =>
  t
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

export function glossarioPage() {
  return {
    path: R.glossario,
    title: "Glossario degli ascensori in condominio | LiftCon",
    description: "Glossario dei termini tecnici e normativi sugli ascensori: libretto, matricola, verifica periodica e straordinaria, modifiche costruttive, manutentore.",
    keywords: ["glossario ascensori", "libretto ascensore significato", "matricola ascensore", "modifiche costruttive ascensore", "verifica straordinaria significato", "Carbon Stealth"],
    breadcrumbs: [{ name: "Glossario", path: R.glossario }],
    body: [
      pageHead({
        h1: "Glossario: i termini dell'ascensore in condominio",
        lead: "Le parole che compaiono in verbali, preventivi e contratti di manutenzione, spiegate in una frase, con il riferimento normativo quando esiste.",
      }),
      `<div class="wrap"><dl class="glossary">${join(
        TERMINI,
        ([t, d]) => `<div id="${slug(t)}"><dt>${esc(t)}</dt><dd>${esc(d)}</dd></div>`,
      )}</dl><p class="guide-more">Approfondimenti nelle <a href="${R.guide}">guide pratiche</a>.</p></div>`,
      ctaBand(),
    ].join("\n"),
    schema: (page) => [
      {
        "@type": "DefinedTermSet",
        "@id": `${abs(SITE.url, page.path)}#glossario`,
        name: "Glossario degli ascensori in condominio",
        inLanguage: "it-IT",
        hasDefinedTerm: TERMINI.map(([t, d]) => ({
          "@type": "DefinedTerm",
          name: t,
          description: d,
          url: `${abs(SITE.url, page.path)}#${slug(t)}`,
        })),
      },
    ],
    priority: 0.6,
    changefreq: "monthly",
  };
}
