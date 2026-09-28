// Началната страница и нейният JSON-LD (FAQPage).

import { esc, pagePath } from './layout.mjs';
import { render3d } from './parts.mjs';
import { COMPANY, PATENT, CATALOG_PDF, doorSystems, guideConfigs, sgFixed } from '../data/products.mjs';

// ── Начална страница ─────────────────────────────────────────
export function homePage(t, locales) {
  const h = t.hero;
  const chips = h.chips.map((c) => `<span class="chip chip-light">${esc(c)}</span>`).join('');
  const stats = t.stats.map((s) =>
    `<div class="stat"><strong>${esc(s.value)}</strong><span>${esc(s.label)}</span></div>`
  ).join('');

  const apps = t.applications.items.map((a, i) => `
    <article class="app-card">
      ${render3d(a.img, a.title, { sizes: '(max-width: 860px) 100vw, 380px' })}
      <div class="app-body">
        <p class="app-num">0${i + 1}</p>
        <h3>${esc(a.title)}</h3>
        <p>${esc(a.body)}</p>
      </div>
    </article>`).join('');

  const famPrices = [
    Math.min(...doorSystems.flatMap((s) => s.items.map((i) => i.price))),
    Math.min(...[...guideConfigs.su, ...guideConfigs.sd].flatMap((c) => [c.sup.price, c.gui.price])),
    Math.min(...guideConfigs.sc.flatMap((c) => [c.sup.price, c.gui.price])),
    Math.min(...Object.values(sgFixed.prices)),
  ];
  const fams = t.featured.families.map((f, i) => `
    <a class="fam-card" href="${pagePath(t, 'products')}#sezione-0${[1, 2, 4, 5][i]}">
      ${render3d(f.img, f.title, { sizes: '(max-width: 600px) 100vw, (max-width: 1000px) 50vw, 280px' })}
      <div class="fam-body">
        <h3>${esc(f.title)}</h3>
        <p>${esc(f.body)}</p>
        <p class="fam-price">${esc(t.featured.fromPrice)} <strong>${esc(t.fmtPrice(famPrices[i]))}</strong> <small>${esc(t.featured.vatNote)}</small></p>
      </div>
    </a>`).join('');

  const patentRows = t.patent.rows.map(([k, v]) =>
    `<div class="spec-row"><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join('');

  const steps = t.order.steps.map((s, i) => `
    <li class="step">
      <p class="step-num" aria-hidden="true">${i + 1}</p>
      <h3>${esc(s.title)}</h3>
      <p>${i === 1 ? esc(s.body).replace('info@panevascensori.it', `<a href="mailto:${COMPANY.email}">${COMPANY.email}</a>`) : esc(s.body)}</p>
    </li>`).join('');

  const mailHref = `mailto:${COMPANY.email}?subject=${encodeURIComponent(t.order.mailSubject)}&body=${encodeURIComponent(t.order.mailBody)}`;

  return `
<section class="hero">
  <div class="wrap hero-grid">
    <div class="hero-copy">
      <p class="kicker kicker-light">${esc(h.kicker)}</p>
      <h1>${esc(h.title)}</h1>
      <p class="hero-lead">${esc(h.lead)}</p>
      <div class="chips">${chips}</div>
      <div class="hero-cta">
        <a class="btn btn-white" href="${pagePath(t, 'products')}">${esc(h.ctaProducts)}</a>
        <a class="btn btn-outline" href="${CATALOG_PDF}" download>${esc(h.ctaCatalog)}</a>
        <a class="btn btn-outline" href="#vista-3d">${esc(h.cta3d)}</a>
      </div>
      <div class="patent-badge">
        <p><strong>${esc(h.patentLabel)} ${esc(h.numAbbr || 'N.')} ${PATENT.number}</strong></p>
        <p>${esc(h.patentOffice)}</p>
      </div>
    </div>
    <div class="hero-visual">
      ${render3d('a-65-170-7_b-65-320-hero', h.visualAlt, { sizes: '(max-width: 1020px) 420px, 460px', lazy: false, priority: true, h: 1200 })}
    </div>
  </div>
  <div class="wrap stats-band">${stats}</div>
</section>
${viewerSection(t)}

<section class="section">
  <div class="wrap section-grid">
    <div>
      <p class="kicker">${esc(t.problem.kicker)}</p>
      <h2>${esc(t.problem.title)}</h2>
      <p>${esc(t.problem.body1)}</p>
      <p>${esc(t.problem.body2)}</p>
      <p class="tools-label">${esc(t.problem.toolsLabel)}</p>
      <div class="chips">${t.problem.tools.map((x) => `<span class="chip">${esc(x)}</span>`).join('')}</div>
    </div>
    <aside class="highlight-card">
      <h3>${esc(t.problem.highlight)}</h3>
      <p>${esc(t.problem.highlightBody)}</p>
      ${render3d('a-37-170-2_b-37-320', t.problem.highlight, { sizes: '(max-width: 860px) 100vw, 440px' })}
    </aside>
  </div>
</section>

<section class="section section-tint">
  <div class="wrap">
    <p class="kicker">${esc(t.applications.kicker)}</p>
    <h2>${esc(t.applications.title)}</h2>
    <div class="app-grid">${apps}</div>
    <p class="callout">${esc(t.applications.ambi)}</p>
  </div>
</section>

<section class="section">
  <div class="wrap">
    <p class="kicker">${esc(t.featured.kicker)}</p>
    <h2>${esc(t.featured.title)}</h2>
    <div class="fam-grid">${fams}</div>
    <p class="center"><a class="btn btn-primary" href="${pagePath(t, 'products')}">${esc(t.featured.seeAll)}</a></p>
  </div>
</section>

<section class="section section-navy">
  <div class="wrap section-grid">
    <div>
      <p class="kicker kicker-light">${esc(t.patent.kicker)}</p>
      <h2>${esc(t.patent.title)}</h2>
      <p>${esc(t.patent.body)}</p>
      <p class="conformity">${esc(t.patent.conformity)}</p>
    </div>
    <dl class="spec-card">${patentRows}</dl>
  </div>
</section>

<section class="section" id="ordina">
  <div class="wrap">
    <p class="kicker">${esc(t.order.kicker)}</p>
    <h2>${esc(t.order.title)}</h2>
    <p class="lead">${esc(t.order.lead)}</p>
    <ol class="steps">${steps}</ol>
    <p class="callout">${esc(t.order.freeShipping)} ${esc(t.order.b2b)}</p>
    <p class="center"><a class="btn btn-primary" href="${mailHref}">${esc(t.nav.orderCta)}</a></p>
  </div>
</section>

<section class="section section-tint" id="faq">
  <div class="wrap">
    <p class="kicker">${esc(t.faq.kicker)}</p>
    <h2>${esc(t.faq.title)}</h2>
    <div class="faq-list">
      ${t.faq.items.map((f, i) => `
      <details class="faq-item"${i === 0 ? ' open' : ''}>
        <summary><h3>${esc(f.q)}</h3></summary>
        <p>${esc(f.a)}</p>
      </details>`).join('')}
    </div>
  </div>
</section>`;
}

// 3D изгледът: постер (рендерът на опора + планка за водач), който на широк екран става самия
// визьор в рамка — чак при клик, затова страницата не тежи нищо повече. На тесен екран и без JS
// постерът е линк към цялата 3D страница. Рамката започва от същия комплект като постера.
function viewerSection(t) {
  const v = t.viewer3d;
  const view = 'code=SU-220-160&amp;mode=assembly';
  const href = pagePath(t, 'viewer3d');
  const points = v.points.map((x) => `<li>${esc(x)}</li>`).join('');
  return `
<section class="section section-tint section-3d" id="vista-3d">
  <div class="wrap">
    <div class="viewer-head">
      <div>
        <p class="kicker">${esc(v.kicker)}</p>
        <h2>${esc(v.title)}</h2>
        <p class="lead">${esc(v.lead)}</p>
      </div>
      <ul class="viewer-points">${points}</ul>
    </div>
    <div class="viewer-frame" data-viewer data-src="${pagePath(t, 'viewer3dEmbed')}?${view}" data-title="${esc(v.frameTitle)}">
      <a class="viewer-poster" href="${href}?${view}">
        ${render3d('su-220-160_sg-80-150', v.posterAlt, { sizes: '(max-width: 1200px) 100vw, 1160px', large: true })}
        <span class="viewer-start">${esc(v.start)}</span>
      </a>
    </div>
    <p class="viewer-full"><a href="${href}">${esc(v.fullscreen)}</a></p>
  </div>
</section>`;
}

// JSON-LD FAQPage — за началната страница (най-силният AEO сигнал).
export function homeLd(t) {
  return [{
    '@type': 'FAQPage',
    mainEntity: t.faq.items.map((f) => ({
      '@type': 'Question',
      name: f.q,
      acceptedAnswer: { '@type': 'Answer', text: f.a },
    })),
  }];
}
