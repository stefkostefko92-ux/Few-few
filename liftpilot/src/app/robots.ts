import type { MetadataRoute } from 'next';
import { indexingAllowed, publicBaseUrl } from '@/lib/env';

export const dynamic = 'force-dynamic';

// Until the owner approves the public release everything is closed; afterwards only the public pages are open.
export default function robots(): MetadataRoute.Robots {
  if (!indexingAllowed()) return { rules: [{ userAgent: '*', disallow: '/' }] };
  return {
    rules: [{ userAgent: '*', allow: '/', disallow: ['/api/', '/it/app', '/en/app', '/bg/app'] }],
    sitemap: `${publicBaseUrl()}/sitemap.xml`,
    host: publicBaseUrl(),
  };
}
