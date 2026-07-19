import type { MetadataRoute } from "next";
import { LOCALES, LOCALE_META } from "@/lib/i18n";

const PATHS = ["", "/privacy", "/cookie", "/termini"];

export default function sitemap(): MetadataRoute.Sitemap {
  const base = process.env.SITE_URL || "https://www.scuolabulgaramilano.it";
  const entries: MetadataRoute.Sitemap = [];

  for (const path of PATHS) {
    for (const locale of LOCALES) {
      const languages: Record<string, string> = {};
      for (const l of LOCALES) languages[LOCALE_META[l].htmlLang] = `${base}/${l}${path}`;
      // Always the Italian URL, matching the per-page metadata x-default (a single
      // x-default value across sources — a mismatch invalidates the whole cluster).
      languages["x-default"] = `${base}/it${path}`;
      entries.push({
        url: `${base}/${locale}${path}`,
        lastModified: new Date(),
        changeFrequency: path === "" ? "weekly" : "yearly",
        priority: path === "" ? 1 : 0.4,
        alternates: { languages },
      });
    }
  }
  return entries;
}
