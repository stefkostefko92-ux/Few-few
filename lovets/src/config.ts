import { z } from 'zod';

const base64Key = z
  .string()
  .refine((v) => Buffer.from(v, 'base64').length === 32, 'трябва да е 32 байта в base64');

const EnvSchema = z.object({
  LOVETS_PEPPER: z.string().min(32),
  JWT_SECRET: z.string().min(32),
  TOTP_KEY: base64Key,
  APP_ORIGIN: z.url(),
  COOKIE_SECURE: z.enum(['true', 'false']).default('true'),
  HTTP_PORT: z.coerce.number().int().min(1).max(65535).default(4360),
  TRUST_PROXY: z.enum(['true', 'false']).default('true'),
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
  };
}
