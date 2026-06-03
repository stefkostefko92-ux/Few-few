import type { MetadataRoute } from "next";
import { SITE } from "../lib/site";

export const dynamic = "force-static";

/**
 * robots.txt (§15). We welcome both classic search crawlers and AI / answer
 * engines (GEO): explicitly allowing the major LLM bots keeps АСО eligible to
 * be surfaced and cited by generative search. The same content is exposed in a
 * machine-readable summary at /llms.txt.
 */
export default function robots(): MetadataRoute.Robots {
  const aiBots = [
    "GPTBot",
    "OAI-SearchBot",
    "ChatGPT-User",
    "ClaudeBot",
    "Claude-Web",
    "anthropic-ai",
    "PerplexityBot",
    "Perplexity-User",
    "Google-Extended",
    "Applebot",
    "Applebot-Extended",
    "CCBot",
  ];
  return {
    rules: [
      { userAgent: "*", allow: "/" },
      ...aiBots.map((userAgent) => ({ userAgent, allow: "/" })),
    ],
    sitemap: `${SITE.url}/sitemap.xml`,
    host: SITE.url,
  };
}
