import type { MetadataRoute } from 'next';
import { LOCALES } from '@/i18n/locales';
import { indexingAllowed, publicBaseUrl } from '@/lib/env';
import { TERMS_DATE } from '@/lib/legal';
import { EXPORT_REGISTER_DATE } from '@/lib/export-format';

export const dynamic = 'force-dynamic';

// The public pages (home, registration, pricing, privacy and terms, data and formats), one entry per language with its alternates
// and x-default (as in the pages' head); empty while indexing is off. The privacy page changes with the terms, the data
// page with the register of the export's format.
const PAGES: readonly { path: string; modified: string; priority: number }[] = [
  { path: '', modified: '2026-10-01', priority: 1 },
  { path: '/register', modified: '2026-10-01', priority: 0.6 },
  { path: '/pricing', modified: '2026-10-06', priority: 0.7 },
  { path: '/privacy', modified: TERMS_DATE, priority: 0.3 },
  { path: '/data', modified: EXPORT_REGISTER_DATE, priority: 0.3 },
];

export default function sitemap(): MetadataRoute.Sitemap {
  if (!indexingAllowed()) return [];
  const base = publicBaseUrl();
  return PAGES.flatMap((p) => {
    const languages = { ...Object.fromEntries(LOCALES.map((l) => [l, `${base}/${l}${p.path}`])), 'x-default': `${base}/it${p.path}` };
    return LOCALES.map((l) => ({ url: `${base}/${l}${p.path}`, lastModified: new Date(p.modified), changeFrequency: 'monthly' as const,
      priority: l === 'it' ? p.priority : Math.round(p.priority * 80) / 100, alternates: { languages } }));
  });
}
