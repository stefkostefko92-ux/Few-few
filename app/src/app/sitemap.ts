import type { MetadataRoute } from "next";
import { SITE } from "@/lib/site";

// Статичните страници на портала. Добавяйте нови маршрути тук, докато расте.
const PATHS = ["/", "/uslugi", "/dezhurna-apteka", "/dostapnost", "/za-nas"];

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();
  return PATHS.map((path) => ({
    url: `${SITE.url}${path === "/" ? "" : path}`,
    lastModified: now,
    changeFrequency: "weekly",
    priority: path === "/" ? 1 : 0.7,
  }));
}
