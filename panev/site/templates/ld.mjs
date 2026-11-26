// Структурираните данни (JSON-LD) на всяка страница: Organization, BreadcrumbList, WebSite, WebPage и това, което
// страницата добавя (Product, FAQPage, HowTo, VideoObject…). Изнесено от layout.mjs (файлът мина 300 реда); head()
// там вика jsonLd(). Помощните функции идват от layout.mjs и се ползват само при извикване (кръговият внос е безопасен).

import { COMPANY } from '../data/products.mjs';
import { versioned } from './asset.mjs';
import { ORIGIN, pagePath, crumbName, jsonEmbed } from './layout.mjs';

function organizationLd(t) {
  return {
    '@type': 'Organization',
    '@id': `${ORIGIN}/#organization`,
    name: COMPANY.name,
    legalName: COMPANY.name,
    url: `${ORIGIN}/`,
    logo: { '@type': 'ImageObject', url: `${ORIGIN}/img/panev-logo.png`, width: 640, height: 130 },
    image: `${ORIGIN}${versioned('img/og-panev.jpg')}`,
    areaServed: ['IT', 'EU'],
    // Седалището е адресът; производството е в Cornaredo (без пощенски код — не е в данните).
    location: {
      '@type': 'Place',
      name: t.contactsPage.rows.operative,
      address: { '@type': 'PostalAddress', streetAddress: 'Via Milano 7', addressLocality: 'Cornaredo', addressRegion: 'MI', addressCountry: 'IT' },
    },
    email: COMPANY.email,
    telephone: COMPANY.phone,
    vatID: COMPANY.vat,
    taxID: COMPANY.vat.replace(/^IT/, ''),
    identifier: { '@type': 'PropertyValue', propertyID: 'REA', value: COMPANY.rea },
    address: {
      '@type': 'PostalAddress',
      streetAddress: 'Via Madonna del Salvatore 6',
      postalCode: '20010',
      addressLocality: 'Vittuone',
      addressRegion: 'MI',
      addressCountry: 'IT',
    },
    contactPoint: {
      '@type': 'ContactPoint',
      contactType: 'sales',
      email: COMPANY.email,
      telephone: COMPANY.phone,
      availableLanguage: ['it', 'en', 'bg'],
    },
    knowsAbout: [
      'staffe per ascensori', 'staffe porte di piano', 'guide del contrappeso',
      'lift brackets', 'landing door brackets', 'counterweight guide rails',
      'планки за асансьори', 'планки за етажни врати', 'водачи на противотежестта',
      'brevetto Modello di Utilità UIBM 202023000002112',
    ],
  };
}
// parents: ключовете на страниците между началната и тази (страница на семейство → ['products']).
// webpage: допълнителни свойства на възела WebPage (страницата на видео: mainEntity, primaryImageOfPage).
export function jsonLd(t, pageKey, extra = [], parents = [], webpage = {}) {
  const url = `${ORIGIN}${pagePath(t, pageKey)}`;
  const trail = ['home', ...parents, pageKey];
  const breadcrumb = pageKey === 'home' ? [] : [{
    '@type': 'BreadcrumbList',
    '@id': `${url}#breadcrumb`,
    itemListElement: trail.map((key, i) => ({ '@type': 'ListItem', position: i + 1, name: crumbName(t, key), item: `${ORIGIN}${pagePath(t, key)}` })),
  }];
  const graph = [
    organizationLd(t),
    ...breadcrumb,
    {
      '@type': 'WebSite',
      '@id': `${ORIGIN}/#website`,
      url: `${ORIGIN}/`,
      name: COMPANY.name,
      inLanguage: ['it', 'en', 'bg'],
      publisher: { '@id': `${ORIGIN}/#organization` },
    },
    {
      '@type': 'WebPage',
      '@id': `${url}#webpage`,
      url,
      name: t.meta[pageKey].title,
      description: t.meta[pageKey].description,
      inLanguage: t.htmlLang,
      isPartOf: { '@id': `${ORIGIN}/#website` },
      about: { '@id': `${ORIGIN}/#organization` },
      ...(breadcrumb.length ? { breadcrumb: { '@id': `${url}#breadcrumb` } } : {}),
      ...webpage,
    },
    ...extra,
  ];
  return `<script type="application/ld+json">${jsonEmbed({ '@context': 'https://schema.org', '@graph': graph })}</script>`;
}
