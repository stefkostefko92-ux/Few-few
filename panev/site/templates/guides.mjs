// Двете задълбочени страници, по една за въпрос, който купувачът задава на търсачка или на AI:
// „патентовани ли са планките“ (patent) и „как се закрепва върху неравна зидария“ (walls). Отговорът
// е отпред, после данните, FAQ (FAQPage) и — за монтажа — шестте стъпки от каталога (HowTo).
// Текстовете са в i18n/<език>/guides.mjs; фактите са само тези от каталога.

import { esc, pagePath, crumbName, ORIGIN } from './layout.mjs';
import { orderCta } from './products.mjs';
import { FAMILY_KEYS } from './families.mjs';
import { CATALOG_PDF } from '../data/products.mjs';
import { render3d } from './parts.mjs';
import { regola, regolaScript } from './regola.mjs';
import { cantiereSection } from './cantiere.mjs';

export const GUIDE_KEYS = ['patent', 'walls'];
// Страниците между началната и тази в пътеката: монтажът е под продуктите, патентът — направо под началото.
export const GUIDE_PARENTS = { patent: [], walls: ['products'] };

// Печатната страница N е страница N + 1 на PDF-а (корицата е без номер).
const pdfPage = (n) => `${CATALOG_PDF}#page=${n + 1}`;

function crumbs(t, key) {
  const trail = ['home', ...GUIDE_PARENTS[key]].map((k) => `<a href="${pagePath(t, k)}">${esc(crumbName(t, k))}</a>`).join('<span aria-hidden="true"> › </span>');
  return `<nav class="crumbs" aria-label="${esc(t.guides.shared.crumbsLabel)}">${trail}<span aria-hidden="true"> › </span><span aria-current="page">${esc(crumbName(t, key))}</span></nav>`;
}

const faqHtml = (g) => `
<section class="section section-tint" id="faq">
  <div class="wrap">
    <h2>${esc(g.faqTitle)}</h2>
    <div class="faq-list">${g.faq.map((x, i) => `
      <details class="faq-item"${i === 0 ? ' open' : ''}>
        <summary><h3>${esc(x.q)}</h3></summary>
        <p>${esc(x.a)}</p>
      </details>`).join('')}
    </div>
  </div>
</section>`;

// Възлите са вързани за страницата си (@id, isPartOf към #webpage от layout.mjs) и носят езика ѝ.
const pageUrl = (t, key) => `${ORIGIN}${pagePath(t, key)}`;
const faqLd = (t, key) => ({
  '@type': 'FAQPage',
  '@id': `${pageUrl(t, key)}#faq`,
  inLanguage: t.htmlLang,
  isPartOf: { '@id': `${pageUrl(t, key)}#webpage` },
  mainEntity: t.guides[key].faq.map((x) => ({ '@type': 'Question', name: x.q, acceptedAnswer: { '@type': 'Answer', text: x.a } })),
});

// Семействата — под неутрално заглавие: патентът защитава решението с шарнирното съединение, не
// всеки код от ценоразписа, затова линковете към семействата не стоят под „патентованата система“.
const related = (t) => `
<section class="section">
  <div class="wrap">
    <h2>${esc(t.guides.shared.relatedTitle)}</h2>
    <nav class="fam-links" aria-label="${esc(t.guides.shared.relatedLabel)}"><ul>${FAMILY_KEYS.map((k) => `<li><a href="${pagePath(t, k)}">${esc(t.families[k].crumb)}</a></li>`).join('')}</ul></nav>
    <p><a href="${pagePath(t, 'products')}">${esc(t.families.shared.fullList)}</a> · <a href="${pagePath(t, 'catalog')}">${esc(t.nav.catalog)}</a></p>
  </div>
</section>`;

// ── Патентът ─────────────────────────────────────────────────
export function patentPage(t) {
  const g = t.guides.patent;
  const sh = t.guides.shared;
  // Данните са тези от началната страница (t.patent.rows), със заглавието и ведомството от сертификата.
  const [number, type, ...rest] = t.patent.rows;
  const rows = [number, type, g.titleRow, ...rest, g.officeRow].map(([k, v]) =>
    `<div class="spec-row"><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join('');
  const anatomy = g.anatomy.map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join('');
  return `
<section class="page-head">
  <div class="wrap page-head-grid">
    <div class="page-head-copy">
    ${crumbs(t, 'patent')}
    <p class="kicker kicker-light">${esc(g.kicker)}</p>
    <h1>${esc(g.h1)}</h1>
    <p class="sec-lead">${esc(g.lead)}</p>
    <div class="hero-cta">
      <a class="btn btn-white" href="${pdfPage(2)}">${esc(sh.catalogPage(2))}</a>
      <a class="btn btn-outline" href="${pagePath(t, 'walls')}">${esc(g.wallsLink)}</a>
    </div>
    </div>
    <figure class="hero-still">${render3d('a-65-170-7_b-65-320', g.visualAlt, { sizes: '(max-width: 1020px) 90vw, 460px', lazy: false, priority: true })}</figure>
  </div>
</section>

<section class="section">
  <div class="wrap section-grid">
    <div>
      <h2>${esc(g.scopeTitle)}</h2>
      <p>${esc(t.patent.body)}</p>
      <p>${esc(t.problem.body2)}</p>
    </div>
    <div>
      <h2>${esc(g.factsTitle)}</h2>
      <dl class="spec-card spec-card-plain">${rows}</dl>
    </div>
  </div>
</section>

<section class="section section-tint">
  <div class="wrap">
    <h2>${esc(g.anatomyTitle)}</h2>
    <p class="lead">${esc(g.anatomyLead)}</p>
    <dl class="term-list">${anatomy}</dl>
  </div>
</section>

<section class="section">
  <div class="wrap">
    <h2>${esc(g.whereTitle)}</h2>
    <p>${esc(g.whereLead)}</p>
    <p class="sec-more"><a href="${pdfPage(2)}">${esc(sh.catalogPage(2))}</a> · <a href="${pdfPage(3)}">${esc(sh.catalogPage(3))}</a> · <a href="${pagePath(t, 'walls')}">${esc(g.wallsLink)}</a></p>
  </div>
</section>
${faqHtml(g)}
${related(t)}

${orderCta(t)}`;
}

export const patentLd = (t) => [faqLd(t, 'patent')];

// ── Неравни зидарии ──────────────────────────────────────────
export function wallsPage(t) {
  const g = t.guides.walls;
  const sh = t.guides.shared;
  const rows = g.rows.map(([cond, how, system, fam]) => `<tr>
          <th scope="row">${esc(cond)}</th>
          <td>${esc(how)}</td>
          <td><a href="${pagePath(t, fam)}">${esc(system)}</a></td>
        </tr>`).join('');
  const steps = g.steps.map((s, i) => `
      <li class="step">
        <p class="step-num" aria-hidden="true">${i + 1}</p>
        <h3>${esc(s.title)}</h3>
        <p>${esc(s.body)}</p>
      </li>`).join('');
  return `
<section class="page-head">
  <div class="wrap page-head-grid">
    <div class="page-head-copy">
    ${crumbs(t, 'walls')}
    <p class="kicker kicker-light">${esc(g.kicker)}</p>
    <h1>${esc(g.h1)}</h1>
    <p class="sec-lead">${esc(g.lead)}</p>
    <div class="hero-cta">
      <a class="btn btn-white" href="#montaggio">${esc(g.stepsTitle)}</a>
      <a class="btn btn-outline" href="${pagePath(t, 'viewer3d')}">${esc(t.families.shared.see3d)}</a>
      <a class="btn btn-outline" href="${pdfPage(10)}">${esc(sh.catalogPage(10))}</a>
    </div>
    </div>
    ${regola(t, 'porta', { priority: true })}
  </div>
</section>
${regolaScript()}

<section class="section">
  <div class="wrap">
    <h2>${esc(g.problemTitle)}</h2>
    ${g.problem.map((p) => `<p>${esc(p)}</p>`).join('\n    ')}
  </div>
</section>

<section class="section section-tint">
  <div class="wrap">
    <h2>${esc(g.tableTitle)}</h2>
    <div class="table-scroll">
      <table class="choose-table stack-table">
        <thead><tr>${g.tableHead.map((h) => `<th scope="col">${esc(h)}</th>`).join('')}</tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
  </div>
</section>

<section class="section" id="montaggio">
  <div class="wrap">
    <h2>${esc(g.stepsTitle)}</h2>
    <p class="lead">${esc(g.stepsLead)}</p>
    <ol class="steps steps-rows">${steps}
    </ol>
    <p>${esc(g.stepsNote)} <a href="${pdfPage(10)}">${esc(sh.catalogPage(10))}</a> · <a href="${pagePath(t, 'patent')}">${esc(g.patentLink)}</a></p>
  </div>
</section>
${cantiereSection(t, 'walls')}
${faqHtml(g)}
${related(t)}

${orderCta(t)}`;
}

// Шестте стъпки са тези от стр. 10 на каталога; инструментите — трите от началната страница. Описанието
// носи и уговорката (меродавни са монтажните чертежи и проектът): HowTo се чете и извън страницата.
export const wallsLd = (t) => {
  const g = t.guides.walls;
  const url = pageUrl(t, 'walls');
  return [
    faqLd(t, 'walls'),
    {
      '@type': 'HowTo',
      '@id': `${url}#howto`,
      url: `${url}#montaggio`,
      name: g.howToName,
      description: `${g.stepsLead} ${g.stepsNote}`,
      inLanguage: t.htmlLang,
      isPartOf: { '@id': `${url}#webpage` },
      tool: t.problem.tools.map((name) => ({ '@type': 'HowToTool', name })),
      step: g.steps.map((s, i) => ({ '@type': 'HowToStep', position: i + 1, name: s.title, text: s.body })),
    },
  ];
};
