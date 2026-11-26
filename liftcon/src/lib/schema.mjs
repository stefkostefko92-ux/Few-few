// JSON-LD: обща графа (организация, сайт, страница, трохи) + специфичните възли на всяка страница.
// Адресът е реалното седалище на Carbon Stealth VCC; зоната на обслужване е Ломбардия (areaServed).

import { SITE, COMPANY, CONTACT, GEO, PROVINCE } from "../config.mjs";
import { abs, plain } from "./html.mjs";
import { R } from "../routes.mjs";

export const ID = {
  org: `${SITE.url}/#organization`,
  biz: `${SITE.url}/#liftcon`,
  site: `${SITE.url}/#website`,
  parent: `${COMPANY.url}/#organization`,
  person: `${SITE.url}${R.chiSiamo}#stefan-kostadinov`,
};

const address = {
  "@type": "PostalAddress",
  streetAddress: COMPANY.street,
  postalCode: COMPANY.postalCode,
  addressLocality: COMPANY.city,
  addressCountry: COMPANY.countryCode,
};

export function areaServed() {
  return [
    { "@type": "City", name: "Milano" },
    { "@type": "AdministrativeArea", name: "Città metropolitana di Milano" },
    ...PROVINCE.filter((p) => p !== "Milano").map((p) => ({ "@type": "AdministrativeArea", name: `Provincia di ${p}` })),
    { "@type": "State", name: "Lombardia" },
    {
      "@type": "GeoCircle",
      geoMidpoint: { "@type": "GeoCoordinates", latitude: GEO.lat, longitude: GEO.lng },
      geoRadius: "150000",
    },
  ];
}

export function baseGraph(servizi) {
  return [
    {
      "@type": "Organization",
      "@id": ID.parent,
      name: COMPANY.legalName,
      legalName: COMPANY.legalName,
      url: COMPANY.url,
      vatID: COMPANY.vat,
      taxID: COMPANY.eik,
      address,
      sameAs: COMPANY.sameAs,
    },
    {
      "@type": "ProfessionalService",
      "@id": ID.biz,
      name: SITE.name,
      alternateName: "LiftCon Consulenza tecnica ascensori",
      description:
        "Consulenza tecnica per ascensori a Milano e in Lombardia: sopralluoghi descrittivi, controllo qualità dei lavori, analisi dei preventivi, preparazione documentale alla verifica straordinaria e relazioni con report fotografico.",
      url: `${SITE.url}/`,
      logo: abs(SITE.url, "/assets/brand/logo-schema.png"),
      image: abs(SITE.url, "/img/render/hero-1600.jpg"),
      telephone: CONTACT.phoneSchema,
      email: CONTACT.email,
      address,
      areaServed: areaServed(),
      parentOrganization: { "@id": ID.parent },
      founder: { "@id": ID.person },
      knowsAbout: [
        "Ascensori in condominio",
        "DPR 162/1999",
        "DM 37/2008",
        "Verifica periodica degli ascensori",
        "Verifica straordinaria degli ascensori",
        "Manutenzione degli ascensori",
        "Ammodernamento degli ascensori",
      ],
      openingHoursSpecification: CONTACT.hours.map((h) => ({
        "@type": "OpeningHoursSpecification",
        dayOfWeek: h.days,
        opens: h.opens,
        closes: h.closes,
      })),
      contactPoint: {
        "@type": "ContactPoint",
        telephone: CONTACT.phoneSchema,
        email: CONTACT.email,
        contactType: "customer service",
        areaServed: "IT",
        availableLanguage: ["Italian"],
      },
      hasOfferCatalog: {
        "@type": "OfferCatalog",
        name: "Servizi di consulenza tecnica per ascensori",
        itemListElement: servizi.map((s) => ({
          "@type": "Offer",
          itemOffered: { "@id": `${abs(SITE.url, s.path)}#service` },
        })),
      },
    },
    {
      "@type": "Person",
      "@id": ID.person,
      name: COMPANY.responsabile,
      jobTitle: COMPANY.responsabileRuolo,
      worksFor: { "@id": ID.parent },
      url: abs(SITE.url, `${R.chiSiamo}#stefan-kostadinov`),
    },
    {
      "@type": "WebSite",
      "@id": ID.site,
      url: `${SITE.url}/`,
      name: SITE.name,
      description: "Consulenza tecnica ascensori a Milano e in Lombardia per amministratori di condominio e privati.",
      inLanguage: "it-IT",
      publisher: { "@id": ID.biz },
    },
  ];
}

export function webPage(page) {
  const url = abs(SITE.url, page.path);
  const node = {
    "@type": page.pageType ?? "WebPage",
    "@id": `${url}#webpage`,
    url,
    name: page.title,
    description: page.description,
    inLanguage: "it-IT",
    isPartOf: { "@id": ID.site },
    about: { "@id": ID.biz },
    dateModified: page.updated ?? SITE.updated,
    primaryImageOfPage: { "@type": "ImageObject", url: abs(SITE.url, page.ogImage ?? "/img/og/liftcon-og.jpg") },
    speakable: { "@type": "SpeakableSpecification", cssSelector: [".lead", ".answer"] },
  };
  if (page.breadcrumbs?.length) node.breadcrumb = { "@id": `${url}#breadcrumb` };
  return node;
}

export function breadcrumbList(page) {
  const url = abs(SITE.url, page.path);
  const items = [{ name: "Home", path: R.home }, ...page.breadcrumbs];
  return {
    "@type": "BreadcrumbList",
    "@id": `${url}#breadcrumb`,
    itemListElement: items.map((b, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: b.name,
      item: abs(SITE.url, b.path),
    })),
  };
}

export function faqPage(page, faq) {
  const url = abs(SITE.url, page.path);
  return {
    "@type": "FAQPage",
    "@id": `${url}#faq`,
    isPartOf: { "@id": `${url}#webpage` },
    mainEntity: faq.map((f) => ({
      "@type": "Question",
      name: f.q,
      acceptedAnswer: { "@type": "Answer", text: plain(f.a) },
    })),
  };
}

export function howTo(page, name, steps) {
  const url = abs(SITE.url, page.path);
  return {
    "@type": "HowTo",
    "@id": `${url}#howto`,
    name,
    inLanguage: "it-IT",
    step: steps.map(([t, d], i) => ({
      "@type": "HowToStep",
      position: i + 1,
      name: t,
      text: plain(d),
      url: `${url}#passo-${i + 1}`,
    })),
  };
}

export function serviceNode(s) {
  const url = abs(SITE.url, s.path);
  return {
    "@type": "Service",
    "@id": `${url}#service`,
    name: s.h1,
    serviceType: s.nome,
    description: s.description,
    url,
    provider: { "@id": ID.biz },
    areaServed: areaServed(),
    audience: [
      { "@type": "BusinessAudience", audienceType: "Amministratori di condominio" },
      { "@type": "Audience", audienceType: "Proprietari e gestori immobiliari" },
    ],
    availableChannel: {
      "@type": "ServiceChannel",
      serviceUrl: abs(SITE.url, R.contatti),
      servicePhone: { "@type": "ContactPoint", telephone: CONTACT.phoneSchema },
    },
  };
}
