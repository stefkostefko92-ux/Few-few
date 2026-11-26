// Преизползваеми секции. Структурни елементи (номерация, линии) само там, където носят информация:
// номерирани са само последователностите (стъпки на работа).

import { CONTACT } from "./config.mjs";
import { esc, join, checkList } from "./lib/html.mjs";
import { R } from "./routes.mjs";
import { FACCIAMO, NON_FACCIAMO } from "./content/servizi.mjs";

/** <picture> с AVIF/WebP/JPG; ширините, които липсват на диска, се пропускат. */
export function picture(ctx, { base, widths, w, h, alt, sizes, cls = "", eager = false }) {
  const have = widths.filter((x) => ctx.exists(`${base}-${x}.webp`));
  if (!have.length) {
    // Само за локална разработка, докато рендерите се правят: LIFTCON_ALLOW_MISSING_IMAGES=1.
    if (process.env.LIFTCON_ALLOW_MISSING_IMAGES === "1") return `<div class="${cls} img-missing" role="img" aria-label="${esc(alt)}"></div>`;
    throw new Error(`Липсва изображение ${base}-*.webp`);
  }
  const set = (ext) => have.filter((x) => ctx.exists(`${base}-${x}.${ext}`)).map((x) => `${base}-${x}.${ext} ${x}w`).join(", ");
  const fallback = [...have].reverse().find((x) => ctx.exists(`${base}-${x}.jpg`)) ?? have[have.length - 1];
  const fbExt = ctx.exists(`${base}-${fallback}.jpg`) ? "jpg" : "webp";
  const avif = set("avif");
  const load = eager ? 'fetchpriority="high" decoding="async"' : 'loading="lazy" decoding="async"';
  return `<picture class="${cls}">${avif ? `<source type="image/avif" srcset="${avif}" sizes="${sizes}">` : ""}<source type="image/webp" srcset="${set(
    "webp",
  )}" sizes="${sizes}"><img src="${base}-${fallback}.${fbExt}" width="${w}" height="${h}" alt="${esc(alt)}" ${load}></picture>`;
}

/** Заглавна част на вътрешна страница. */
export function pageHead({ h1, lead, aside = "", kicker = "" }) {
  return `<header class="page-head wrap">
<div class="page-head-text">
${kicker ? `<p class="kicker">${kicker}</p>` : ""}
<h1>${esc(h1)}</h1>
<p class="lead">${lead}</p>
</div>
${aside}
</header>`;
}

/** Карта до заглавието: кратко резюме + действие (страници без собствен „Che cosa riceve“). */
export function quickAside(title, items) {
  return `<aside class="facts" aria-label="${esc(title)}">
<p class="facts-head">${esc(title)}</p>
${checkList(items)}
<a class="btn btn-primary" href="${R.contatti}">Richieda un sopralluogo</a>
<a class="facts-phone" href="${CONTACT.phoneHref}">Oppure chiami il ${esc(CONTACT.phone)}</a>
</aside>`;
}

export function section(id, title, inner, { cls = "", intro = "" } = {}) {
  return `<section class="block ${cls}" id="${id}" aria-labelledby="${id}-t">
<div class="wrap">
<h2 id="${id}-t">${esc(title)}</h2>
${intro ? `<p class="block-intro">${intro}</p>` : ""}
${inner}
</div>
</section>`;
}

/** Последователност от стъпки (номерирана — съдържанието е последователност). */
export function steps(list, { anchor = "passo" } = {}) {
  return `<ol class="steps">${join(
    list,
    ([t, d], i) => `<li class="step" id="${anchor}-${i + 1}"><span class="step-n" aria-hidden="true">${i + 1}</span><h3>${esc(t)}</h3><p>${d}</p></li>`,
  )}</ol>`;
}

/** FAQ с <details>; първото изречение на отговора е директният отговор (.answer за Speakable). */
export function faqList(faq, { headingLevel = 3 } = {}) {
  const h = `h${headingLevel}`;
  return `<div class="faq">${join(
    faq,
    (f) => `<details class="faq-item"><summary><${h} class="faq-q">${esc(f.q)}</${h}></summary><div class="faq-a"><p class="answer">${f.a}</p></div></details>`,
  )}</div>`;
}

/** „Che cosa facciamo / che cosa non facciamo“. */
export function ledger({ title = "Che cosa facciamo, e che cosa no", intro = "" } = {}) {
  return `<section class="block ledger" id="ruolo" aria-labelledby="ruolo-t">
<div class="wrap">
<h2 id="ruolo-t">${esc(title)}</h2>
<p class="block-intro">${
    intro ||
    "Il nostro lavoro descrive fatti, documenti e condizioni osservate. Le verifiche ufficiali e le certificazioni spettano ai soggetti previsti dalle norme: lo diciamo prima di iniziare, per iscritto."
  }</p>
<div class="ledger-grid">
<div class="ledger-col ledger-yes"><h3>Che cosa facciamo</h3>${checkList(FACCIAMO, "check")}</div>
<div class="ledger-col ledger-no"><h3>Che cosa non facciamo</h3>${checkList(NON_FACCIAMO, "dash")}</div>
</div>
<p class="ledger-more"><a href="${R.metodo}">Il metodo e i limiti dell'incarico</a></p>
</div>
</section>`;
}

/** Списък на услугите като редове (не еднакви карти). */
export function serviceRows(servizi, gruppi) {
  return join(
    gruppi,
    (g) => `<div class="svc-group">
<div class="svc-group-head"><h3>${esc(g.nome)}</h3><p>${esc(g.testo)}</p></div>
<ul class="svc-rows">${join(
      servizi.filter((s) => s.gruppo === g.key),
      (s) => `<li><a class="svc-row" href="${s.path}"><span class="svc-name">${esc(s.nome)}</span><span class="svc-desc">${esc(s.menu)}</span></a></li>`,
    )}</ul>
</div>`,
  );
}

export function related(list, title = "Servizi collegati") {
  return `<aside class="related wrap" aria-labelledby="rel-t"><h2 id="rel-t">${esc(title)}</h2><ul class="related-list">${join(
    list,
    (s) => `<li><a href="${s.path}"><span class="rel-name">${esc(s.nome ?? s.menu)}</span><span class="rel-desc">${esc(s.menu ?? s.description)}</span></a></li>`,
  )}</ul></aside>`;
}

export function ctaBand({ title = "Ci descriva l'impianto e la situazione", text = "" } = {}) {
  return `<section class="cta-band" aria-labelledby="cta-t">
<div class="wrap cta-in">
<div>
<h2 id="cta-t">${esc(title)}</h2>
<p>${
    text ||
    "Indirizzo, tipo di impianto, che cosa è successo e quali documenti ha a disposizione. Le rispondiamo con una proposta d'incarico scritta: oggetto, attività incluse ed escluse, tempi e compenso."
  }</p>
</div>
<div class="cta-actions">
<a class="btn btn-light" href="${R.contatti}">Richieda un sopralluogo</a>
<a class="cta-phone" href="${CONTACT.phoneHref}">Oppure chiami il ${esc(CONTACT.phone)}</a>
</div>
</div>
</section>`;
}

/** Модел на структурата на релацията (реални раздели, без измислени стойности). */
export function reportMock(ctx) {
  const photo = picture(ctx, {
    base: "/img/render/dettaglio",
    widths: [600, 900, 1200],
    w: 600,
    h: 450,
    alt: "Primo piano della pulsantiera di piano in acciaio inox accanto allo stipite della porta, con due pulsanti rotondi e anello luminoso verde su quello superiore",
    sizes: "(min-width: 1100px) 260px, 60vw",
    cls: "report-photo",
  });
  const rows = [
    "Oggetto e limiti dell'incarico",
    "Impianto e documenti ricevuti",
    "Attività svolte",
    "Osservazioni e fotografie",
    "Anomalie osservate",
    "Punti da chiarire",
    "Raccomandazioni",
  ];
  return `<figure class="report" aria-label="Struttura di una relazione LiftCon">
<div class="report-paper">
<div class="report-top"><img src="/assets/brand/logo-header.webp" width="103" height="24" alt="" loading="lazy" decoding="async"><span>Relazione descrittiva di sopralluogo</span></div>
<ol class="report-toc">${join(rows, (r) => `<li><span>${esc(r)}</span><i aria-hidden="true"></i></li>`)}</ol>
<div class="report-fig">${photo}<span class="report-cap">Foto 1: ubicazione indicata nel testo</span></div>
<div class="report-sign"><span>Autore</span><i aria-hidden="true"></i></div>
</div>
<figcaption>Ogni relazione segue la stessa struttura: chi la legge sa sempre su che cosa si basa.</figcaption>
</figure>`;
}
