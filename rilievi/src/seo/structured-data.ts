import { COMPANY, CONTENT_UPDATED } from '../company.js';
import { config } from '../config.js';
import { jsonForScript } from '../http/json-script.js';
import { DEFAULT_LOCALE, LOCALE_TAG, type Translator } from '../i18n.js';
import { ULTIMO_AGGIORNAMENTO, VOCI } from '../novita/voci.js';
import { INVITE_DAYS } from '../services/invites.js';
import { FAQ_IDS, FEATURES, SERVIZI, STEPS } from '../site/landing.js';
import { HOME_PATH } from './paths.js';

/**
 * JSON-LD за публичните страници. Текстовете идват от същия речник, който страницата показва —
 * въпросите и отговорите във FAQPage и стъпките в HowTo са дума по дума тези от екрана.
 */

/** Езикът на сайта — само италиански. */
const IN_LANGUAGE = LOCALE_TAG[DEFAULT_LOCALE];

/** Какво знае фирмата — за търсачките и AI отговорите; само областите, които порталът покрива. */
const KNOWS_ABOUT = [
  'ascensori',
  'rilievo impianti ascensori',
  'manutenzione ascensori',
  'quadri di manovra',
  'argani e funi per ascensori',
];

/**
 * Фирмата — един възел за Organization и LocalBusiness (едно `@id`). Работно време не е обявено. Логото
 * е марката на портала върху черно (`npm run brand:logo`, 512 × 512 — квадратно, както го иска Google),
 * на този сайт; образът — картинката за споделяне.
 */
function organization(t: Translator, base: string) {
  const email = config().CONTACT_EMAIL;
  return {
    '@type': ['Organization', 'LocalBusiness'],
    '@id': `${COMPANY.url}/#org`,
    name: COMPANY.name,
    legalName: COMPANY.name,
    url: COMPANY.url,
    logo: {
      '@type': 'ImageObject',
      url: `${base}/static/img/icon-512.png`,
      width: 512,
      height: 512,
    },
    image: `${base}/static/img/og.png`,
    knowsAbout: KNOWS_ABOUT,
    sameAs: [...COMPANY.profiles],
    email,
    telephone: COMPANY.phone,
    contactPoint: COMPANY.phones.map(({ number }) => ({
      '@type': 'ContactPoint',
      contactType: 'customer support',
      email,
      telephone: number,
      availableLanguage: IN_LANGUAGE,
    })),
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
    inLanguage: IN_LANGUAGE,
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

export function landingStructuredData(t: Translator, canonical: string): string {
  const base = config().PUBLIC_BASE_URL;
  const graph = [
    organization(t, base),
    website(base),
    {
      '@type': 'WebPage',
      '@id': `${canonical}#page`,
      url: canonical,
      name: t('site.meta.title'),
      description: t('site.meta.description'),
      inLanguage: IN_LANGUAGE,
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
      inLanguage: IN_LANGUAGE,
      publisher: { '@id': `${COMPANY.url}/#org` },
      featureList: [
        ...FEATURES.map((id) => t(`site.features.${id}.title`)),
        ...SERVIZI.map((id) => t(`site.servizi.${id}.title`)),
      ],
    },
    {
      // стъпките от „Come si ottiene l'accesso“ дума по дума, всяка със своята котва на страницата
      '@type': 'HowTo',
      '@id': `${canonical}#accesso`,
      name: t('site.steps.title'),
      inLanguage: IN_LANGUAGE,
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
      inLanguage: IN_LANGUAGE,
      mainEntity: FAQ_IDS.map((id) => ({
        '@type': 'Question',
        name: t(`site.faq.${id}.q`),
        acceptedAnswer: { '@type': 'Answer', text: t(`site.faq.${id}.a`) },
      })),
    },
  ];
  return jsonForScript({ '@context': 'https://schema.org', '@graph': graph });
}

/** Обикновена правна страница (поверителността, условията): страницата и пътят до нея. */
export function paginaStructuredData(
  t: Translator,
  canonical: string,
  p: { title: string; description: string; updated: string },
): string {
  const base = config().PUBLIC_BASE_URL;
  return jsonForScript({
    '@context': 'https://schema.org',
    '@graph': [
      organization(t, base),
      website(base),
      {
        '@type': 'WebPage',
        '@id': `${canonical}#page`,
        url: canonical,
        name: p.title,
        description: p.description,
        inLanguage: IN_LANGUAGE,
        isPartOf: { '@id': `${base}/#website` },
        dateModified: p.updated,
        breadcrumb: { '@id': `${canonical}#breadcrumb` },
      },
      breadcrumb(canonical, [
        { name: 'Rilievi Impianti', url: `${base}${HOME_PATH}` },
        { name: p.title, url: canonical },
      ]),
    ],
  });
}

export function privacyStructuredData(t: Translator, canonical: string, updated: string): string {
  return paginaStructuredData(t, canonical, {
    title: t('privacy.title'),
    description: t('privacy.metaDescription'),
    updated,
  });
}

/**
 * Новините: страницата, пътят до нея и всяка новина като елемент на списък с котвата си — заглавията
 * дума по дума от страницата.
 */
export function novitaStructuredData(t: Translator, canonical: string): string {
  const base = config().PUBLIC_BASE_URL;
  const title = t('novita.titolo');
  return jsonForScript({
    '@context': 'https://schema.org',
    '@graph': [
      organization(t, base),
      website(base),
      {
        '@type': 'WebPage',
        '@id': `${canonical}#page`,
        url: canonical,
        name: t('novita.meta.title'),
        description: t('novita.meta.description'),
        inLanguage: IN_LANGUAGE,
        isPartOf: { '@id': `${base}/#website` },
        about: { '@id': `${base}/#app` },
        dateModified: ULTIMO_AGGIORNAMENTO,
        breadcrumb: { '@id': `${canonical}#breadcrumb` },
        mainEntity: { '@id': `${canonical}#elenco` },
        speakable: { '@type': 'SpeakableSpecification', cssSelector: ['.novita-pagina__lead'] },
      },
      breadcrumb(canonical, [
        { name: 'Rilievi Impianti', url: `${base}${HOME_PATH}` },
        { name: title, url: canonical },
      ]),
      {
        '@type': 'ItemList',
        '@id': `${canonical}#elenco`,
        name: t('novita.elenco'),
        itemListOrder: 'https://schema.org/ItemListOrderDescending',
        numberOfItems: VOCI.length,
        itemListElement: VOCI.map((voce, index) => ({
          '@type': 'ListItem',
          position: index + 1,
          name: t(`novita.voci.${voce.id}.titolo`),
          description: t(`novita.voci.${voce.id}.testo`),
          url: `${canonical}#${voce.id}`,
        })),
      },
    ],
  });
}
