/** Shared domain constants (no pay-to-win; chips never cashed out). */

export const ROLES = [
  "GUEST",
  "PLAYER",
  "VIP_PLAYER",
  "MODERATOR",
  "SUPPORT",
  "ADMIN",
  "OWNER",
] as const;
export type Role = (typeof ROLES)[number];

export const VIP_TIERS = ["NONE", "SILVER", "GOLD", "PLATINUM"] as const;
export type VipTier = (typeof VIP_TIERS)[number];

export const LOCALES = ["bg", "it", "en"] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = "bg";

/** Starting economy values (mirror Prisma defaults). */
export const STARTING_CHIPS = 1000n;
export const STARTING_GEMS = 0;
export const STARTING_MMR = 1200;

/** Auth cookie names. */
export const ACCESS_COOKIE = "aso_at";
export const REFRESH_COOKIE = "aso_rt";

/** Token lifetimes. */
export const ACCESS_TOKEN_TTL_SEC = 15 * 60; // 15 min
export const REFRESH_TOKEN_TTL_SEC = 30 * 24 * 60 * 60; // 30 days

export const BRAND = {
  name: "АСО",
  attribution: "Created and Designed by Carbon Stealth VCC",
  attributionUrl: "https://carbonstealth.eu",
} as const;
