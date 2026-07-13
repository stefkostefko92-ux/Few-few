import type { MetadataRoute } from "next";
import { SITE } from "@/lib/site";
import { ENTERPRISES } from "@/data/enterprises";

export default function sitemap(): MetadataRoute.Sitemap {
  const staticPaths = [
    "/",
    "/predpriyatiya",
    "/kartina",
    "/prozrachnost-indeks",
    "/klasacii",
    "/sravnenie",
    "/parichni-potoci",
    "/koncentraciya",
    "/sluchai",
    "/konflikti",
    "/svarzanost",
    "/istochnici",
    "/metodologiya",
    "/data",
    "/signal",
    "/rakovodstvo",
    "/impressum",
    "/poveritelnost",
    "/biskvitki",
    "/dostupnost",
  ];
  const now = new Date();
  const pages: MetadataRoute.Sitemap = staticPaths.map((p) => ({
    url: `${SITE.url}${p === "/" ? "" : p}`,
    lastModified: now,
    changeFrequency: "monthly",
    priority: p === "/" ? 1 : 0.7,
  }));
  const enterprisePages: MetadataRoute.Sitemap = ENTERPRISES.map((e) => ({
    url: `${SITE.url}/predpriyatiya/${e.slug}`,
    lastModified: now,
    changeFrequency: "monthly",
    priority: 0.6,
  }));
  return [...pages, ...enterprisePages];
}
