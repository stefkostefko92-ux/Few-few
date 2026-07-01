// Чиста логика за скоуп на достъпа — без база, без Next, за да е лесно тествама.
//
// Правила:
//  • OWNER има достъп до всеки сайт, с права на MANAGER.
//  • MEMBER има достъп само до сайтове, за които има Membership.
//  • За действия (проверка, деплой, редакция) се иска роля MANAGER по сайта.
//  • За четене стига VIEWER.

export type PlatformRole = "OWNER" | "MEMBER";
export type SiteRole = "MANAGER" | "VIEWER";
export type AccessLevel = "read" | "manage";

export type MembershipRef = { siteId: string; role: SiteRole };

// Ефективната роля на потребител спрямо конкретен сайт (или null, ако няма достъп).
export function effectiveSiteRole(
  role: PlatformRole,
  memberships: MembershipRef[],
  siteId: string,
): SiteRole | null {
  if (role === "OWNER") return "MANAGER";
  const m = memberships.find((x) => x.siteId === siteId);
  return m ? m.role : null;
}

export function roleSatisfies(role: SiteRole | null, need: AccessLevel): boolean {
  if (!role) return false;
  if (need === "read") return true; // VIEWER и MANAGER могат да четат
  return role === "MANAGER"; // само MANAGER може да управлява
}

export function canAccessSite(
  role: PlatformRole,
  memberships: MembershipRef[],
  siteId: string,
  need: AccessLevel = "read",
): boolean {
  return roleSatisfies(effectiveSiteRole(role, memberships, siteId), need);
}
