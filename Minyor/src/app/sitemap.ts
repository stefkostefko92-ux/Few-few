import type { MetadataRoute } from "next";
import { SITE } from "@/lib/site";
import { getPostSlugs } from "@/lib/data";

export const dynamic = "force-dynamic";

const STATIC: { path: string; priority: number; freq: MetadataRoute.Sitemap[number]["changeFrequency"] }[] = [
  { path: "/", priority: 1.0, freq: "daily" },
  { path: "/novini", priority: 0.9, freq: "daily" },
  { path: "/programa", priority: 0.9, freq: "daily" },
  { path: "/klasirane", priority: 0.8, freq: "weekly" },
  { path: "/otbor", priority: 0.8, freq: "weekly" },
  { path: "/istoriya", priority: 0.6, freq: "monthly" },
  { path: "/stadion", priority: 0.6, freq: "yearly" },
  { path: "/galeriya", priority: 0.6, freq: "weekly" },
  { path: "/za-kluba", priority: 0.6, freq: "yearly" },
  { path: "/kontakti", priority: 0.6, freq: "yearly" },
  { path: "/dostapnost", priority: 0.3, freq: "yearly" },
  { path: "/poveritelnost", priority: 0.3, freq: "yearly" },
  { path: "/biskvitki", priority: 0.3, freq: "yearly" },
  { path: "/usloviya", priority: 0.3, freq: "yearly" },
];

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date();
  const base: MetadataRoute.Sitemap = STATIC.map((s) => ({
    url: `${SITE.url}${s.path === "/" ? "" : s.path}`,
    lastModified: now,
    changeFrequency: s.freq,
    priority: s.priority,
  }));

  const posts = await getPostSlugs();
  const news: MetadataRoute.Sitemap = posts.map((p) => ({
    url: `${SITE.url}/novini/${p.slug}`,
    lastModified: p.updatedAt ?? now,
    changeFrequency: "weekly",
    priority: 0.7,
  }));

  return [...base, ...news];
}
