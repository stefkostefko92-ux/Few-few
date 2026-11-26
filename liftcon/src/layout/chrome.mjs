// Хедър с мега меню, трохи и футър. Без JS менюто работи с :hover/:focus-within (десктоп) и като
// статичен списък (мобилно, клас .no-js); с JS — бутони с aria-expanded, Esc, клик извън, чекмедже.

import { SITE, COMPANY, CONTACT, CREDIT } from "../config.mjs";
import { esc, join } from "../lib/html.mjs";
import { R } from "../routes.mjs";
import { PROMO } from "../content/promo.mjs";

function panelLink(href, title, text, current) {
  const cur = current === href ? ' aria-current="page"' : "";
  return `<a class="panel-link" href="${href}"${cur}><span class="panel-title">${esc(title)}</span>${
    text ? `<span class="panel-text">${esc(text)}</span>` : ""
  }</a>`;
}

function item({ id, label, href, panel, current, active }) {
  const top = href
    ? `<a class="nav-link${active ? " is-active" : ""}" href="${href}"${current === href ? ' aria-current="page"' : ""}>${esc(label)}</a>`
    : `<span class="nav-link nav-label${active ? " is-active" : ""}">${esc(label)}</span>`;
  if (!panel) return `<li class="nav-item">${top}</li>`;
  return `<li class="nav-item has-panel">${top}<button class="nav-toggle" type="button" aria-expanded="false" aria-controls="${id}"><span class="sr">Apri il menu ${esc(
    label,
  )}</span></button><div class="panel ${panel.cls ?? ""}" id="${id}">${panel.html}</div></li>`;
}

export function header({ path, servizi, gruppi, guide }) {
  const sec = (prefix) => path.startsWith(prefix);
  const mega = `<div class="mega-groups">${join(
    gruppi,
    (g) =>
      `<div class="mega-group"><p class="mega-head">${esc(g.nome)}</p>${join(
        servizi.filter((s) => s.gruppo === g.key),
        (s) => panelLink(s.path, s.nome, s.menu, path),
      )}</div>`,
  )}</div><div class="mega-foot"><a class="mega-all" href="${R.servizi}">Tutti i servizi</a><p>Non eseguiamo verifiche ufficiali né certificazioni: <a href="${
    R.metodo
  }">ecco che cosa facciamo e che cosa no</a>.</p></div>`;
  const perChi = panelLink(R.amministratori, "Amministratori di condominio", "Preventivi, lavori, assemblee e preparazione alle verifiche.", path) +
    panelLink(R.proprietari, "Proprietari e privati", "Un quadro chiaro prima di decidere e di pagare.", path);
  const zone = panelLink(R.milano, "Milano", "Tutti i nove Municipi.", path) +
    panelLink(R.provMilano, "Provincia di Milano", "Comuni della Città metropolitana.", path) +
    panelLink(R.lombardia, "Tutta la Lombardia", "Le dodici province, Monza e Brianza compresa.", path);
  const risorse = join(guide.slice(0, 4), (g) => panelLink(g.path, g.menu, "", path)) +
    `<div class="panel-sep"></div>` +
    panelLink(R.guide, "Tutte le guide", "", path) +
    panelLink(R.glossario, "Glossario", "", path) +
    panelLink(R.faq, "Domande frequenti", "", path);

  const items = [
    item({ id: "p-servizi", label: "Servizi", href: R.servizi, current: path, active: sec("/servizi/"), panel: { cls: "panel-mega", html: mega } }),
    item({ id: "p-perchi", label: "Per chi", current: path, active: [R.amministratori, R.proprietari].includes(path), panel: { html: perChi } }),
    item({ id: "p-zone", label: "Zone servite", href: R.lombardia, current: path, active: path.startsWith("/consulenza-ascensori-"), panel: { html: zone } }),
    item({ id: "p-guide", label: "Guide", href: R.guide, current: path, active: sec("/guide/") || [R.glossario, R.faq].includes(path), panel: { cls: "panel-wide", html: risorse } }),
    item({ label: "Metodo", href: R.metodo, current: path, active: path === R.metodo }),
    item({ label: "Chi siamo", href: R.chiSiamo, current: path, active: path === R.chiSiamo }),
  ];

  return `<a class="skip" href="#contenuto">Vai al contenuto</a>
<header class="site-header" data-header>
<div class="wrap header-in">
<a class="brand" href="${R.home}" aria-label="LiftCon, pagina iniziale"><img src="/assets/brand/logo-header.webp" srcset="/assets/brand/logo-header-1x.webp 1x, /assets/brand/logo-header.webp 2x" width="154" height="36" alt="LiftCon"></a>
<nav class="nav" id="nav" aria-label="Menu principale">
<ul class="nav-list">${items.join("")}</ul>
<div class="nav-drawer-foot"><a class="btn btn-primary" href="${R.contatti}">Richieda un sopralluogo</a><a class="drawer-phone" href="${CONTACT.phoneHref}">${esc(
    CONTACT.phone,
  )}</a></div>
</nav>
<div class="header-actions">
<a class="header-phone" href="${CONTACT.phoneHref}">${esc(CONTACT.phone)}</a>
<a class="btn btn-primary btn-sm header-cta" href="${R.contatti}">Richieda un sopralluogo</a>
<button class="menu-btn" type="button" aria-expanded="false" aria-controls="nav"><span class="menu-bars" aria-hidden="true"></span><span class="sr">Apri il menu</span></button>
</div>
</div>
</header>`;
}

export function breadcrumbs(items) {
  if (!items?.length) return "";
  const all = [{ name: "Home", path: R.home }, ...items];
  return `<nav class="crumbs wrap" aria-label="Percorso"><ol>${join(all, (b, i) =>
    i === all.length - 1 ? `<li><span aria-current="page">${esc(b.name)}</span></li>` : `<li><a href="${b.path}">${esc(b.name)}</a></li>`,
  )}</ol></nav>`;
}

export function footer({ servizi, guide }) {
  const year = SITE.updated.slice(0, 4);
  const col = (title, links) =>
    `<div class="foot-col"><p class="foot-head">${esc(title)}</p><ul>${join(links, ([href, label]) => `<li><a href="${href}">${esc(label)}</a></li>`)}</ul></div>`;
  const promo = `<aside class="promo-band wrap" aria-label="Altri progetti Carbon Stealth"><p class="promo-head">Altri progetti Carbon Stealth</p><ul class="promo-list">${join(
    PROMO,
    (p) => `<li><a class="promo" href="${p.url}" target="_blank" rel="noopener"><img src="${p.logo.src}" width="${p.logo.w}" height="${p.logo.h}" alt="${esc(p.nome)}" loading="lazy" decoding="async"><span class="promo-text">${esc(p.testo)}</span><span class="promo-dom">${esc(p.dominio)}</span></a></li>`,
  )}</ul></aside>`;
  return `<footer class="site-footer">
${promo}
<div class="wrap foot-grid">
<div class="foot-brand">
<a href="${R.home}" class="foot-logo"><img src="/assets/brand/logo-full.webp" srcset="/assets/brand/logo-full-1x.webp 1x, /assets/brand/logo-full.webp 2x" width="312" height="84" alt="LiftCon, consulenza tecnica ascensori" loading="lazy" decoding="async"></a>
<p>Consulenza tecnica per ascensori a Milano, nella Città metropolitana e in tutta la Lombardia, per amministratori di condominio, proprietari e gestori immobiliari.</p>
<address class="nap">
<strong>LiftCon</strong> è un servizio di ${esc(COMPANY.legalName)}<br>
Sede legale: ${esc(COMPANY.street)}, ${esc(COMPANY.postalCode)} ${esc(COMPANY.city)} (${esc(COMPANY.country)})<br>
Partita IVA ${esc(COMPANY.vat)}<br>
Telefono <a href="${CONTACT.phoneHref}">${esc(CONTACT.phone)}</a><br>
Email <a href="mailto:${esc(CONTACT.email)}">${esc(CONTACT.email)}</a>
</address>
</div>
${col("Servizi", [...servizi.map((s) => [s.path, s.nome]), [R.servizi, "Tutti i servizi"]])}
${col("Per chi e dove", [
    [R.amministratori, "Amministratori di condominio"],
    [R.proprietari, "Proprietari e privati"],
    [R.milano, "Milano"],
    [R.provMilano, "Provincia di Milano"],
    [R.lombardia, "Lombardia"],
  ])}
${col("Guide", [...guide.map((g) => [g.path, g.menu]), [R.glossario, "Glossario"], [R.faq, "Domande frequenti"]])}
${col("LiftCon", [
    [R.metodo, "Il metodo"],
    [R.chiSiamo, "Chi siamo"],
    [R.contatti, "Contatti"],
    [R.privacy, "Privacy"],
    [R.cookie, "Cookie"],
    [R.noteLegali, "Note legali"],
  ])}
</div>
<div class="foot-bottom wrap">
<p>© ${year} ${esc(COMPANY.legalName)}. I contenuti hanno scopo informativo e non costituiscono parere legale.</p>
<p><a class="credit" href="${CREDIT.url}" target="_blank" rel="noopener">${esc(CREDIT.text)}</a></p>
</div>
</footer>`;
}
