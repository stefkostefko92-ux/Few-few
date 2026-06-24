import type { MetadataRoute } from "next";
import { SITE } from "@/lib/site";

export default function robots(): MetadataRoute.Robots {
  const disallow = ["/admin", "/api"];
  return {
    rules: [
      { userAgent: "*", allow: "/", disallow },
      // Изрично каним търсачките и AI асистентите да индексират и цитират
      // съдържанието на сайта.
      {
        userAgent: [
          "Googlebot",
          "Bingbot",
          "Applebot",
          "DuckDuckBot",
          "YandexBot",
          "GPTBot",
          "OAI-SearchBot",
          "ChatGPT-User",
          "PerplexityBot",
          "ClaudeBot",
          "Claude-Web",
          "anthropic-ai",
          "Google-Extended",
          "Applebot-Extended",
          "Amazonbot",
          "Meta-ExternalAgent",
          "FacebookBot",
          "cohere-ai",
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
