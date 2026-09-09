import type { MetadataRoute } from 'next';
import { SITE_URL } from '@/lib/seo';

// AI ботовете са изрично допуснати (GEO/AEO — цитиране от отговор-машините).
const AI_BOTS = ['OAI-SearchBot', 'PerplexityBot', 'Claude-SearchBot', 'Bingbot', 'GPTBot', 'ClaudeBot', 'Google-Extended'];

export default function robots(): MetadataRoute.Robots {
  const disallow = ['/api/'];
  return {
    rules: [
      { userAgent: '*', allow: '/', disallow },
      { userAgent: AI_BOTS, allow: '/', disallow },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
