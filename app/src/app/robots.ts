import type { MetadataRoute } from "next";
import { SITE } from "@/lib/site";

export default function robots(): MetadataRoute.Robots {
  // Не индексираме админ зоната, API-то и динамичните резултати от търсене
  // (за да няма „тънки"/дублирани страници в индекса).
  const disallow = ["/admin", "/api", "/tarsene"];
  return {
    rules: [
      { userAgent: "*", allow: "/", disallow },
      // Изрично каним търсачките и AI асистентите/обхождачите (GEO/AEO) —
      // да индексират и цитират съдържанието на портала.
      {
        userAgent: [
          // Търсачки
          "Googlebot",
          "Bingbot",
          "Applebot",
          "DuckDuckBot",
          "YandexBot",
          // AI асистенти и обучителни/търсещи ботове
          "GPTBot",
          "OAI-SearchBot",
          "ChatGPT-User",
          "PerplexityBot",
          "Perplexity-User",
          "ClaudeBot",
          "Claude-Web",
          "anthropic-ai",
          "Google-Extended",
          "Applebot-Extended",
          "Amazonbot",
          "Bytespider",
          "Meta-ExternalAgent",
          "FacebookBot",
          "cohere-ai",
          "YouBot",
          "Diffbot",
          "Timpibot",
          "CCBot",
        ],
        allow: "/",
        disallow,
      },
    ],
    sitemap: `${SITE.url}/sitemap.xml`,
    host: SITE.url,
  };
}
