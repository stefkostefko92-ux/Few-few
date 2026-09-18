import type { MetadataRoute } from "next";
import { SITE } from "../lib/site";
import { GAME_CONTENT } from "../content/games";
import { LOCALES, DEFAULT_LOCALE, localeHref } from "../i18n/locales";

export const dynamic = "force-static";

/**
 * Generated sitemap.xml (§15) with hreflang alternates. Every page is listed
 * once per locale (BG at the root, EN/IT prefixed), and each entry advertises
 * its siblings via `alternates.languages` so search engines cluster the
 * translations correctly.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();

  const bareEntries: Array<{ path: string; changeFrequency: "weekly" | "monthly"; priority: number }> = [
    { path: "/", changeFrequency: "weekly", priority: 1 },
    ...["games/", "faq/", "about/", "terms/", "privacy/", "cookies/", "responsible/"].map((p) => ({
      path: `/${p}`,
      changeFrequency: "weekly" as const,
      priority: 0.8,
    })),
    ...GAME_CONTENT.map((g) => ({
      path: `/games/${g.slug}/`,
      changeFrequency: "monthly" as const,
      priority: 0.7,
    })),
  ];

  return bareEntries.flatMap(({ path, changeFrequency, priority }) => {
    const languages: Record<string, string> = {};
    for (const l of LOCALES) languages[l] = `${SITE.url}${localeHref(l, path)}`;
    languages["x-default"] = `${SITE.url}${localeHref(DEFAULT_LOCALE, path)}`;
    return LOCALES.map((l) => ({
      url: `${SITE.url}${localeHref(l, path)}`,
      lastModified: now,
      changeFrequency,
      priority,
      alternates: { languages },
    }));
  });
}
