import { Router, type Response } from 'express';
import { BRAND } from '../brand.js';
import { COMPANY } from '../company.js';
import { config } from '../config.js';
import { translator, type Locale } from '../i18n.js';
import { safeJson } from '../http/json-ld.js';
import { LEGAL_DOCUMENTS, LEGAL_DOCUMENT_IDS, type LegalDocumentId } from '../legal/documents.js';
import { pageUrl, SITE_PAGES, type SitePageId } from '../seo/pages.js';
import { organization, website } from '../seo/structured-data.js';
import { SESSION_LIMITS } from '../auth/sessions.js';
import { DAY, HOUR } from '../time.js';

/** Датата на версията за показване: „13.11.2026“ / „13 November 2026“. */
function versionDate(version: string, locale: Locale): string {
  const date = new Date(`${version}T00:00:00Z`);
  return new Intl.DateTimeFormat(locale === 'bg' ? 'bg-BG' : 'en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(date);
}

/** „3 дни“ / „8 часа“ — сроковете на сесията в текста на политиката идват от кода, не се пишат на ръка. */
function duration(ms: number, locale: Locale): string {
  const [n, one, many] =
    ms % DAY === 0
      ? [ms / DAY, locale === 'bg' ? 'ден' : 'day', locale === 'bg' ? 'дни' : 'days']
      : [ms / HOUR, locale === 'bg' ? 'час' : 'hour', locale === 'bg' ? 'часа' : 'hours'];
  return `${n}\u00a0${n === 1 ? one : many}`;
}

function sessionText(locale: Locale): string {
  const { standard, privileged } = SESSION_LIMITS;
  const d = (ms: number) => duration(ms, locale);
  return locale === 'bg'
    ? `${d(standard.idleMs)} без активност, най-много ${d(standard.absoluteMs)} (за екипа ни — ${d(privileged.idleMs)} и ${d(privileged.absoluteMs)})`
    : `${d(standard.idleMs)} without activity, at most ${d(standard.absoluteMs)} (for our staff — ${d(privileged.idleMs)} and ${d(privileged.absoluteMs)})`;
}

function renderLegal(res: Response, id: LegalDocumentId, locale: Locale): void {
  const base = config().PUBLIC_BASE_URL;
  const t = translator(locale);
  const doc = LEGAL_DOCUMENTS[id];
  const url = (target: Locale) => `${base}${doc.paths[target]}`;
  const title = t(`legal.${id}.title`);
  res.locals.lang = locale;
  res.locals.htmlLang = locale;
  res.locals.t = t;
  res.locals.brand = BRAND;
  res.locals.company = COMPANY;
  res.locals.page = id;
  res.locals.crumbLabel = title;
  res.locals.contentUpdated = doc.date;
  res.locals.urls = Object.fromEntries(
    SITE_PAGES.map((page) => [page.id, page.paths[locale]]),
  ) as Record<SitePageId, string>;
  res.locals.registrationOpen = config().REGISTRATION_OPEN;
  res.locals.seo = {
    title: t(`legal.${id}.metaTitle`),
    description: t(`legal.${id}.metaDescription`),
    keywords: t('legal.keywords')
      .split(',')
      .map((word) => word.trim())
      .filter(Boolean),
    canonical: url(locale),
    alternates: { bg: url('bg'), en: url('en') },
    xDefault: url('bg'),
    ogLocale: locale === 'bg' ? 'bg_BG' : 'en_GB',
    ogImage: `${base}/img/og-${locale}.png`,
    jsonLd: safeJson({
      '@context': 'https://schema.org',
      '@graph': [
        organization(base),
        website(base, locale),
        {
          '@type': 'BreadcrumbList',
          itemListElement: [
            {
              '@type': 'ListItem',
              position: 1,
              name: t('site.nav.home'),
              item: pageUrl(base, 'home', locale),
            },
            { '@type': 'ListItem', position: 2, name: title, item: url(locale) },
          ],
        },
        {
          '@type': 'WebPage',
          '@id': `${url(locale)}#page`,
          url: url(locale),
          name: title,
          description: t(`legal.${id}.metaDescription`),
          inLanguage: locale,
          dateModified: doc.date,
          isPartOf: { '@id': `${base}/#website` },
          publisher: { '@id': `${COMPANY.url}/#organization` },
        },
      ],
    }),
  };
  res.render('legal/page', {
    docId: id,
    version: doc.version,
    versionLabel: versionDate(doc.date, locale),
    privacyEmail: config().PRIVACY_EMAIL,
    contactEmail: config().CONTACT_EMAIL,
    sessionStandard: sessionText(locale),
    others: LEGAL_DOCUMENT_IDS.filter((other) => other !== id),
  });
}

/** Общите условия, политиката за поверителност и договорът за обработване — публични, индексирани. */
export function legalRouter(): Router {
  const router = Router();
  for (const id of LEGAL_DOCUMENT_IDS) {
    for (const locale of ['bg', 'en'] as const) {
      router.get(LEGAL_DOCUMENTS[id].paths[locale], (_req, res) => renderLegal(res, id, locale));
    }
  }
  return router;
}
