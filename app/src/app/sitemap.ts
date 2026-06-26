import type { MetadataRoute } from "next";
import { SITE } from "@/lib/site";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = SITE.url;
  // Стабилна дата на последна редакция на статичното съдържание — НЕ `new Date()`,
  // иначе lastmod е винаги „днес" (build time) и търсачките се научават да го игнорират.
  // Обнови я, когато промениш съдържанието на статичните страници.
  // Динамичните записи (от базата, по-долу) ползват реалния updatedAt.
  const now = new Date("2026-06-01T00:00:00Z");

  const staticRoutes: MetadataRoute.Sitemap = [
    { url: `${base}/`, lastModified: now, changeFrequency: "daily", priority: 1 },
    { url: `${base}/kak-da`, lastModified: now, changeFrequency: "weekly", priority: 0.9 },
    { url: `${base}/uslugi`, lastModified: now, changeFrequency: "weekly", priority: 0.9 },
    { url: `${base}/izmami`, lastModified: now, changeFrequency: "weekly", priority: 0.8 },
    { url: `${base}/dezhurna-apteka`, lastModified: now, changeFrequency: "weekly", priority: 0.7 },
    { url: `${base}/pomoshti`, lastModified: now, changeFrequency: "weekly", priority: 0.7 },
    { url: `${base}/danaci-srokove`, lastModified: now, changeFrequency: "monthly", priority: 0.6 },
    { url: `${base}/evroto`, lastModified: now, changeFrequency: "weekly", priority: 0.8 },
    { url: `${base}/biznes`, lastModified: now, changeFrequency: "weekly", priority: 0.8 },
    { url: `${base}/sabitiya`, lastModified: now, changeFrequency: "daily", priority: 0.8 },
    { url: `${base}/obyavi`, lastModified: now, changeFrequency: "daily", priority: 0.7 },
    { url: `${base}/transport`, lastModified: now, changeFrequency: "weekly", priority: 0.7 },
    { url: `${base}/prekysvaniya`, lastModified: now, changeFrequency: "daily", priority: 0.6 },
    { url: `${base}/spodeleno-patuvane`, lastModified: now, changeFrequency: "daily", priority: 0.7 },
    { url: `${base}/novini`, lastModified: now, changeFrequency: "weekly", priority: 0.7 },
    { url: `${base}/signali`, lastModified: now, changeFrequency: "monthly", priority: 0.6 },
    { url: `${base}/prozrachnost`, lastModified: now, changeFrequency: "weekly", priority: 0.7 },
    { url: `${base}/smetishta`, lastModified: now, changeFrequency: "daily", priority: 0.6 },
    { url: `${base}/grafik-smetosabirane`, lastModified: now, changeFrequency: "monthly", priority: 0.5 },
    { url: `${base}/imen-den`, lastModified: now, changeFrequency: "daily", priority: 0.6 },
    { url: `${base}/grada`, lastModified: now, changeFrequency: "monthly", priority: 0.7 },
    { url: `${base}/istoriya`, lastModified: now, changeFrequency: "monthly", priority: 0.6 },
    { url: `${base}/zov-za-pomosht`, lastModified: now, changeFrequency: "daily", priority: 0.7 },
    { url: `${base}/dobrovolci`, lastModified: now, changeFrequency: "weekly", priority: 0.6 },
    { url: `${base}/spomeni`, lastModified: now, changeFrequency: "weekly", priority: 0.6 },
    { url: `${base}/galeriya`, lastModified: now, changeFrequency: "weekly", priority: 0.6 },
    { url: `${base}/za-nas`, lastModified: now, changeFrequency: "monthly", priority: 0.5 },
    { url: `${base}/kak-da-polzvam-sayta`, lastModified: now, changeFrequency: "monthly", priority: 0.6 },
    { url: `${base}/dostapnost`, lastModified: now, changeFrequency: "monthly", priority: 0.6 },
    { url: `${base}/kontakti`, lastModified: now, changeFrequency: "monthly", priority: 0.5 },
    { url: `${base}/pechat`, lastModified: now, changeFrequency: "monthly", priority: 0.4 },
    { url: `${base}/pechat/avtobus`, lastModified: now, changeFrequency: "monthly", priority: 0.4 },
    { url: `${base}/pechat/plakat`, lastModified: now, changeFrequency: "monthly", priority: 0.4 },
    { url: `${base}/reklama`, lastModified: now, changeFrequency: "monthly", priority: 0.5 },
    { url: `${base}/pravila`, lastModified: now, changeFrequency: "yearly", priority: 0.3 },
    { url: `${base}/poveritelnost`, lastModified: now, changeFrequency: "yearly", priority: 0.3 },
    { url: `${base}/biskvitki`, lastModified: now, changeFrequency: "yearly", priority: 0.3 },
  ];

  try {
    const now2 = new Date();
    const notExpired = {
      OR: [{ expiresAt: null }, { expiresAt: { gte: now2 } }],
    };
    const [faqs, services, businesses, events, posts, listings, rides, help, memories] =
      await Promise.all([
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
        prisma.listing.findMany({
          where: { published: true, ...notExpired },
          select: { slug: true, updatedAt: true },
        }),
        prisma.rideshare.findMany({
          where: { published: true, ...notExpired },
          select: { slug: true, updatedAt: true },
        }),
        prisma.helpCause.findMany({
          where: { published: true },
          select: { slug: true, updatedAt: true },
        }),
        prisma.memory.findMany({
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
      ...listings.map((x) => ({
        url: `${base}/obyavi/${x.slug}`,
        lastModified: x.updatedAt,
        changeFrequency: "weekly" as const,
        priority: 0.5,
      })),
      ...rides.map((x) => ({
        url: `${base}/spodeleno-patuvane/${x.slug}`,
        lastModified: x.updatedAt,
        changeFrequency: "weekly" as const,
        priority: 0.5,
      })),
      ...help.map((x) => ({
        url: `${base}/zov-za-pomosht/${x.slug}`,
        lastModified: x.updatedAt,
        changeFrequency: "weekly" as const,
        priority: 0.5,
      })),
      ...memories.map((x) => ({
        url: `${base}/spomeni/${x.slug}`,
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
