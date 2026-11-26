// /contatti/ (форма + NAP + карта при клик) и /contatti/grazie/ (noindex).
// Формата работи и без JS (POST → 303 към /contatti/grazie/); с JS — fetch и съобщение на място.

import { esc, join } from "../lib/html.mjs";
import { pageHead, section, steps } from "../blocks.mjs";
import { R } from "../routes.mjs";
import { CONTACT, COMPANY } from "../config.mjs";

const RUOLI = [
  ["amministratore", "Amministratore di condominio"],
  ["proprietario", "Proprietario o condomino"],
  ["gestore", "Gestore immobiliare o azienda"],
  ["altro", "Altro"],
];

const DOPO = [
  ["Lettura della richiesta", "Valutiamo impianto, situazione e documenti indicati; se serve, la richiamiamo per i dettagli."],
  ["Proposta d'incarico", "Le inviamo per iscritto oggetto, attività incluse ed escluse, tempi, trasferte e compenso."],
  ["Avvio", "Con la sua conferma concordiamo documenti e, se previsto, la data del sopralluogo con il manutentore."],
];

export function contattiPage(ctx) {
  const servizi = [...ctx.servizi.map((s) => [s.key, s.nome]), ["altro", "Non so ancora / altro"]];
  const opt = (list, placeholder) =>
    `<option value="">${esc(placeholder)}</option>${join(list, ([v, l]) => `<option value="${v}">${esc(l)}</option>`)}`;
  const form = `<form class="form" action="/api/richiesta" method="post" data-form novalidate>
<div class="field"><label for="f-nome">Nome e cognome</label><input id="f-nome" name="nome" type="text" autocomplete="name" required minlength="2" maxlength="100"></div>
<div class="field-row">
<div class="field"><label for="f-email">Email</label><input id="f-email" name="email" type="email" autocomplete="email" required maxlength="200"></div>
<div class="field"><label for="f-tel">Telefono <span class="opt">(facoltativo)</span></label><input id="f-tel" name="telefono" type="tel" autocomplete="tel" maxlength="30" pattern="[0-9+ ()./-]{6,30}"></div>
</div>
<div class="field-row">
<div class="field"><label for="f-ruolo">Lei è</label><select id="f-ruolo" name="ruolo" required>${opt(RUOLI, "Selezioni")}</select></div>
<div class="field"><label for="f-comune">Comune dell'impianto</label><input id="f-comune" name="comune" type="text" autocomplete="address-level2" required maxlength="100"></div>
</div>
<div class="field"><label for="f-servizio">Servizio</label><select id="f-servizio" name="servizio" required>${opt(servizi, "Selezioni")}</select></div>
<div class="field"><label for="f-msg">La situazione</label><textarea id="f-msg" name="messaggio" rows="6" required minlength="10" maxlength="3000" aria-describedby="f-msg-h"></textarea><p class="hint" id="f-msg-h">Tipo di impianto, che cosa è successo, quali documenti ha (libretto, verbali, preventivi). Non inserisca dati di altre persone né informazioni sulla salute.</p></div>
<div class="hp" aria-hidden="true"><label for="f-web">Lasciare vuoto</label><input id="f-web" name="sito_web" type="text" tabindex="-1" autocomplete="off"></div>
<input type="hidden" name="t" value="" data-t>
<div class="field field-check"><input id="f-privacy" name="privacy" type="checkbox" value="si" required><label for="f-privacy">Ho letto l'<a href="${R.privacy}">informativa privacy</a> sul trattamento dei dati di questa richiesta.</label></div>
<button class="btn btn-primary" type="submit">Invii la richiesta</button>
<p class="form-status" role="status" aria-live="polite" data-status></p>
</form>`;

  const info = `<aside class="contact-card" aria-label="Recapiti">
<h2>Recapiti</h2>
<p class="contact-big"><a href="${CONTACT.phoneHref}">${esc(CONTACT.phone)}</a></p>
<p><a href="mailto:${esc(CONTACT.email)}">${esc(CONTACT.email)}</a></p>
<h3>Orari</h3>
<dl class="hours">${join(CONTACT.hours, (h) => `<div><dt>${esc(h.label)}</dt><dd>${h.opens}–${h.closes}</dd></div>`)}</dl>
<h3>Zona servita</h3>
<p>Milano, Città metropolitana di Milano, Monza e Brianza e tutta la Lombardia.</p>
<h3>Dati societari</h3>
<p>LiftCon è un servizio di ${esc(COMPANY.legalName)}<br>Sede legale: ${esc(COMPANY.street)}, ${esc(COMPANY.postalCode)} ${esc(COMPANY.city)} (${esc(
    COMPANY.country,
  )})<br>Partita IVA ${esc(COMPANY.vat)}</p>
</aside>`;

  const map = `<div class="map" data-map>
<div class="map-cover">
<p class="map-title">Mappa della zona servita</p>
<p>La mappa è fornita da OpenStreetMap. Caricandola, il suo browser si collega ai server di OpenStreetMap Foundation, che ricevono il suo indirizzo IP.</p>
<button class="btn btn-ghost" type="button" data-map-load data-src="https://www.openstreetmap.org/export/embed.html?bbox=8.49%2C44.68%2C11.43%2C46.64&amp;layer=mapnik">Mostri la mappa</button>
<p class="map-alt"><a href="https://www.openstreetmap.org/#map=8/45.62/9.80" target="_blank" rel="noopener">Apra la mappa su openstreetmap.org</a></p>
</div>
</div>`;

  return {
    path: R.contatti,
    title: "Contatti e richiesta di sopralluogo | LiftCon",
    description: `Richieda un sopralluogo o una consulenza tecnica sull'ascensore a Milano e in Lombardia: telefono ${CONTACT.phone}, email o modulo online.`,
    keywords: ["richiesta sopralluogo ascensore", "consulente ascensori Milano", "consulenza tecnica ascensori contatti", "preventivo consulenza ascensore", "LiftCon", "Carbon Stealth"],
    breadcrumbs: [{ name: "Contatti", path: R.contatti }],
    pageType: "ContactPage",
    body: [
      pageHead({
        h1: "Contatti e richiesta di sopralluogo",
        lead: "Ci descriva l'impianto e la situazione: le rispondiamo con una proposta d'incarico scritta. Per le urgenze sull'impianto, come un guasto o una persona bloccata in cabina, chiami il manutentore o i soccorsi: LiftCon non interviene sull'ascensore.",
      }),
      `<div class="wrap contact-grid">${form}${info}</div>`,
      section("dopo", "Che cosa succede dopo la richiesta", steps(DOPO), { cls: "tint" }),
      section("mappa", "Dove lavoriamo", map),
    ].join("\n"),
    schema: () => [],
    priority: 0.8,
    changefreq: "yearly",
  };
}

export function grazieePage() {
  return {
    path: R.grazie,
    title: "Richiesta inviata | LiftCon",
    description: "La richiesta è stata inviata a LiftCon: riceverà una risposta all'indirizzo email indicato.",
    keywords: ["LiftCon", "richiesta inviata", "consulenza ascensori", "sopralluogo ascensore", "contatti LiftCon", "Carbon Stealth"],
    breadcrumbs: [
      { name: "Contatti", path: R.contatti },
      { name: "Richiesta inviata", path: R.grazie },
    ],
    noindex: true,
    body: pageHead({
      h1: "Richiesta inviata",
      lead: `Grazie: la sua richiesta è arrivata. Le risponderemo all'indirizzo email indicato; se preferisce, può chiamarci al <a href="${CONTACT.phoneHref}">${esc(
        CONTACT.phone,
      )}</a>. <a href="${R.guide}">Nel frattempo, le guide pratiche</a>.`,
    }),
    schema: () => [],
  };
}
