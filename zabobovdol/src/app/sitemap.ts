import type { MetadataRoute } from "next";
import { SITE } from "@/lib/site";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = SITE.url;
  const now = new Date();

  const staticRoutes: MetadataRoute.Sitemap = [
    { url: `${base}/`, lastModified: now, changeFrequency: "daily", priority: 1 },
    { url: `${base}/kak-da`, lastModified: now, changeFrequency: "weekly", priority: 0.9 },
    { url: `${base}/uslugi`, lastModified: now, changeFrequency: "weekly", priority: 0.9 },
    { url: `${base}/biznes`, lastModified: now, changeFrequency: "weekly", priority: 0.8 },
    { url: `${base}/sabitiya`, lastModified: now, changeFrequency: "daily", priority: 0.8 },
    { url: `${base}/obyavi`, lastModified: now, changeFrequency: "daily", priority: 0.7 },
    { url: `${base}/novini`, lastModified: now, changeFrequency: "weekly", priority: 0.7 },
    { url: `${base}/pomosht`, lastModified: now, changeFrequency: "monthly", priority: 0.6 },
    { url: `${base}/za-nas`, lastModified: now, changeFrequency: "monthly", priority: 0.5 },
    { url: `${base}/kontakti`, lastModified: now, changeFrequency: "monthly", priority: 0.5 },
    { url: `${base}/poveritelnost`, lastModified: now, changeFrequency: "yearly", priority: 0.3 },
  ];

  try {
    const [faqs, services, businesses, events, posts] = await Promise.all([
      prisma.faq.findMany({
        where: { published: true },
        select: { slug: true, updatedAt: true },
      }),
      prisma.service.findMany({
        where: { published: true },
        select: { slug: true, updatedAt: true },
      }),
      prisma.business.findMany({
        where: { published: true },
        select: { slug: true, updatedAt: true },
      }),
      prisma.event.findMany({
        where: { published: true },
        select: { slug: true, updatedAt: true },
      }),
      prisma.post.findMany({
        where: { published: true },
        select: { slug: true, updatedAt: true },
      }),
    ]);

    const dyn: MetadataRoute.Sitemap = [
      ...faqs.map((x) => ({
        url: `${base}/kak-da/${x.slug}`,
        lastModified: x.updatedAt,
        changeFrequency: "monthly" as const,
        priority: 0.7,
      })),
      ...services.map((x) => ({
        url: `${base}/uslugi/${x.slug}`,
        lastModified: x.updatedAt,
        changeFrequency: "monthly" as const,
        priority: 0.6,
      })),
      ...businesses.map((x) => ({
        url: `${base}/biznes/${x.slug}`,
        lastModified: x.updatedAt,
        changeFrequency: "monthly" as const,
        priority: 0.6,
      })),
      ...events.map((x) => ({
        url: `${base}/sabitiya/${x.slug}`,
        lastModified: x.updatedAt,
        changeFrequency: "weekly" as const,
        priority: 0.6,
      })),
      ...posts.map((x) => ({
        url: `${base}/novini/${x.slug}`,
        lastModified: x.updatedAt,
        changeFrequency: "monthly" as const,
        priority: 0.5,
      })),
    ];
    return [...staticRoutes, ...dyn];
  } catch {
    // Ако базата не е достъпна при билд, връщаме поне статичните маршрути.
    return staticRoutes;
  }
}
