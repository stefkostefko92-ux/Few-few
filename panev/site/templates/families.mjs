// Страница на семейство продукти (врати A/B, опори за водачите на противотежестта, планки SG, по
// поръчка): по една за всяко търсене с намерение за покупка, с H1 и отговор отпред, секциите и цените
// от листата, FAQ (FAQPage) и линкове към каталога (PDF страниците) и към 3D изгледа. Продуктите в
// JSON-LD са същите обекти (@id) като на листата.

import { esc, pagePath, crumbName } from './layout.mjs';
import { FAMILIES, sectionsHtml, orderCta, itemListLd } from './products.mjs';
import { COMPANY, CATALOG_PDF } from '../data/products.mjs';
import { render3d } from './parts.mjs';
import { regola, regolaScript } from './regola.mjs';
import { cantiereSection } from './cantiere.mjs';

export const FAMILY_KEYS = Object.keys(FAMILIES);

// Снимката вдясно на заглавния блок: вратите и водачите се регулират на живо, SG и поръчковите са рендер.
const still = (name, alt) => `<figure class="hero-still">${render3d(name, alt, { sizes: '(max-width: 1020px) 90vw, 460px', lazy: false, priority: true })}</figure>`;
const VISUAL = {
  famDoors: (t) => regola(t, 'porta', { priority: true }),
  famGuides: (t) => regola(t, 'guida', { priority: true }),
  famSg: (t) => still('sg-80-190', t.families.famSg.visualAlt),
  famSpecial: (t) => still('braccio-160-190', t.families.famSpecial.visualAlt),
};

function crumbs(t, key) {
  const trail = ['home', 'products'].map((k) => `<a href="${pagePath(t, k)}">${esc(crumbName(t, k))}</a>`).join('<span aria-hidden="true"> › </span>');
  return `<nav class="crumbs" aria-label="${esc(t.families.shared.crumbsLabel)}">${trail}<span aria-hidden="true"> › </span><span aria-current="page">${esc(crumbName(t, key))}</span></nav>`;
}

export function familyPage(t, key) {
  const f = t.families[key];
  const sh = t.families.shared;
  const fam = FAMILIES[key];
  const [from, to] = fam.pages;
  // Печатната страница N е страница N + 1 на PDF-а (корицата е без номер); преди нея няма вмъкнати.
  const pdf = `${CATALOG_PDF}#page=${from + 1}`;
  const faq = f.faq.map((x, i) => `
      <details class="faq-item"${i === 0 ? ' open' : ''}>
        <summary><h3>${esc(x.q)}</h3></summary>
        <p>${esc(x.a)}</p>
      </details>`).join('');
  const others = FAMILY_KEYS.filter((k) => k !== key)
    .map((k) => `<li><a href="${pagePath(t, k)}">${esc(t.families[k].crumb)}</a></li>`).join('');
  return `
<section class="page-head">
  <div class="wrap page-head-grid">
    <div class="page-head-copy">
    ${crumbs(t, key)}
    <p class="kicker kicker-light">${esc(f.kicker)}</p>
    <h1>${esc(f.h1)}</h1>
    <p class="sec-lead">${esc(f.lead)}</p>
    <div class="hero-cta">
      <a class="btn btn-white" href="mailto:${COMPANY.email}?subject=${encodeURIComponent(`${t.order.mailSubject} · ${f.crumb}`)}&body=${encodeURIComponent(t.order.mailBody)}">${esc(t.nav.orderCta)}</a>
      <a class="btn btn-outline" href="${pagePath(t, 'viewer3d')}?${fam.view}">${esc(sh.see3d)}</a>
      <a class="btn btn-outline" href="${pdf}">${esc(sh.catalogPages(from, to))}</a>
    </div>
    </div>
    ${VISUAL[key](t)}
  </div>
</section>
${key === 'famDoors' || key === 'famGuides' ? regolaScript() : ''}

${sectionsHtml(t, fam.sections, { covers: false })}
${cantiereSection(t, key)}

<section class="section section-tint" id="faq">
  <div class="wrap">
    <h2>${esc(f.faqTitle)}</h2>
    <div class="faq-list">${faq}
    </div>
  </div>
</section>

<section class="section">
  <div class="wrap">
    <h2>${esc(sh.otherTitle)}</h2>
    <nav class="fam-links" aria-label="${esc(sh.familiesLabel)}"><ul>${others}</ul></nav>
    <p><a href="${pagePath(t, 'products')}">${esc(sh.fullList)}</a> · <a href="${pagePath(t, 'catalog')}">${esc(t.nav.catalog)}</a></p>
  </div>
</section>

${orderCta(t)}`;
}

export function familyLd(t, key) {
  return [
    itemListLd(t, t.families[key].h1, FAMILIES[key].sections),
    {
      '@type': 'FAQPage',
      mainEntity: t.families[key].faq.map((x) => ({ '@type': 'Question', name: x.q, acceptedAnswer: { '@type': 'Answer', text: x.a } })),
    },
  ];
}
