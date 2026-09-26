// Каталог, контакти и правните страници. Всяка функция връща HTML за <main>.

import { esc, pagePath, ORIGIN } from './layout.mjs';
import { COMPANY, CATALOG_PDF } from '../data/products.mjs';
import { versioned } from './asset.mjs';

// ── Каталог ──────────────────────────────────────────────────
export function catalogPage(t, locales) {
  const c = t.catalogPage;
  const previews = [1, 5, 8, 10, 14, 20, 40, 63, 65].map((n) => {
    const nn = String(n).padStart(2, '0');
    return `<li><img src="/img/catalogo/pagina-${nn}.webp" alt="${esc(c.previewTitle)} — ${nn}" width="248" height="175" loading="lazy" decoding="async"></li>`;
  }).join('');
  const toc = c.toc.map((x) => `<li>${esc(x)}</li>`).join('');

  return `
<section class="page-head">
  <div class="wrap">
    <p class="kicker kicker-light">${esc(c.kicker)}</p>
    <h1>${esc(c.title)}</h1>
    <p class="sec-lead">${esc(c.lead)}</p>
    <div class="chips">
      <span class="chip chip-light">${esc(c.edition)}</span>
      <span class="chip chip-light">${esc(c.pages)}</span>
      <span class="chip chip-light">${esc(c.sizeNote)}</span>
    </div>
    <div class="hero-cta">
      <a class="btn btn-white" href="${versioned(CATALOG_PDF)}" download>${esc(c.download)}</a>
      <a class="btn btn-outline" href="${versioned(CATALOG_PDF)}" target="_blank" rel="noopener">${esc(c.view)}</a>
    </div>
  </div>
</section>

<section class="section">
  <div class="wrap catalog-grid">
    <div class="catalog-viewer">
      <object data="${versioned(CATALOG_PDF)}#view=FitH" type="application/pdf" width="100%" height="640" aria-label="${esc(c.title)}">
        <p class="callout">${esc(c.fallback)}</p>
      </object>
    </div>
    <aside class="catalog-toc">
      <h2>${esc(c.tocTitle)}</h2>
      <ol>${toc}</ol>
      <p class="note">${esc(c.interactiveNote)}</p>
      <a class="btn btn-primary" href="${versioned(CATALOG_PDF)}" download>${esc(c.download)}</a>
    </aside>
  </div>
</section>

<section class="section section-tint">
  <div class="wrap">
    <p class="kicker">${esc(c.previewKicker)}</p>
    <h2>${esc(c.previewTitle)}</h2>
    <ul class="preview-strip">${previews}</ul>
  </div>
</section>`;
}

export function catalogLd(t) {
  return [{
    '@type': 'DigitalDocument',
    name: t.meta.catalog.title,
    url: `${ORIGIN}${CATALOG_PDF}`,
    encodingFormat: 'application/pdf',
    inLanguage: t.htmlLang,
    datePublished: '2026-01-01',
    publisher: { '@id': `${ORIGIN}/#organization` },
  }];
}

// ── Контакти ─────────────────────────────────────────────────
export function contactsPage(t, locales) {
  const c = t.contactsPage;
  const f = c.fields;
  const mailHref = `mailto:${COMPANY.email}?subject=${encodeURIComponent(t.order.mailSubject)}&body=${encodeURIComponent(t.order.mailBody)}`;
  const ship = c.shipping.map((x) => `<li>${esc(x)}</li>`).join('');

  return `
<section class="page-head">
  <div class="wrap">
    <p class="kicker kicker-light">${esc(c.kicker)}</p>
    <h1>${esc(c.title)}</h1>
    <p class="sec-lead">${esc(c.lead)}</p>
  </div>
</section>

<section class="section">
  <div class="wrap contact-grid">
    <div>
      <div class="highlight-card contact-order">
        <h2>${esc(c.orderEmailTitle)}</h2>
        <p>${esc(c.orderEmailBody)}</p>
        <p class="contact-mail">${esc(c.writeUs)} <a href="mailto:${COMPANY.email}">${COMPANY.email}</a></p>
        <a class="btn btn-primary" href="${mailHref}">${esc(t.nav.orderCta)}</a>
      </div>

      <h2 class="mt">${esc(c.dataTitle)}</h2>
      <dl class="spec-card spec-card-plain">
        <div class="spec-row"><dt>${esc(c.rows.phone)}</dt><dd><a href="tel:${COMPANY.phoneHref}">${esc(COMPANY.phone)}</a></dd></div>
        <div class="spec-row"><dt>${esc(c.rows.email)}</dt><dd><a href="mailto:${COMPANY.email}">${esc(COMPANY.email)}</a></dd></div>
        <div class="spec-row"><dt>${esc(c.rows.web)}</dt><dd>${esc(COMPANY.site)}</dd></div>
        <div class="spec-row"><dt>${esc(c.rows.legal)}</dt><dd>${esc(COMPANY.legalSeat)}</dd></div>
        <div class="spec-row"><dt>${esc(c.rows.operative)}</dt><dd>${esc(COMPANY.operativeSeat)}</dd></div>
        <div class="spec-row"><dt>${esc(c.rows.vat)}</dt><dd>${esc(COMPANY.vat)}</dd></div>
        <div class="spec-row"><dt>REA</dt><dd>${esc(COMPANY.rea)} · ${esc(COMPANY.registry)}</dd></div>
      </dl>

      <h2 class="mt">${esc(c.shippingTitle)}</h2>
      <ul class="checklist">${ship}</ul>
    </div>

    <div id="modulo">
      <h2>${esc(c.formTitle)}</h2>
      <p>${esc(c.formLead)}</p>
      <p class="note">${esc(f.requiredNote)}</p>
      <form class="contact-form" data-contact-form novalidate>
        <label>${esc(f.name)}<input type="text" name="nome" autocomplete="name" required maxlength="150"></label>
        <label>${esc(f.company)}<input type="text" name="azienda" autocomplete="organization" required maxlength="150"></label>
        <div class="form-row">
          <label>${esc(f.email)}<input type="email" name="email" autocomplete="email" required maxlength="200"></label>
          <label>${esc(f.tel)}<input type="tel" name="tel" autocomplete="tel" maxlength="30"></label>
        </div>
        <label>${esc(f.message)}<textarea name="messaggio" rows="7" required maxlength="3000"></textarea></label>
        <input type="text" name="website" tabindex="-1" autocomplete="off" aria-hidden="true" class="hp">
        <label class="check"><input type="checkbox" name="privacy" required> <span>${esc(f.privacy)}</span></label>
        <p class="check-link"><a href="${pagePath(t, 'privacy')}">${esc(f.privacyLink)}</a></p>
        <button class="btn btn-primary" type="submit" data-submit-label="${esc(f.submit)}" data-sending-label="${esc(f.sending)}">${esc(f.submit)}</button>
        <p class="form-status" data-form-status role="status" aria-live="polite"
           data-ok="${esc(f.ok)}" data-err="${esc(f.err)}"></p>
      </form>
    </div>
  </div>
</section>`;
}

export function contactsLd(t) {
  return [{
    '@type': 'ContactPage',
    url: `${ORIGIN}${pagePath(t, 'contacts')}`,
    name: t.meta.contacts.title,
    inLanguage: t.htmlLang,
  }];
}

// ── Правни страници ──────────────────────────────────────────
function legalBody(title, updated, intro, sections) {
  const secs = sections.map((s) => `<h2>${esc(s.h)}</h2><p>${esc(s.p)}</p>`).join('');
  return `
<section class="page-head page-head-slim">
  <div class="wrap"><h1>${esc(title)}</h1><p class="sec-lead">${esc(updated)}</p></div>
</section>
<section class="section">
  <div class="wrap legal-body">
    ${intro ? `<p class="lead">${esc(intro)}</p>` : ''}
    ${secs}
  </div>
</section>`;
}

export function privacyPage(t) {
  const p = t.privacyPage;
  return legalBody(p.title, p.updated, p.intro, p.sections);
}

export function termsPage(t) {
  const p = t.termsPage;
  return legalBody(p.title, p.updated, '', p.sections);
}
