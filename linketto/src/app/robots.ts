import type { MetadataRoute } from 'next';
import { SITE_URL } from '@/lib/seo';

// GEO решение (собственикът иска цитиране от AI отговор-машините из цяла
// Европа): търсещите И обучаващите AI ботове са изрично допуснати.
const AI_BOTS = [
  'OAI-SearchBot',
  'PerplexityBot',
  'Claude-SearchBot',
  'Bingbot',
  'GPTBot',
  'ClaudeBot',
  'Google-Extended',
];

export default function robots(): MetadataRoute.Robots {
  const disallow = [
    '/api/',
    '/*/dashboard',
    '/*/login',
    '/*/register',
    '/*/admin',
    '/u/*/l/', // click redirect-и — не са съдържание
    '/u/*/delivery',
    '/d/', // собствените домейни се индексират на своя host, не тук
  ];
  return {
    rules: [
      { userAgent: '*', allow: '/', disallow },
      { userAgent: AI_BOTS, allow: '/', disallow },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
