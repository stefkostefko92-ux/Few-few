import type { MetadataRoute } from "next";
import { SITE } from "../lib/site";
import { GAME_CONTENT } from "../content/games";

export const dynamic = "force-static";

/** Generated sitemap.xml (§15). */
export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();
  const staticPages = ["", "games/", "about/", "terms/", "privacy/", "cookies/", "responsible/"].map(
    (path) => ({
      url: `${SITE.url}/${path}`,
      lastModified: now,
      changeFrequency: "weekly" as const,
      priority: path === "" ? 1 : 0.8,
    }),
  );
  const gamePages = GAME_CONTENT.map((g) => ({
    url: `${SITE.url}/games/${g.slug}/`,
    lastModified: now,
    changeFrequency: "monthly" as const,
    priority: 0.7,
  }));
  return [...staticPages, ...gamePages];
}
