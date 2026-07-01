import "server-only";
import { prisma } from "@/lib/prisma";
import type { Locale } from "@/lib/locale";
import type { NavItem } from "@/components/blocks/SiteChrome";

// Меню на публикувания сайт: публикуваните страници с включена навигация,
// подредени по navOrder, после по заглавие. hrefBase е "" при обслужване по
// собствен домейн/поддомейн, или "/site/<slug>" при платформения адрес.
export async function loadSiteNav(
  siteId: string,
  hrefBase: string,
  locale: Locale,
  activeSlug: string,
): Promise<NavItem[]> {
  const pages = await prisma.page.findMany({
    where: { siteId, status: "PUBLISHED", showInNav: true },
    orderBy: [{ isHome: "desc" }, { navOrder: "asc" }, { title: "asc" }],
    select: { slug: true, title: true, titleEn: true, isHome: true },
  });
  const q = locale === "en" ? "?lang=en" : "";
  return pages.map((p) => {
    const home = locale === "en" ? "Home" : "Начало";
    const label = p.isHome
      ? home
      : locale === "en"
        ? p.titleEn || p.title
        : p.title;
    const base = p.isHome ? hrefBase || "/" : `${hrefBase}/${p.slug}`;
    return { href: `${base}${q}`, label, active: p.slug === activeSlug };
  });
}
