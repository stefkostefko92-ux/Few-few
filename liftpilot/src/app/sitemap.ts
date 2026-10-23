import type { MetadataRoute } from 'next';
import { DEFAULT_LOCALE } from '@/i18n/locales';
import { indexingAllowed, publicBaseUrl } from '@/lib/env';
import { TERMS_DATE } from '@/lib/legal';
import { EXPORT_REGISTER_DATE } from '@/lib/export-format';

export const dynamic = 'force-dynamic';

// The public pages (home, registration, pricing, the quick guide, privacy and terms, data and formats), in Italian, the only language of
// the interface (no alternates, as in the pages' head); empty while indexing is off. The privacy page changes with the
// terms, the data page with the register of the export's format.
const PAGES: readonly { path: string; modified: string; priority: number }[] = [
  { path: '', modified: '2026-10-14', priority: 1 },
  { path: '/register', modified: '2026-10-14', priority: 0.6 },
  { path: '/pricing', modified: '2026-10-12', priority: 0.7 },
  { path: '/guida', modified: '2026-10-21', priority: 0.6 },
  { path: '/privacy', modified: TERMS_DATE, priority: 0.3 },
  { path: '/data', modified: EXPORT_REGISTER_DATE, priority: 0.3 },
];

export default function sitemap(): MetadataRoute.Sitemap {
  if (!indexingAllowed()) return [];
  const base = publicBaseUrl();
  return PAGES.map((p) => ({ url: `${base}/${DEFAULT_LOCALE}${p.path}`, lastModified: new Date(p.modified), changeFrequency: 'monthly' as const,
    priority: p.priority }));
}
