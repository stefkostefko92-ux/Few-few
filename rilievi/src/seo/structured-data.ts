import { COMPANY, CONTENT_UPDATED } from '../company.js';
import { config } from '../config.js';
import { jsonForScript } from '../http/json-script.js';
import { LOCALE_TAG, LOCALES, type Locale, type Translator } from '../i18n.js';
import { INVITE_DAYS } from '../services/invites.js';
import { FAQ_IDS, FEATURES, STEPS } from '../site/landing.js';
import { publicPath } from './paths.js';

/**
 * JSON-LD за публичните страници. Текстовете идват от същите преводи, които страницата показва —
 * въпросите и отговорите във FAQPage и стъпките в HowTo са дума по дума тези от екрана.
 */

/** Фирмата — един възел за Organization и LocalBusiness (едно `@id`). Работно време не е обявено. */
function organization(t: Translator) {
  const email = config().CONTACT_EMAIL;
  return {
    '@type': ['Organization', 'LocalBusiness'],
    '@id': `${COMPANY.url}/#org`,
    name: COMPANY.name,
    legalName: COMPANY.name,
    alternateName: COMPANY.nameBg,
    url: COMPANY.url,
    email,
    telephone: COMPANY.phone,
    contactPoint: {
      '@type': 'ContactPoint',
      contactType: 'customer support',
      email,
      telephone: COMPANY.phone,
      availableLanguage: [...LOCALES],
    },
    taxID: COMPANY.eik,
    vatID: COMPANY.vat,
    address: {
      '@type': 'PostalAddress',
      streetAddress: t('company.street'),
      addressLocality: t('company.city'),
      addressRegion: t('company.region'),
      postalCode: COMPANY.postalCode,
      addressCountry: COMPANY.country,
    },
    geo: {
      '@type': 'GeoCoordinates',
      latitude: COMPANY.geo.latitude,
      longitude: COMPANY.geo.longitude,
    },
    areaServed: { '@type': 'Place', name: t('company.areaServed') },
  };
}

function website(base: string) {
  return {
    '@type': 'WebSite',
    '@id': `${base}/#website`,
    url: `${base}/`,
    name: 'Rilievi Impianti',
    inLanguage: [...LOCALES],
    publisher: { '@id': `${COMPANY.url}/#org` },
  };
}

function breadcrumb(canonical: string, items: Array<{ name: string; url: string }>) {
  return {
    '@type': 'BreadcrumbList',
    '@id': `${canonical}#breadcrumb`,
    itemListElement: items.map((item, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: item.name,
      item: item.url,
    })),
  };
}

export function landingStructuredData(locale: Locale, t: Translator, canonical: string): string {
  const base = config().PUBLIC_BASE_URL;
  const graph = [
    organization(t),
    website(base),
    {
      '@type': 'WebPage',
      '@id': `${canonical}#page`,
      url: canonical,
      name: t('site.meta.title'),
      description: t('site.meta.description'),
      inLanguage: LOCALE_TAG[locale],
      isPartOf: { '@id': `${base}/#website` },
      about: { '@id': `${base}/#app` },
      dateModified: CONTENT_UPDATED,
      breadcrumb: { '@id': `${canonical}#breadcrumb` },
      primaryImageOfPage: `${base}/static/img/og.png`,
      speakable: { '@type': 'SpeakableSpecification', cssSelector: ['.hero__lead', '.faq__a'] },
    },
    breadcrumb(canonical, [{ name: 'Rilievi Impianti', url: canonical }]),
    {
      '@type': 'SoftwareApplication',
      '@id': `${base}/#app`,
      name: 'Rilievi Impianti',
      image: `${base}/static/img/og.png`,
      applicationCategory: 'BusinessApplication',
      operatingSystem: 'Web',
      browserRequirements: t('site.meta.browser'),
      url: canonical,
      description: t('site.meta.description'),
      inLanguage: [...LOCALES],
      publisher: { '@id': `${COMPANY.url}/#org` },
      featureList: FEATURES.map((id) => t(`site.features.${id}.title`)),
    },
    {
      // стъпките от „Come si ottiene l'accesso“ дума по дума, всяка със своята котва на страницата
      '@type': 'HowTo',
      '@id': `${canonical}#accesso`,
      name: t('site.steps.title'),
      inLanguage: LOCALE_TAG[locale],
      step: STEPS.map((n) => ({
        '@type': 'HowToStep',
        position: n,
        name: t(`site.steps.s${n}.title`),
        text: t(`site.steps.s${n}.text`, { days: INVITE_DAYS }),
        url: `${canonical}#passo-${n}`,
      })),
    },
    {
      '@type': 'FAQPage',
      '@id': `${canonical}#faq`,
      inLanguage: LOCALE_TAG[locale],
      mainEntity: FAQ_IDS.map((id) => ({
        '@type': 'Question',
        name: t(`site.faq.${id}.q`),
        acceptedAnswer: { '@type': 'Answer', text: t(`site.faq.${id}.a`) },
      })),
    },
  ];
  return jsonForScript({ '@context': 'https://schema.org', '@graph': graph });
}

export function privacyStructuredData(
  locale: Locale,
  t: Translator,
  canonical: string,
  updated: string,
): string {
  const base = config().PUBLIC_BASE_URL;
  const title = t('privacy.title');
  return jsonForScript({
    '@context': 'https://schema.org',
    '@graph': [
      organization(t),
      website(base),
      {
        '@type': 'WebPage',
        '@id': `${canonical}#page`,
        url: canonical,
        name: title,
        description: t('privacy.metaDescription'),
        inLanguage: LOCALE_TAG[locale],
        isPartOf: { '@id': `${base}/#website` },
        dateModified: updated,
        breadcrumb: { '@id': `${canonical}#breadcrumb` },
      },
      breadcrumb(canonical, [
        { name: 'Rilievi Impianti', url: `${base}${publicPath(locale, 'home')}` },
        { name: title, url: canonical },
      ]),
    ],
  });
}
