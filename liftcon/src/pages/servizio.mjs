// Шаблон на страница за услуга: кратък отговор → за кого → какво включва → как → какво получавате →
// граници → FAQ → свързани → CTA. Schema: Service + HowTo + FAQPage.

import { esc, join, checkList } from "../lib/html.mjs";
import { pageHead, section, steps, faqList, related, ctaBand, reportMock } from "../blocks.mjs";
import { serviceNode, howTo, faqPage } from "../lib/schema.mjs";
import { R } from "../routes.mjs";

export function servizioPage(s, ctx) {
  const aside = `<aside class="facts" aria-label="In sintesi">
<p class="facts-head">Che cosa riceve</p>
${checkList(s.consegne)}
<a class="btn btn-primary" href="${R.contatti}?servizio=${s.key}">Richieda questo servizio</a>
</aside>`;
  const comprende = `<dl class="scope">${join(s.comprende, ([t, d]) => `<div><dt>${esc(t)}</dt><dd>${d}</dd></div>`)}</dl>`;
  const limiti = `<div class="limits"><p class="limits-head">Limiti dell'incarico</p>${checkList(s.limiti, "dash")}<p><a href="${R.metodo}">Come lavoriamo e che cosa non facciamo</a></p></div>`;
  const body = [
    pageHead({ h1: s.h1, lead: s.lead, aside }),
    section("per-chi", "A chi serve", checkList(s.perChi, "plain")),
    section("comprende", "Che cosa comprende", comprende),
    section("come", "Come si svolge", steps(s.fasi), { cls: "tint" }),
    s.key === "relazioni"
      ? section("struttura", "Com'è fatta una relazione LiftCon", `<div class="split">${reportMock(ctx)}${limiti}</div>`)
      : section("limiti", "Che cosa non comprende", limiti),
    section("domande", `Domande frequenti: ${s.nome.toLowerCase()}`, faqList(s.faq)),
    related(s.correlati.map((k) => ctx.byKey[k])),
    ctaBand(),
  ].join("\n");

  return {
    path: s.path,
    title: s.title,
    description: s.description,
    keywords: s.keywords,
    breadcrumbs: [
      { name: "Servizi", path: R.servizi },
      { name: s.nome, path: s.path },
    ],
    body,
    schema: (page) => [serviceNode(s), howTo(page, `${s.h1}: come si svolge`, s.fasi), faqPage(page, s.faq)],
    priority: 0.9,
    changefreq: "monthly",
  };
}
