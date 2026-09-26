import { effectiveVipTier, levelFromXp, type PublicUser } from "@aso/shared";
import type { User } from "@aso/db";

/**
 * Project a DB user into the public shape (never leaks passwordHash).
 * Нивото се смята от `xp` (източникът на истината) — така и старите акаунти,
 * чиято колона `level` е останала 1, показват вярното ниво без миграция.
 * VIP нивото е реално активното (изтекъл абонамент = NONE).
 */
export function toPublicUser(u: User): PublicUser {
  return {
    id: u.id,
    email: u.email,
    emailVerified: u.emailVerified,
    displayName: u.displayName,
    role: u.role,
    locale: u.locale,
    chips: u.chips.toString(), // BigInt -> string for JSON
    gems: u.gems,
    xp: u.xp,
    level: levelFromXp(u.xp).level,
    vipTier: effectiveVipTier(u.vipTier, u.vipUntil),
  };
}
