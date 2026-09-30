import type { MetadataRoute } from 'next';
import { LOCALES } from '@/i18n/locales';
import { indexingAllowed, publicBaseUrl } from '@/lib/env';

export const dynamic = 'force-dynamic';

// The public pages, one entry per language with its alternates; empty while indexing is off.
export default function sitemap(): MetadataRoute.Sitemap {
  if (!indexingAllowed()) return [];
  const base = publicBaseUrl(), languages = Object.fromEntries(LOCALES.map((l) => [l, `${base}/${l}`]));
  return LOCALES.map((l) => ({ url: `${base}/${l}`, lastModified: new Date('2026-09-30'), changeFrequency: 'monthly', priority: l === 'it' ? 1 : 0.8, alternates: { languages } }));
}
