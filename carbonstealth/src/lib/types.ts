// Типове за целия dataset (source of truth в /public/data/*.json).

export type Lang = 'it' | 'en' | 'bg';

/** Структуриран блок съдържание (visibleBlocks / blog content / geo sections). */
export interface Block {
  tag: string; // p, h1, h2, h3, li, ul, div ...
  text?: string;
  class?: string;
  items?: string[]; // за ul
}

export interface Service {
  n: string;
  t: string;
  d: string;
  tags: string;
}

export interface PricingItem {
  service: string;
  price: number;
  currency: string;
  unit: string;
  url: string;
}

export interface Stat {
  label: string;
  value: string;
}

export interface PortfolioItem {
  id: string;
  name: string;
  category: string;
  url: string;
}

export interface ProductItem {
  name: string;
  desc: string;
  url: string;
  tag: string;
}

export interface WorldFirst {
  id: string;
  title: string;
  desc: string;
  tech: string;
  year: string;
}

export interface Faq {
  q: string;
  a: string;
}

export interface FooterLink {
  label: string;
  target?: string;
  href?: string;
}

export interface Footer {
  services: FooterLink[];
  company: FooterLink[];
  legal: FooterLink[];
  badges: string[];
  registeredOfficeLabel: string;
  registeredOffice: string;
  eik: string;
  copyright: string;
  bottomLinks: string[];
  createdBy: string;
  techLine: string;
}

/** Структурирана статична страница (услуги, правни, за нас, контакти, портфолио). */
export interface PageData {
  file: string;
  url: string;
  title: string;
  metaDescription: string;
  h1: string;
  visibleBodyHtml?: string;
  visibleBlocks?: Block[];
  noscriptHtml?: string;
  jsonLd?: unknown;
}

export interface Content {
  ui: Record<string, string>;
  services: Service[];
  servicesPricing: PricingItem[];
  stats: Stat[];
  portfolio: PortfolioItem[];
  products: { _note?: string; items: ProductItem[] };
  worldFirsts: WorldFirst[];
  faq: Faq[];
  footer: Footer;
  misc: Record<string, string>;
  decor: Record<string, unknown>;
  bootSequence?: unknown;
  pages: Record<string, PageData>;
}

export interface Phone {
  display: string;
  tel: string;
  whatsapp?: string;
  areaServed: string;
  languages: string[];
}

export interface SiteData {
  name: string;
  slogan: string;
  eik: string;
  vatID: string;
  email: string;
  phones: Record<string, Phone>;
  address: {
    streetAddress: string;
    addressLocality: string;
    postalCode: string;
    addressRegion: string;
    addressCountry: string;
  };
  geo: { latitude: number; longitude: number; altitude?: string };
  sameAs: string[];
  contactApi: {
    endpoint: string;
    method: string;
    fields: string[];
  };
  jsonLdGraph?: unknown;
  webPageJsonLd?: unknown;
  portfolioJsonLd?: unknown;
}

export interface BlogPost {
  url: string;
  title: string;
  metaDescription: string;
  h1: string;
  dateLine: string;
  datePublished: string;
  headline: string;
  content: Block[];
  jsonLd?: unknown;
}

export interface BlogData {
  posts: Record<string, Record<Lang, BlogPost>>;
}

export interface GeoCity {
  url: string;
  title: string;
  metaDescription: string;
  h1: string;
  heroTag: string;
  heroIntro: string;
  geoRegion?: string;
  geoPlacename?: string;
  coordinates: { latitude: number; longitude: number };
  telephone?: string;
  sections: Block[];
  jsonLd?: unknown;
}

export interface GeoData {
  cities: Record<string, Record<Lang, GeoCity>>;
}

export interface SeoPage {
  file: string;
  url: string;
  lang: string;
  title: string;
  description: string;
  canonical: string;
  hreflang: Record<string, string>;
  og?: Record<string, string>;
  twitter?: Record<string, string>;
  robots?: string;
  geoRegion?: string;
  geoPlacename?: string;
}

export interface SeoData {
  pages: Record<string, SeoPage>;
}
