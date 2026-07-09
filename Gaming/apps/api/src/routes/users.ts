import type { PublicUser } from "@aso/shared";
import type { User } from "@aso/db";

/** Project a DB user into the public shape (never leaks passwordHash). */
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
    level: u.level,
    vipTier: u.vipTier,
  };
}
