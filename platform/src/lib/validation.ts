import { z } from "zod";

// Всички външни/потребителски входове минават през Zod.

const slug = z
  .string()
  .trim()
  .min(2, "Твърде кратко.")
  .max(64)
  .regex(/^[a-z0-9-]+$/, "Само малки латински букви, цифри и тире.");

// `z.string().url()` пропуска javascript:/data: схеми — за адреси, които после
// стават href или цел на fetch, ограничаваме до http(s).
const httpUrl = (msg = "Невалиден адрес.") =>
  z
    .string()
    .trim()
    .url(msg)
    .refine((u) => {
      try {
        return /^https?:$/.test(new URL(u).protocol);
      } catch {
        return false;
      }
    }, "Позволени са само http(s) адреси.");

export const siteCreateSchema = z.object({
  name: z.string().trim().min(2, "Въведете име.").max(120),
  slug,
  url: httpUrl("Невалиден адрес (URL)."),
  apiBaseUrl: httpUrl("Невалиден API адрес.").optional().or(z.literal("")),
  apiKey: z.string().trim().max(512).optional().or(z.literal("")),
  deployHookUrl: httpUrl("Невалиден адрес за деплой.")
    .optional()
    .or(z.literal("")),
  notes: z.string().trim().max(4000).optional().or(z.literal("")),
});

export const siteUpdateSchema = siteCreateSchema.partial().extend({
  monitorEnabled: z.boolean().optional(),
});

export const userCreateSchema = z.object({
  name: z.string().trim().min(2, "Въведете име.").max(120),
  email: z.string().trim().toLowerCase().email("Невалиден имейл."),
  password: z
    .string()
    .min(10, "Паролата трябва да е поне 10 знака.")
    .max(200),
  role: z.enum(["OWNER", "MEMBER"]).default("MEMBER"),
});

export const membershipSchema = z.object({
  userId: z.string().min(1),
  siteId: z.string().min(1),
  role: z.enum(["MANAGER", "VIEWER"]).default("VIEWER"),
});

export const linkSchema = z.object({
  label: z.string().trim().min(1, "Въведете етикет.").max(120),
  url: httpUrl(),
  note: z.string().trim().max(500).optional().or(z.literal("")),
});

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email("Невалиден имейл."),
  password: z.string().min(1, "Въведете парола."),
});
