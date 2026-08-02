import type { MetadataRoute } from 'next';

import { absoluteUrl } from '@/lib/seo';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      // AI отговарачите са изрично добре дошли — това е GEO/AEO каналът ни.
      { userAgent: '*', allow: '/', // Пътищата живеят под езиков префикс — голото `/admin` не покрива `/bg/admin`.
      disallow: ['/admin', '/bg/admin', '/en/admin', '/api/', '/bg/report', '/en/report'] },
    ],
    sitemap: absoluteUrl('/sitemap.xml'),
    host: absoluteUrl('/'),
  };
}
