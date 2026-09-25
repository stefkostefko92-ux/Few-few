import type { MetadataRoute } from "next";

/**
 * Освен общото правило изброяваме ИЗРИЧНО обхождачите на AI асистентите.
 *
 * Защо: целта на продукта е да го цитират в отговорите на ChatGPT, Perplexity,
 * Claude и AI Overviews (GEO/AEO). Едно `User-agent: *` върши работа днес, но
 * не казва нищо на този, който после чете файла — и при първото „да спрем ли
 * AI ботовете“ решението се взима слепешката. Тук е записано изрично, че
 * ИСКАМЕ да ни четат, и кой точно.
 *
 * Разделението е важно, ако собственикът промени решението си:
 *   • ИЗВЛИЧАНЕ (цитира ни в отговор, с линк) — OAI-SearchBot, ChatGPT-User,
 *     PerplexityBot, Claude-User, Claude-SearchBot. Тези носят посетители.
 *   • ОБУЧЕНИЕ (влизаме в модела, без линк) — GPTBot, Google-Extended,
 *     ClaudeBot, Applebot-Extended, CCBot. Тях се спира, без да се губи
 *     видимост — просто добави името в `disallow: ["/"]`.
 *
 * Съдържанието на сайта е публично и без лични данни, затова и двете групи са
 * позволени (решение на собственика). `/api/` и `/admin` са забранени за
 * всички — там няма съдържание за индексиране.
 */

const BLOCKED = ["/api/", "/admin"];

const RETRIEVAL = [
  "OAI-SearchBot",
  "ChatGPT-User",
  "PerplexityBot",
  "Perplexity-User",
  "Claude-User",
  "Claude-SearchBot",
  "Bingbot",
  "Googlebot",
];

const TRAINING = [
  "GPTBot",
  "Google-Extended",
  "ClaudeBot",
  "Applebot-Extended",
  "CCBot",
  "meta-externalagent",
];

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      { userAgent: "*", allow: "/", disallow: BLOCKED },
      { userAgent: RETRIEVAL, allow: "/", disallow: BLOCKED },
      { userAgent: TRAINING, allow: "/", disallow: BLOCKED },
    ],
    sitemap: "https://mastilko-bg.com/sitemap.xml",
    host: "https://mastilko-bg.com",
  };
}
