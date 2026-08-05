import type { MetadataRoute } from "next";

import { SITE_URL } from "@/lib/site";

/**
 * Само същинските страници. Страниците с резултат са безброй и `noindex` —
 * слагането им в sitemap би било точно „съдържание в мащаб без стойност“,
 * което търсачките наказват.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = new Date();
  const pages = [
    { path: "", priority: 1, changeFrequency: "weekly" as const },
    { path: "/kak-raboti", priority: 0.9, changeFrequency: "monthly" as const },
    { path: "/poveritelnost", priority: 0.3, changeFrequency: "yearly" as const },
    { path: "/usloviya", priority: 0.3, changeFrequency: "yearly" as const },
    { path: "/danni-v-rezultatite", priority: 0.4, changeFrequency: "yearly" as const },
    { path: "/impresum", priority: 0.3, changeFrequency: "yearly" as const },
  ];

  return pages.map((page) => ({
    url: `${SITE_URL}${page.path}`,
    lastModified,
    changeFrequency: page.changeFrequency,
    priority: page.priority,
  }));
}
