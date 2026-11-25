import type { MetadataRoute } from "next";
import { SITE } from "@/lib/site";
import { prisma } from "@/lib/prisma";
import { latestDate } from "@/lib/seo";
import { getGuideIndex } from "@/lib/howto-index";
import { categoryPath } from "@/lib/howto";

export const dynamic = "force-dynamic";

type Entry = MetadataRoute.Sitemap[number];
type Freq = NonNullable<Entry["changeFrequency"]>;

// Последна редакция на шаблона/текста на статичните страници. НЕ ползваме
// „сега“: това при всяко обхождане казва „всичко се промени току-що“ и
// обезсмисля `lastmod`. Бумни при същинска промяна по статичните страници.
const STATIC_LASTMOD = new Date("2026-06-30");
// Страниците, добавени във вълната за растеж (23.10.2026).
const WAVE_LASTMOD = new Date("2026-10-23");

// Теми от „Как да…“, които имат и собствена съдържателна страница.
const CAT_POMOSHTI = "Пенсии и социални помощи";
const CAT_IZMAMI = "Измами и безопасност";
const CAT_EVROTO = "Еврото";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = SITE.url;
  const page = (path: string, lastModified: Date, changeFrequency: Freq, priority: number): Entry => ({
    url: `${base}${path}`,
    lastModified,
    changeFrequency,
    priority,
  });

  // Страници без данни от базата (или с постоянно полезен текст) — винаги вътре.
  const fixed: Entry[] = [
    page("/danaci-srokove", STATIC_LASTMOD, "monthly", 0.6),
    page("/signali", STATIC_LASTMOD, "monthly", 0.6),
    page("/prozrachnost", STATIC_LASTMOD, "weekly", 0.7),
    page("/grafik-smetosabirane", STATIC_LASTMOD, "monthly", 0.5),
    page("/imen-den", STATIC_LASTMOD, "daily", 0.6),
    page("/grada", STATIC_LASTMOD, "monthly", 0.7),
    page("/istoriya", STATIC_LASTMOD, "monthly", 0.6),
    page("/za-nas", STATIC_LASTMOD, "monthly", 0.5),
    page("/kak-da-polzvam-sayta", STATIC_LASTMOD, "monthly", 0.6),
    page("/dostapnost", STATIC_LASTMOD, "monthly", 0.6),
    page("/kontakti", STATIC_LASTMOD, "monthly", 0.5),
    page("/pechat", STATIC_LASTMOD, "monthly", 0.4),
    page("/pechat/avtobus", STATIC_LASTMOD, "monthly", 0.4),
    page("/pechat/plakat", STATIC_LASTMOD, "monthly", 0.4),
    page("/reklama", STATIC_LASTMOD, "monthly", 0.5),
    page("/pravila", STATIC_LASTMOD, "yearly", 0.3),
    page("/poveritelnost", STATIC_LASTMOD, "yearly", 0.3),
    page("/biskvitki", STATIC_LASTMOD, "yearly", 0.3),
    // Нови във вълната за растеж.
    page("/instaliraj", WAVE_LASTMOD, "monthly", 0.6),
    page("/za-blizkite", WAVE_LASTMOD, "monthly", 0.6),
    page("/izvestiya", WAVE_LASTMOD, "monthly", 0.6),
    page("/pechat/sedmitsa", WAVE_LASTMOD, "weekly", 0.5),
  ];

  // Основните хъбове с данни — при грешка на базата поне тях с последната ръчна дата.
  const coreFallback: Entry[] = [
    page("/", STATIC_LASTMOD, "daily", 1),
    page("/kak-da", WAVE_LASTMOD, "weekly", 0.9),
    page("/uslugi", STATIC_LASTMOD, "weekly", 0.9),
    page("/izmami", STATIC_LASTMOD, "weekly", 0.8),
    page("/dezhurna-apteka", STATIC_LASTMOD, "weekly", 0.7),
    page("/pomoshti", STATIC_LASTMOD, "weekly", 0.7),
    page("/evroto", STATIC_LASTMOD, "weekly", 0.8),
    page("/transport", STATIC_LASTMOD, "weekly", 0.7),
    page("/prekysvaniya", STATIC_LASTMOD, "daily", 0.6),
    page("/smetishta", STATIC_LASTMOD, "daily", 0.6),
  ];

  try {
    const now = new Date();
    const notExpired = { OR: [{ expiresAt: null }, { expiresAt: { gte: now } }] };
    const [
      index,
      services,
      businesses,
      events,
      posts,
      listings,
      rides,
      help,
      memories,
      scams,
      outages,
      duty,
      dumps,
      volunteers,
      photos,
      obituaries,
    ] = await Promise.all([
      getGuideIndex(),
      prisma.service.findMany({
        where: { published: true },
        select: { slug: true, updatedAt: true, category: true },
      }),
      prisma.business.findMany({ where: { published: true }, select: { slug: true, updatedAt: true } }),
      prisma.event.findMany({
        where: { published: true },
        select: { slug: true, updatedAt: true, startAt: true },
      }),
      prisma.post.findMany({ where: { published: true }, select: { slug: true, updatedAt: true } }),
      prisma.listing.findMany({
        where: { published: true, ...notExpired },
        select: { slug: true, updatedAt: true },
      }),
      prisma.rideshare.findMany({
        where: { published: true, ...notExpired },
        select: { slug: true, updatedAt: true },
      }),
      prisma.helpCause.findMany({ where: { published: true }, select: { slug: true, updatedAt: true } }),
      prisma.memory.findMany({ where: { published: true }, select: { slug: true, updatedAt: true } }),
      prisma.scamAlert.aggregate({ where: { published: true }, _max: { updatedAt: true } }),
      prisma.outage.aggregate({ where: { published: true }, _max: { updatedAt: true } }),
      prisma.dutyRoster.aggregate({ where: { published: true }, _max: { updatedAt: true } }),
      prisma.dumpReport.aggregate({ where: { published: true }, _max: { updatedAt: true } }),
      prisma.volunteer.aggregate({
        where: { published: true },
        _max: { updatedAt: true },
        _count: { _all: true },
      }),
      prisma.galleryPhoto.aggregate({
        where: { published: true, imageUrl: { not: "" } },
        _max: { updatedAt: true },
        _count: { _all: true },
      }),
      prisma.obituary.aggregate({
        where: { published: true },
        _max: { updatedAt: true },
        _count: { _all: true },
      }),
    ]);

    const maxOf = (rows: { updatedAt: Date }[]) => rows.map((r) => r.updatedAt);
    // Най-новото от данните и от последната промяна по шаблона (`floor`).
    const last = (dates: (Date | null | undefined)[], floor = STATIC_LASTMOD) =>
      latestDate([...dates, floor], floor);
    const catMax = (name: string) =>
      index.categories.find((c) => c.names.includes(name))?.lastModified ?? null;
    const servicesIn = (cat: string) => services.filter((s) => s.category === cat);

    // /kak-da и темите получиха нов шаблон в тази вълна.
    const guidesMax = last(maxOf(index.guides), WAVE_LASTMOD);
    const upcoming = events.filter((e) => e.startAt >= now);

    // Хъбовете: lastmod = най-новата реална редакция на записите им (не „сега“),
    // но не по-стара от последната промяна по самия шаблон.
    const hubs: Entry[] = [
      page(
        "/",
        last([
          guidesMax,
          ...maxOf(services),
          ...maxOf(posts),
          ...maxOf(events),
          ...maxOf(listings),
          outages._max.updatedAt,
          scams._max.updatedAt,
          duty._max.updatedAt,
        ]),
        "daily",
        1,
      ),
      page("/kak-da", guidesMax, "weekly", 0.9),
      page("/uslugi", last(maxOf(services)), "weekly", 0.9),
      page("/izmami", last([scams._max.updatedAt, catMax(CAT_IZMAMI)]), "weekly", 0.8),
      page(
        "/dezhurna-apteka",
        last([duty._max.updatedAt, ...maxOf(servicesIn("HEALTH"))]),
        "weekly",
        0.7,
      ),
      page("/pomoshti", last([catMax(CAT_POMOSHTI)]), "weekly", 0.7),
      page("/evroto", last([catMax(CAT_EVROTO)]), "weekly", 0.8),
      page("/transport", last(maxOf(servicesIn("TRANSPORT"))), "weekly", 0.7),
      // Целева страница за „спиране на ток/вода“ — остава и когато в момента няма прекъсвания.
      page("/prekysvaniya", last([outages._max.updatedAt]), "daily", 0.6),
      page("/smetishta", last([dumps._max.updatedAt]), "daily", 0.6),
    ];

    // Списъчни раздели — само когато има какво да се покаже (празните са „тънки“ страници).
    const lists: Entry[] = [
      ...(businesses.length ? [page("/biznes", last(maxOf(businesses)), "weekly", 0.8)] : []),
      ...(upcoming.length ? [page("/sabitiya", last(maxOf(events)), "daily", 0.8)] : []),
      ...(listings.length ? [page("/obyavi", last(maxOf(listings)), "daily", 0.7)] : []),
      ...(rides.length
        ? [page("/spodeleno-patuvane", last(maxOf(rides)), "daily", 0.7)]
        : []),
      ...(posts.length ? [page("/novini", last(maxOf(posts)), "weekly", 0.7)] : []),
      ...(help.length ? [page("/zov-za-pomosht", last(maxOf(help)), "daily", 0.7)] : []),
      ...(volunteers._count._all
        ? [page("/dobrovolci", last([volunteers._max.updatedAt]), "weekly", 0.6)]
        : []),
      ...(memories.length ? [page("/spomeni", last(maxOf(memories)), "weekly", 0.6)] : []),
      ...(photos._count._all
        ? [page("/galeriya", last([photos._max.updatedAt]), "weekly", 0.6)]
        : []),
      // Помените — само хъбът и само при публикувани; отделните записи не се изнасят.
      ...(obituaries._count._all
        ? [page("/pomeni", last([obituaries._max.updatedAt], WAVE_LASTMOD), "daily", 0.5)]
        : []),
    ];

    // Темите на „Как да…“ (първата страница; следващите се откриват по връзките).
    const categories: Entry[] = index.categories.map((c) =>
      page(categoryPath(c.slug), last([c.lastModified], WAVE_LASTMOD), "weekly", 0.8),
    );

    const item = (prefix: string, freq: Freq, priority: number) => (x: { slug: string; updatedAt: Date }) =>
      page(`${prefix}/${x.slug}`, x.updatedAt, freq, priority);

    const dyn: Entry[] = [
      // Без дублите — те пренасочват постоянно към ръководството, което остава.
      ...index.guides.map(item("/kak-da", "monthly", 0.7)),
      ...services.map(item("/uslugi", "monthly", 0.6)),
      ...businesses.map(item("/biznes", "monthly", 0.6)),
      ...events.map(item("/sabitiya", "weekly", 0.6)),
      ...posts.map(item("/novini", "monthly", 0.5)),
      ...listings.map(item("/obyavi", "weekly", 0.5)),
      ...rides.map(item("/spodeleno-patuvane", "weekly", 0.5)),
      ...help.map(item("/zov-za-pomosht", "weekly", 0.5)),
      ...memories.map(item("/spomeni", "monthly", 0.5)),
    ];

    return [...hubs, ...lists, ...categories, ...fixed, ...dyn];
  } catch {
    // Базата не е достъпна — поне страниците, които не зависят от нея.
    return [...coreFallback, ...fixed];
  }
}
