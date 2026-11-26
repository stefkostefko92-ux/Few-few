// Шаблон на страница за услуга: кратък отговор → за кого → какво включва → как → какво получавате →
// граници → FAQ → свързани → CTA. Schema: Service + FAQPage (HowTo само в ръководствата — там стъпките ги прави читателят).

import { esc, join, checkList } from "../lib/html.mjs";
import { pageHead, section, steps, faqList, related, ctaBand, reportMock } from "../blocks.mjs";
import { serviceNode, faqPage } from "../lib/schema.mjs";
import { R } from "../routes.mjs";

// Заглавия H2 с темата на услугата (AEO: пасажът носи контекста си и извън страницата).
const H = {
  sopralluogo: ["A chi serve il sopralluogo tecnico", "Che cosa comprende il sopralluogo", "Come si svolge il sopralluogo", "Domande frequenti sul sopralluogo tecnico"],
  controllo: ["A chi serve il controllo dei lavori", "Che cosa comprende il controllo qualità", "Come si svolge il controllo dei lavori", "Domande frequenti sul controllo dei lavori"],
  preventivi: ["A chi serve l'analisi dei preventivi", "Che cosa comprende l'analisi dei preventivi", "Come si svolge l'analisi dei preventivi", "Domande frequenti sui preventivi per l'ascensore"],
  supporto: ["A chi serve il supporto tecnico", "Che cosa comprende il supporto al committente", "Come si svolge il supporto al committente", "Domande frequenti sul supporto tecnico"],
  verifica: ["A chi serve la preparazione alla verifica", "Che cosa comprende la preparazione documentale", "Come si svolge la preparazione alla verifica", "Domande frequenti sulla verifica straordinaria"],
  relazioni: ["A chi servono le relazioni tecniche", "Quali documenti prepariamo", "Come è strutturata una relazione", "Domande frequenti sulle relazioni tecniche"],
};

export function servizioPage(s, ctx) {
  const [hChi, hCosa, hCome, hFaq] = H[s.key];
  const aside = `<aside class="facts" aria-label="In sintesi">
<p class="facts-head">Che cosa riceve</p>
${checkList(s.consegne)}
<a class="btn btn-primary" href="${R.contatti}?servizio=${s.key}">Richieda questo servizio</a>
</aside>`;
  const comprende = `<dl class="scope">${join(s.comprende, ([t, d]) => `<div><dt>${esc(t)}</dt><dd>${d}</dd></div>`)}</dl>`;
  const limiti = `<div class="limits"><p class="limits-head">Limiti dell'incarico</p>${checkList(s.limiti, "dash")}<p><a href="${R.metodo}">Come lavoriamo e che cosa non facciamo</a></p></div>`;
  const body = [
    pageHead({ h1: s.h1, lead: s.lead, aside }),
    section("per-chi", hChi, checkList(s.perChi, "plain")),
    section("comprende", hCosa, comprende),
    section("come", hCome, steps(s.fasi), { cls: "tint" }),
    s.key === "relazioni"
      ? section("struttura", "Com'è fatta una relazione LiftCon", `<div class="split">${reportMock(ctx)}${limiti}</div>`)
      : section("limiti", "Che cosa non comprende", limiti),
    section("domande", hFaq, faqList(s.faq)),
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
    schema: (page) => [serviceNode(s), faqPage(page, s.faq)],
    priority: 0.9,
    changefreq: "monthly",
  };
}
