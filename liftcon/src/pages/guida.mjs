// Шаблон на ръководство (Article + FAQPage + HowTo при стъпки) и хъбът /guide/.

import { SITE, COMPANY } from "../config.mjs";
import { esc, join, abs, plain } from "../lib/html.mjs";
import { pageHead, steps, faqList, related, ctaBand } from "../blocks.mjs";
import { faqPage, howTo, ID } from "../lib/schema.mjs";
import { R, guida } from "../routes.mjs";
import { G_PERIODICA, G_STRAORDINARIA, G_MANUTENZIONE, G_LIBRETTO } from "../content/guide-a.mjs";
import { G_PREVENTIVI, G_ESERCIZIO, G_FINELAVORI, G_SPESE } from "../content/guide-b.mjs";

export const GUIDE = [G_PERIODICA, G_STRAORDINARIA, G_MANUTENZIONE, G_PREVENTIVI, G_FINELAVORI, G_LIBRETTO, G_ESERCIZIO, G_SPESE].map((g) => ({
  ...g,
  path: guida(g.slug),
  published: g.published ?? SITE.updated,
  modified: g.modified ?? SITE.updated,
}));

const MESI = ["gennaio", "febbraio", "marzo", "aprile", "maggio", "giugno", "luglio", "agosto", "settembre", "ottobre", "novembre", "dicembre"];
export function dataIt(iso) {
  const [y, m, d] = iso.split("-").map(Number);
  return `${d} ${MESI[m - 1]} ${y}`;
}

function words(g) {
  return plain([g.lead, ...g.sezioni.map((s) => s.html), ...(g.faq ?? []).map((f) => f.a)].join(" ")).split(" ").length;
}

export function guidaPage(g, ctx) {
  const toc = `<nav class="toc" aria-label="In questa guida"><p class="toc-head">In questa guida</p><ol>${join(
    g.sezioni,
    (s, i) => `<li><a href="#s${i + 1}">${esc(s.h2)}</a></li>`,
  )}${g.howto ? `<li><a href="#passi">${esc(g.howto.name)}: i passaggi</a></li>` : ""}<li><a href="#fonti">Fonti</a></li></ol></nav>`;
  const meta = `<span class="byline">Aggiornata il <time datetime="${g.modified}">${dataIt(g.modified)}</time>. Autore: <a href="${R.chiSiamo}#stefan-kostadinov">${esc(
    COMPANY.responsabile,
  )}</a>, LiftCon.</span>`;
  const sezioni = join(g.sezioni, (s, i) => `<section class="art-sec" id="s${i + 1}" aria-labelledby="s${i + 1}-t"><h2 id="s${i + 1}-t">${esc(s.h2)}</h2>${s.html}</section>`);
  const passi = g.howto
    ? `<section class="art-sec" id="passi" aria-labelledby="passi-t"><h2 id="passi-t">${esc(g.howto.name)}: i passaggi</h2>${steps(g.howto.steps)}</section>`
    : "";
  const fonti = `<section class="art-sec sources" id="fonti" aria-labelledby="fonti-t"><h2 id="fonti-t">Fonti</h2><ul>${join(
    g.fonti,
    (f) => `<li><a href="${esc(f.url)}" target="_blank" rel="noopener">${esc(f.label)}</a></li>`,
  )}</ul><p class="note">I riferimenti sono al testo vigente pubblicato su Normattiva, consultato il ${dataIt(
    g.modified,
  )}. Questa guida ha scopo informativo e non costituisce parere legale; il giudizio sulla conformità di un impianto spetta ai soggetti previsti dalle norme.</p></section>`;
  const author = `<aside class="author" aria-label="Autore"><img src="/assets/brand/icon-192.png" width="64" height="64" alt="" loading="lazy" decoding="async"><div><p class="author-name">${esc(
    COMPANY.responsabile,
  )}</p><p>${esc(COMPANY.responsabileRuolo)} di LiftCon, servizio di consulenza tecnica per ascensori di ${esc(COMPANY.legalName)}. <a href="${
    R.chiSiamo
  }">Chi siamo</a></p></div></aside>`;

  const body = [
    pageHead({ h1: g.h1, lead: g.lead, kicker: meta }),
    `<div class="wrap article-grid"><article class="article">${sezioni}${passi}${
      g.faq ? `<section class="art-sec" id="domande" aria-labelledby="domande-t"><h2 id="domande-t">Domande frequenti</h2>${faqList(g.faq)}</section>` : ""
    }${fonti}${author}</article><div class="article-side">${toc}</div></div>`,
    related(g.correlati.map((k) => ctx.byKey[k]), "Servizi utili"),
    ctaBand(),
  ].join("\n");

  return {
    path: g.path,
    title: g.title,
    description: g.description,
    keywords: g.keywords,
    breadcrumbs: [
      { name: "Guide", path: R.guide },
      { name: g.menu, path: g.path },
    ],
    article: { published: g.published, modified: g.modified },
    updated: g.modified,
    body,
    schema: (page) => {
      const url = abs(SITE.url, page.path);
      const nodes = [
        {
          "@type": "Article",
          "@id": `${url}#article`,
          headline: g.h1,
          description: g.description,
          inLanguage: "it-IT",
          datePublished: g.published,
          dateModified: g.modified,
          wordCount: words(g),
          author: { "@id": ID.person },
          publisher: { "@id": ID.biz },
          mainEntityOfPage: { "@id": `${url}#webpage` },
          image: abs(SITE.url, "/img/og/liftcon-og.jpg"),
          citation: g.fonti.map((f) => f.url),
          about: { "@type": "Thing", name: g.menu },
        },
      ];
      if (g.faq) nodes.push(faqPage(page, g.faq));
      if (g.howto) nodes.push(howTo(page, g.howto.name, g.howto.steps));
      return nodes;
    },
    priority: 0.7,
    changefreq: "monthly",
  };
}

export function guideHub() {
  const list = join(
    GUIDE,
    (g) => `<li><a class="guide-row" href="${g.path}"><span class="guide-title">${esc(g.h1)}</span><span class="guide-desc">${esc(g.description)}</span><span class="guide-date">Aggiornata il ${dataIt(
      g.modified,
    )}</span></a></li>`,
  );
  return {
    path: R.guide,
    title: "Guide su ascensori e condominio | LiftCon",
    description: "Guide pratiche su verifiche, manutenzione, libretto, preventivi e spese dell'ascensore in condominio, con i riferimenti al DPR 162/1999 e al Codice civile.",
    keywords: ["guide ascensore condominio", "verifica ascensore", "manutenzione ascensore", "DPR 162/1999", "spese ascensore condominio", "Carbon Stealth"],
    breadcrumbs: [{ name: "Guide", path: R.guide }],
    pageType: "CollectionPage",
    body: [
      pageHead({
        h1: "Guide pratiche su ascensori e condominio",
        lead: "Risposte brevi e verificate alle domande che amministratori e proprietari si fanno più spesso: ogni guida indica gli articoli di legge a cui si riferisce e la data dell'ultimo controllo.",
      }),
      `<div class="wrap"><ul class="guide-list">${list}</ul><p class="guide-more">Termini tecnici: <a href="${R.glossario}">glossario</a>. Domande rapide: <a href="${R.faq}">domande frequenti</a>. Aggiornamenti: <a href="${R.feed}">feed RSS</a>.</p></div>`,
      ctaBand(),
    ].join("\n"),
    schema: (page) => [
      {
        "@type": "ItemList",
        "@id": `${abs(SITE.url, page.path)}#guide`,
        itemListElement: GUIDE.map((g, i) => ({ "@type": "ListItem", position: i + 1, url: abs(SITE.url, g.path), name: g.h1 })),
      },
    ],
    priority: 0.8,
    changefreq: "weekly",
  };
}
