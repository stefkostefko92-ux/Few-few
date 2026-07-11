import type { MetadataRoute } from "next";
import { SITE } from "@/lib/site";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = SITE.url;
  // Реална дата на последна редакция на статичните страници. НЕ ползваме „сега“,
  // защото това при всяко обхождане казва на Google „всичко се промени току-що“
  // и обезсмисля `lastmod` сигнала. Бумни при същинска промяна по статичните страници.
  const STATIC_LASTMOD = new Date("2026-06-30");

  const staticRoutes: MetadataRoute.Sitemap = [
    { url: `${base}/`, lastModified: STATIC_LASTMOD, changeFrequency: "daily", priority: 1 },
    { url: `${base}/kak-da`, lastModified: STATIC_LASTMOD, changeFrequency: "weekly", priority: 0.9 },
    { url: `${base}/uslugi`, lastModified: STATIC_LASTMOD, changeFrequency: "weekly", priority: 0.9 },
    { url: `${base}/izmami`, lastModified: STATIC_LASTMOD, changeFrequency: "weekly", priority: 0.8 },
    { url: `${base}/dezhurna-apteka`, lastModified: STATIC_LASTMOD, changeFrequency: "weekly", priority: 0.7 },
    { url: `${base}/pomoshti`, lastModified: STATIC_LASTMOD, changeFrequency: "weekly", priority: 0.7 },
    { url: `${base}/danaci-srokove`, lastModified: STATIC_LASTMOD, changeFrequency: "monthly", priority: 0.6 },
    { url: `${base}/evroto`, lastModified: STATIC_LASTMOD, changeFrequency: "weekly", priority: 0.8 },
    { url: `${base}/biznes`, lastModified: STATIC_LASTMOD, changeFrequency: "weekly", priority: 0.8 },
    { url: `${base}/sabitiya`, lastModified: STATIC_LASTMOD, changeFrequency: "daily", priority: 0.8 },
    { url: `${base}/obyavi`, lastModified: STATIC_LASTMOD, changeFrequency: "daily", priority: 0.7 },
    { url: `${base}/transport`, lastModified: STATIC_LASTMOD, changeFrequency: "weekly", priority: 0.7 },
    { url: `${base}/prekysvaniya`, lastModified: STATIC_LASTMOD, changeFrequency: "daily", priority: 0.6 },
    { url: `${base}/spodeleno-patuvane`, lastModified: STATIC_LASTMOD, changeFrequency: "daily", priority: 0.7 },
    { url: `${base}/novini`, lastModified: STATIC_LASTMOD, changeFrequency: "weekly", priority: 0.7 },
    { url: `${base}/signali`, lastModified: STATIC_LASTMOD, changeFrequency: "monthly", priority: 0.6 },
    { url: `${base}/prozrachnost`, lastModified: STATIC_LASTMOD, changeFrequency: "weekly", priority: 0.7 },
    { url: `${base}/smetishta`, lastModified: STATIC_LASTMOD, changeFrequency: "daily", priority: 0.6 },
    { url: `${base}/grafik-smetosabirane`, lastModified: STATIC_LASTMOD, changeFrequency: "monthly", priority: 0.5 },
    { url: `${base}/imen-den`, lastModified: STATIC_LASTMOD, changeFrequency: "daily", priority: 0.6 },
    { url: `${base}/grada`, lastModified: STATIC_LASTMOD, changeFrequency: "monthly", priority: 0.7 },
    { url: `${base}/istoriya`, lastModified: STATIC_LASTMOD, changeFrequency: "monthly", priority: 0.6 },
    { url: `${base}/zov-za-pomosht`, lastModified: STATIC_LASTMOD, changeFrequency: "daily", priority: 0.7 },
    { url: `${base}/dobrovolci`, lastModified: STATIC_LASTMOD, changeFrequency: "weekly", priority: 0.6 },
    { url: `${base}/spomeni`, lastModified: STATIC_LASTMOD, changeFrequency: "weekly", priority: 0.6 },
    { url: `${base}/galeriya`, lastModified: STATIC_LASTMOD, changeFrequency: "weekly", priority: 0.6 },
    { url: `${base}/za-nas`, lastModified: STATIC_LASTMOD, changeFrequency: "monthly", priority: 0.5 },
    { url: `${base}/kak-da-polzvam-sayta`, lastModified: STATIC_LASTMOD, changeFrequency: "monthly", priority: 0.6 },
    { url: `${base}/dostapnost`, lastModified: STATIC_LASTMOD, changeFrequency: "monthly", priority: 0.6 },
    { url: `${base}/kontakti`, lastModified: STATIC_LASTMOD, changeFrequency: "monthly", priority: 0.5 },
    { url: `${base}/pechat`, lastModified: STATIC_LASTMOD, changeFrequency: "monthly", priority: 0.4 },
    { url: `${base}/pechat/avtobus`, lastModified: STATIC_LASTMOD, changeFrequency: "monthly", priority: 0.4 },
    { url: `${base}/pechat/plakat`, lastModified: STATIC_LASTMOD, changeFrequency: "monthly", priority: 0.4 },
    { url: `${base}/reklama`, lastModified: STATIC_LASTMOD, changeFrequency: "monthly", priority: 0.5 },
    { url: `${base}/pravila`, lastModified: STATIC_LASTMOD, changeFrequency: "yearly", priority: 0.3 },
    { url: `${base}/poveritelnost`, lastModified: STATIC_LASTMOD, changeFrequency: "yearly", priority: 0.3 },
    { url: `${base}/biskvitki`, lastModified: STATIC_LASTMOD, changeFrequency: "yearly", priority: 0.3 },
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
