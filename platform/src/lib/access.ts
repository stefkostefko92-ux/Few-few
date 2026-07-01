import { prisma } from "@/lib/prisma";
import type { SessionUser } from "@/lib/auth";
import {
  effectiveSiteRole,
  roleSatisfies,
  canAccessSite,
  type MembershipRef,
  type SiteRole,
  type AccessLevel,
} from "@/lib/access-rules";

export type { SiteRole, AccessLevel, MembershipRef };
export { effectiveSiteRole, roleSatisfies, canAccessSite };

// -------- DB обвивки над чистата логика (@/lib/access-rules) --------

async function loadMemberships(userId: string): Promise<MembershipRef[]> {
  const rows = await prisma.membership.findMany({
    where: { userId },
    select: { siteId: true, role: true },
  });
  return rows.map((r) => ({ siteId: r.siteId, role: r.role as SiteRole }));
}

// Сайтовете, до които потребителят има достъп (OWNER → всички).
export async function accessibleSites(user: SessionUser) {
  if (user.role === "OWNER") {
    return prisma.site.findMany({ orderBy: { name: "asc" } });
  }
  const ids = (await loadMemberships(user.id)).map((m) => m.siteId);
  if (ids.length === 0) return [];
  return prisma.site.findMany({
    where: { id: { in: ids } },
    orderBy: { name: "asc" },
  });
}

// Взима сайт по slug, но само ако потребителят има нужното ниво на достъп.
// Връща { site, role } или null (без достъп / несъществуващ). Никога не
// разкрива съществуването на сайт, до който потребителят няма достъп.
export async function getSiteForUser(
  user: SessionUser,
  slug: string,
  need: AccessLevel = "read",
) {
  const site = await prisma.site.findUnique({ where: { slug } });
  if (!site) return null;
  const memberships = user.role === "OWNER" ? [] : await loadMemberships(user.id);
  const role = effectiveSiteRole(user.role, memberships, site.id);
  if (!roleSatisfies(role, need)) return null;
  return { site, role: role as SiteRole };
}

// Проверка по siteId (за API маршрути/действия). Хвърля при липса на достъп.
export async function assertSiteAccess(
  user: SessionUser,
  siteId: string,
  need: AccessLevel = "read",
): Promise<void> {
  if (user.role === "OWNER") return;
  const memberships = await loadMemberships(user.id);
  if (!canAccessSite(user.role, memberships, siteId, need)) {
    throw new Error("Нямате достъп до този сайт.");
  }
}
