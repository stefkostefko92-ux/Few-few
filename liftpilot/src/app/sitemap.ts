import type { MetadataRoute } from 'next';
import { LOCALES } from '@/i18n/locales';
import { indexingAllowed, publicBaseUrl } from '@/lib/env';

export const dynamic = 'force-dynamic';

// The public pages (home, registration, privacy and terms), one entry per language with its alternates; empty while
// indexing is off.
const PAGES: readonly { path: string; modified: string; priority: number }[] = [
  { path: '', modified: '2026-10-01', priority: 1 },
  { path: '/register', modified: '2026-10-01', priority: 0.6 },
  { path: '/privacy', modified: '2026-10-01', priority: 0.3 },
];

export default function sitemap(): MetadataRoute.Sitemap {
  if (!indexingAllowed()) return [];
  const base = publicBaseUrl();
  return PAGES.flatMap((p) => {
    const languages = Object.fromEntries(LOCALES.map((l) => [l, `${base}/${l}${p.path}`]));
    return LOCALES.map((l) => ({ url: `${base}/${l}${p.path}`, lastModified: new Date(p.modified), changeFrequency: 'monthly' as const,
      priority: l === 'it' ? p.priority : Math.round(p.priority * 80) / 100, alternates: { languages } }));
  });
}
