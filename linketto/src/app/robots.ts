import type { MetadataRoute } from 'next';

export default function robots(): MetadataRoute.Robots {
  const base = process.env.PUBLIC_BASE_URL ?? 'http://localhost:3000';
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: ['/api/', '/*/dashboard', '/*/login', '/*/register'],
      },
    ],
    sitemap: `${base}/sitemap.xml`,
  };
}
