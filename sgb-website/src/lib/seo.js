import { config } from '../config.js';
import { isoDate } from './helpers.js';

export const abs = (p = '') => {
  if (!p) return config.siteUrl;
  if (/^https?:\/\//i.test(p)) return p;
  return config.siteUrl + (p.startsWith('/') ? p : '/' + p);
};

// JSON-LD: Организация (за GEO/AEO и rich results)
export function organizationLd(settings) {
  return {
    '@context': 'https://schema.org',
    '@type': ['Organization', 'NGO'],
    '@id': abs('/#organization'),
    name: settings.org_name || 'Съюз на глухите в България',
    alternateName: 'СГБ',
    url: config.siteUrl,
    logo: abs('/img/logo.svg'),
    email: settings.contact_email || undefined,
    telephone: settings.contact_phone || undefined,
    description: settings.site_description || undefined,
    address: settings.contact_address
      ? {
          '@type': 'PostalAddress',
          streetAddress: settings.contact_address,
          addressLocality: settings.contact_city || 'София',
          addressCountry: 'BG',
        }
      : undefined,
    sameAs: [settings.social_facebook, settings.social_youtube, settings.social_instagram].filter(Boolean),
  };
}

export function websiteLd(settings) {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    '@id': abs('/#website'),
    url: config.siteUrl,
    name: settings.org_name || 'Съюз на глухите в България',
    inLanguage: 'bg-BG',
    publisher: { '@id': abs('/#organization') },
    potentialAction: {
      '@type': 'SearchAction',
      target: { '@type': 'EntryPoint', urlTemplate: abs('/tarsene?q={search_term_string}') },
      'query-input': 'required name=search_term_string',
    },
  };
}

export function articleLd(article, settings) {
  return {
    '@context': 'https://schema.org',
    '@type': 'NewsArticle',
    '@id': abs(`/statia/${article.slug}#article`),
    headline: article.title,
    description: article.meta_description || article.excerpt || undefined,
    image: article.cover_image ? [abs(article.cover_image)] : undefined,
    datePublished: isoDate(article.published_at || article.created_at),
    dateModified: isoDate(article.updated_at || article.published_at || article.created_at),
    inLanguage: 'bg-BG',
    author: {
      '@type': 'Organization',
      name: article.author_name || settings.org_name || 'Съюз на глухите в България',
    },
    publisher: { '@id': abs('/#organization') },
    mainEntityOfPage: abs(`/statia/${article.slug}`),
    articleSection: article.category_name || undefined,
  };
}

export function breadcrumbLd(items) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((it, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: it.name,
      item: abs(it.url),
    })),
  };
}

export function faqLd(faqs) {
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: faqs.map((f) => ({
      '@type': 'Question',
      name: f.q,
      acceptedAnswer: { '@type': 'Answer', text: f.a },
    })),
  };
}
