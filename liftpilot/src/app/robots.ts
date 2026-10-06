import type { MetadataRoute } from 'next';
import { LOCALES } from '@/i18n/locales';
import { indexingAllowed, publicBaseUrl } from '@/lib/env';

export const dynamic = 'force-dynamic';

/** What no crawler needs: the API, the application and the pages opened from an e-mail's link. */
const PRIVATE = ['/api/', ...LOCALES.flatMap((l) => ['app', 'invite', 'reset-password', 'verify-email'].map((p) => `/${l}/${p}`))];

/** Crawlers that gather pages to train models: kept out (the owner's choice). Google-Extended also keeps the pages out of
 *  Gemini's grounding; Google Search, its AI Overviews included, use Googlebot and stay open. */
const TRAINING = ['GPTBot', 'ClaudeBot', 'CCBot', 'Google-Extended', 'Applebot-Extended', 'meta-externalagent', 'Bytespider'];

/** Crawlers of AI search and assistants that cite and link the pages: open like the search engines. */
const ANSWERS = ['OAI-SearchBot', 'ChatGPT-User', 'Claude-SearchBot', 'Claude-User', 'PerplexityBot', 'Perplexity-User', 'meta-webindexer'];

// Until the owner approves the public release everything is closed; afterwards only the public pages are open, to the
// search engines and to the AI search crawlers, and closed to the training crawlers. A crawler obeys the group that
// names it and ignores the others, so every open group repeats the private paths.
export default function robots(): MetadataRoute.Robots {
  if (!indexingAllowed()) return { rules: [{ userAgent: '*', disallow: '/' }] };
  return {
    rules: [
      { userAgent: TRAINING, disallow: '/' },
      { userAgent: ANSWERS, allow: '/', disallow: PRIVATE },
      { userAgent: '*', allow: '/', disallow: PRIVATE },
    ],
    sitemap: `${publicBaseUrl()}/sitemap.xml`,
    host: publicBaseUrl(),
  };
}
