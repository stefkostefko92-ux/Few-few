import type { MetadataRoute } from "next";
import { SITE } from "@/lib/site";
import { GUIDES } from "@/data/guides";

// Статичните страници на портала.
const PATHS = [
  "/",
  "/uslugi",
  "/kak-da",
  "/dezhurna-apteka",
  "/izmami",
  "/pomoshti",
  "/danaci-srokove",
  "/evroto",
  "/prekysvaniya",
  "/transport",
  "/spodeleno-patuvane",
  "/reklama",
  "/pechat",
  "/pechat/plakat",
  "/sabitiya",
  "/novini",
  "/obyavi",
  "/obyavi/nova",
  "/biznes",
  "/signali",
  "/prozrachnost",
  "/grafik-smetosabirane",
  "/smetishta",
  "/imen-den",
  "/zov-za-pomosht",
  "/dobrovolci",
  "/spomeni",
  "/galeriya",
  "/grada",
  "/istoriya",
  "/tarsene",
  "/kontakti",
  "/razdeli",
  "/kak-da-polzvam-sayta",
  "/dostapnost",
  "/za-nas",
  "/pravila",
  "/poveritelnost",
  "/biskvitki",
];

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();
  const staticEntries = PATHS.map((path) => ({
    url: `${SITE.url}${path === "/" ? "" : path}`,
    lastModified: now,
    changeFrequency: "weekly" as const,
    priority: path === "/" ? 1 : 0.7,
  }));
  const guideEntries = GUIDES.map((g) => ({
    url: `${SITE.url}/kak-da/${g.slug}`,
    lastModified: now,
    changeFrequency: "monthly" as const,
    priority: 0.6,
  }));
  return [...staticEntries, ...guideEntries];
}
