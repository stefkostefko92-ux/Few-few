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
        // Open Graph
        setMeta('property', 'og:title', p.og?.['og:title'] ?? title);
        setMeta('property', 'og:description', p.og?.['og:description'] ?? description);
        setMeta('property', 'og:url', p.canonical);
        setMeta('property', 'og:type', p.og?.['og:type'] ?? 'website');
        setMeta('property', 'og:site_name', 'Carbon Stealth VCC');
      }

      if (override?.jsonLd) injectJsonLd(override.jsonLd);

      return undefined;
    });
    return () => {
      alive = false;
    };
  }, [pathname, override?.title, override?.description, override?.jsonLd]);
}
