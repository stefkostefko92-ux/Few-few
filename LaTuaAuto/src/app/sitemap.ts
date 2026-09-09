import type { MetadataRoute } from 'next';
import { DEFAULT_LOCALE, LOCALES } from '@/i18n/locales';
import { SITE_URL } from '@/lib/seo';

const PAGES: ReadonlyArray<{ path: string; priority: number; changeFrequency: 'weekly' | 'monthly' }> = [
  { path: '', priority: 1, changeFrequency: 'weekly' },
  { path: '/come-funziona', priority: 0.8, changeFrequency: 'monthly' },
  { path: '/sicurezza', priority: 0.8, changeFrequency: 'monthly' },
  { path: '/scadenze', priority: 0.9, changeFrequency: 'monthly' },
  { path: '/faq', priority: 0.7, changeFrequency: 'monthly' },
  { path: '/contatti', priority: 0.4, changeFrequency: 'monthly' },
  { path: '/privacy', priority: 0.3, changeFrequency: 'monthly' },
  { path: '/termini', priority: 0.3, changeFrequency: 'monthly' },
  { path: '/cookie', priority: 0.2, changeFrequency: 'monthly' },
];

export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = new Date('2026-09-08');
  return PAGES.map((p) => ({
    url: `${SITE_URL}/${DEFAULT_LOCALE}${p.path}`,
    lastModified,
    changeFrequency: p.changeFrequency,
    priority: p.priority,
    alternates: {
      languages: {
        ...Object.fromEntries(LOCALES.map((l) => [l, `${SITE_URL}/${l}${p.path}`])),
        'x-default': `${SITE_URL}/${DEFAULT_LOCALE}${p.path}`,
      },
    },
  }));
}
