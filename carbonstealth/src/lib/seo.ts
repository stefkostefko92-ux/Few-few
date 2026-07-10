// SEO инжектиране за SPA: title, meta, canonical, hreflang, og + JSON-LD.
// Данните идват от seo.json (per-URL) — 126 маршрута.

import { useEffect } from 'react';
import { loadSeo } from './data';
import { pathOf } from './i18n';
import type { SeoPage } from './types';

let seoMap: Map<string, SeoPage> | null = null;

async function getSeoMap(): Promise<Map<string, SeoPage>> {
  if (seoMap) return seoMap;
  const seo = await loadSeo();
  const m = new Map<string, SeoPage>();
  for (const key of Object.keys(seo.pages)) {
    const p = seo.pages[key];
    if (p && p.url) m.set(pathOf(p.url), p);
  }
  seoMap = m;
  return m;
}

/**
 * Пътят на същата страница на друг език, резолвиран през hreflang
 * алтернативите от seo.json (слъговете са локализирани: servizi ↔ services ↔
 * uslugi). При липсваща алтернатива — началната страница на целевия език.
 */
export async function alternatePathFor(pathname: string, lang: string): Promise<string> {
  const map = await getSeoMap();
  const p = map.get(pathOf(pathname));
  const alt = p?.hreflang?.[lang];
  if (alt) return pathOf(alt);
  return lang === 'it' ? '/' : `/${lang}/`;
}

/** Генерира meta keywords от SEO данните на страницата + бранд базата за езика. */
export function buildKeywords(
  lang: string,
  title: string,
  description: string,
  extra: string[] = [],
): string {
  const base: Record<string, string[]> = {
    it: [
      'Carbon Stealth VCC',
      'agenzia digitale',
      'sviluppo siti web',
      'e-commerce',
      'software ERP',
      'app mobile',
      'SEO',
      'AEO',
      'hosting cloud',
      'Bulgaria',
      'Italia',
    ],
    en: [
      'Carbon Stealth VCC',
      'digital agency',
      'web development',
      'e-commerce',
      'ERP software',
      'mobile apps',
      'SEO',
      'AEO',
      'cloud hosting',
      'Bulgaria',
      'Europe',
    ],
    bg: [
      'Carbon Stealth VCC',
      'дигитална агенция',
      'изработка на сайт',
      'онлайн магазин',
      'ERP софтуер',
      'мобилни приложения',
      'SEO',
      'AEO',
      'облачен хостинг',
      'България',
      'Бобов дол',
    ],
  };
  // Съществителни от заглавието/описанието (без служебни думи и брандови повторения)
  const derived = `${title} ${description}`
    .replace(/[|—–\-·,.:;()€]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 4 && !/^\d+$/.test(w))
    .slice(0, 8);
  const all = [...(base[lang] ?? base.it), ...extra, ...derived];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const k of all) {
    const key = k.toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      out.push(k);
    }
  }
  return out.slice(0, 20).join(', ');
}

function setMeta(attr: 'name' | 'property', key: string, value: string): void {
  let el = document.head.querySelector<HTMLMetaElement>(`meta[${attr}="${key}"]`);
  if (!el) {
    el = document.createElement('meta');
    el.setAttribute(attr, key);
    document.head.appendChild(el);
  }
  el.setAttribute('content', value);
}

function setLink(rel: string, href: string, hreflang?: string): void {
  const sel = hreflang
    ? `link[rel="${rel}"][hreflang="${hreflang}"]`
    : `link[rel="${rel}"]:not([hreflang])`;
  let el = document.head.querySelector<HTMLLinkElement>(sel);
  if (!el) {
    el = document.createElement('link');
    el.rel = rel;
    if (hreflang) el.hreflang = hreflang;
    document.head.appendChild(el);
  }
  el.href = href;
}

function clearManaged(): void {
  document
    .querySelectorAll('[data-cs-seo], [data-cs-jsonld]')
    .forEach((n) => n.remove());
}

/** Инжектира един или няколко JSON-LD блока в <head>. */
function injectJsonLd(data: unknown): void {
  const blocks = Array.isArray(data) ? data : [data];
  for (const b of blocks) {
    if (!b) continue;
    const s = document.createElement('script');
    s.type = 'application/ld+json';
    s.setAttribute('data-cs-jsonld', '');
    s.textContent = JSON.stringify(b);
    document.head.appendChild(s);
  }
}

interface SeoOverride {
  title?: string;
  description?: string;
  jsonLd?: unknown;
}

/**
 * Прилага SEO за текущия маршрут. `override` позволява страници (блог/гео),
 * които не са в seo картата, да подадат собствени title/description/JSON-LD.
 */
export function useSeo(pathname: string, override?: SeoOverride): void {
  useEffect(() => {
    let alive = true;
    void getSeoMap().then((map) => {
      if (!alive) return;
      clearManaged();
      const p = map.get(pathname);

      const title = override?.title ?? p?.title ?? 'Carbon Stealth VCC';
      const description = override?.description ?? p?.description ?? '';
      document.title = title;
      document.documentElement.lang = p?.lang ?? 'it';

      if (description) {
        setMeta('name', 'description', description);
      }
      // Meta keywords — на всяка страница (изискване на собственика)
      const kwLang = p?.lang ?? 'it';
      setMeta('name', 'keywords', buildKeywords(kwLang, title, description));

      if (p) {
        setLink('canonical', p.canonical);
        // hreflang алтернативи
        document
          .querySelectorAll('link[rel="alternate"][hreflang]')
          .forEach((n) => n.remove());
        for (const hl of Object.keys(p.hreflang)) {
          const a = document.createElement('link');
          a.rel = 'alternate';
          a.hreflang = hl;
          a.href = p.hreflang[hl];
          a.setAttribute('data-cs-seo', '');
          document.head.appendChild(a);
        }
        // Open Graph — пълният блок от seo.json + гарантиран og:image
        const ogImage = p.og?.['og:image'] ?? 'https://carbonstealth.eu/og-image.png';
        setMeta('property', 'og:title', p.og?.['og:title'] ?? title);
        setMeta('property', 'og:description', p.og?.['og:description'] ?? description);
        setMeta('property', 'og:url', p.canonical);
        setMeta('property', 'og:type', p.og?.['og:type'] ?? 'website');
        setMeta('property', 'og:site_name', 'Carbon Stealth VCC');
        setMeta('property', 'og:image', ogImage);
        setMeta('property', 'og:image:width', p.og?.['og:image:width'] ?? '1200');
        setMeta('property', 'og:image:height', p.og?.['og:image:height'] ?? '630');
        if (p.og?.['og:locale']) setMeta('property', 'og:locale', p.og['og:locale']);
        // Twitter карта
        setMeta('name', 'twitter:card', p.twitter?.['twitter:card'] ?? 'summary_large_image');
        setMeta('name', 'twitter:title', p.twitter?.['twitter:title'] ?? title);
        setMeta(
          'name',
          'twitter:description',
          p.twitter?.['twitter:description'] ?? description,
        );
        setMeta('name', 'twitter:image', p.twitter?.['twitter:image'] ?? ogImage);
        // Индексиране + гео сигнали (от стария сайт)
        setMeta('name', 'robots', p.robots ?? 'index, follow, max-image-preview:large, max-snippet:-1');
        if (p.geoRegion) setMeta('name', 'geo.region', p.geoRegion);
        if (p.geoPlacename) setMeta('name', 'geo.placename', p.geoPlacename);
      }

      if (override?.jsonLd) injectJsonLd(override.jsonLd);

      return undefined;
    });
    return () => {
      alive = false;
    };
  }, [pathname, override?.title, override?.description, override?.jsonLd]);
}
