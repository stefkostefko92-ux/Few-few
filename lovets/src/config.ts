import { z } from 'zod';

const base64Key = z
  .string()
  .refine((v) => Buffer.from(v, 'base64').length === 32, 'трябва да е 32 байта в base64');

/** docker-compose подава `${X:-}` като празен низ — той значи „няма стойност“. */
const blank = <T extends z.ZodType>(schema: T) =>
  z.preprocess((v) => (v === '' ? undefined : v), schema);

const EnvSchema = z.object({
  LOVETS_PEPPER: z.string().min(32),
  JWT_SECRET: z.string().min(32),
  TOTP_KEY: base64Key,
  APP_ORIGIN: z.url(),
  COOKIE_SECURE: z.enum(['true', 'false']).default('true'),
  HTTP_PORT: z.coerce.number().int().min(1).max(65535).default(4360),
  TRUST_PROXY: z.enum(['true', 'false']).default('true'),
  /** Ключът на токените за отписване (base64, 32 байта). Без него черновите на писма са изключени. */
  LOVETS_UNSUB_KEY: blank(base64Key.optional()),
  /** Публичният адрес за връзката за отписване; по подразбиране APP_ORIGIN. */
  LOVETS_PUBLIC_URL: blank(z.url().optional()),
  /** Публичното пълно известие за проучването на клиенти (https, без параметри). Без него — без чернови. */
  LOVETS_NOTICE_URL: blank(
    z
      .url()
      .refine(
        (v) => v.startsWith('https://') && !/[?#]/.test(v),
        'https адрес без параметри и котва',
      )
      .optional(),
  ),
  LOVETS_RETENTION_MONTHS: blank(z.coerce.number().int().min(1).max(12).default(6)),
});

export interface AppConfig {
  pepper: string;
  jwtSecret: string;
  /** Ключът (base64, 32 байта), с който TOTP тайната се пази шифрована в базата. */
  totpKey: string;
  appOrigin: string;
  cookieSecure: boolean;
  httpPort: number;
  trustProxy: boolean;
  unsubKey: string | null;
  publicUrl: string;
  noticeUrl: string | null;
  /** Колко месеца пазим данните на контакт без отговор (SPEC инв. 10: 6–12). */
  retentionMonths: number;
}

/** Конфигурацията от средата; тайните идват само от сървъра (mode 600), никога от репото. */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const e = EnvSchema.parse(env);
  return {
    pepper: e.LOVETS_PEPPER,
    jwtSecret: e.JWT_SECRET,
    totpKey: e.TOTP_KEY,
    appOrigin: new URL(e.APP_ORIGIN).origin,
    cookieSecure: e.COOKIE_SECURE === 'true',
    httpPort: e.HTTP_PORT,
    trustProxy: e.TRUST_PROXY === 'true',
    unsubKey: e.LOVETS_UNSUB_KEY ?? null,
    publicUrl: new URL(e.LOVETS_PUBLIC_URL ?? e.APP_ORIGIN).origin,
    noticeUrl: e.LOVETS_NOTICE_URL ?? null,
    retentionMonths: e.LOVETS_RETENTION_MONTHS,
  };
}
