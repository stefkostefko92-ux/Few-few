import { z } from "zod";
import { LOCALES } from "./constants.js";

/**
 * Auth payload schemas. Every external input crosses a zod schema before it
 * reaches business logic (S7.3 / S21).
 */

export const emailSchema = z.string().trim().toLowerCase().email().max(254);

export const passwordSchema = z
  .string()
  .min(8, "Паролата трябва да е поне 8 символа")
  .max(200);

export const displayNameSchema = z
  .string()
  .trim()
  .min(2, "Името трябва да е поне 2 символа")
  .max(32);

export const registerSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
  displayName: displayNameSchema,
  locale: z.enum(LOCALES).optional(),
});

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1).max(200),
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;

/** Shape of the JWT access-token claims. */
export interface AccessTokenClaims {
  sub: string; // userId
  role: string;
  locale: string;
}

/** Public user projection returned to the client (never includes passwordHash). */
export interface PublicUser {
  id: string;
  email: string;
  displayName: string;
  role: string;
  locale: string;
  chips: string; // BigInt serialized as string
  gems: number;
  xp: number;
  level: number;
  vipTier: string;
}
