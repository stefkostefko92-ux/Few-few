import { randomBytes } from 'node:crypto';
import { z } from 'zod';

/**
 * Регионът на Vertex трябва да е в държава от ЕС — иначе Отговорко не стартира (fail-closed). Изричен
 * списък, не шаблон: `europe-west2` (Лондон) и `europe-west6` (Цюрих) са „europe-“, но не са в ЕС. Същият
 * списък като в agentgw/src/config.ts (сверен 2026-11-19 по docs.cloud.google.com/vertex-ai/…/locations).
 * Opus 5.5 / Sonnet 5.5 вървят през мулти-региона `eu`.
 */
export const EU_REGIONS: ReadonlySet<string> = new Set([
  'eu',
  'europe-west1',
  'europe-west3',
  'europe-west4',
  'europe-west8',
  'europe-west9',
  'europe-north1',
  'europe-central2',
  'europe-southwest1',
]);

const base64Key = z
  .string()
  .refine((v) => Buffer.from(v, 'base64').length === 32, 'трябва да е 32 байта в base64');
/** Тайна в URL или хедър: само безопасни знаци, поне 32. */
const urlSecret = z.string().regex(/^[A-Za-z0-9_-]{32,128}$/, '32–128 знака [A-Za-z0-9_-]');
const blank = <T extends z.ZodType>(schema: T) =>
  z.preprocess((v) => (v === '' ? undefined : v), schema);
const randomCanary = () => `CS${randomBytes(8).toString('hex').toUpperCase()}`;

const EnvSchema = z.object({
  JWT_SECRET: z.string().min(32),
  TOTP_KEY: base64Key,
  /** Шифърът на писмата в базата (AES-256-GCM). Смяната му прави старите писма нечетими. */
  DATA_KEY: base64Key,
  APP_ORIGIN: z.url(),
  COOKIE_SECURE: z.enum(['true', 'false']).default('true'),
  HTTP_PORT: z.coerce.number().int().min(1).max(65535).default(4380),
  TRUST_PROXY: z.enum(['true', 'false']).default('true'),
  /** Тайният път на webhook-а: /inbound/brevo/<INBOUND_PATH>. */
  INBOUND_PATH: urlSecret,
  /** Bearer токенът, който Brevo праща (webhook `auth: {type: "bearer", token}`). */
  INBOUND_TOKEN: urlSecret,
  VERTEX_PROJECT_ID: blank(z.string().min(1).optional()),
  VERTEX_REGION: z
    .string()
    .default('eu')
    .refine((r) => EU_REGIONS.has(r), 'VERTEX_REGION трябва да е ЕС регион (виж EU_REGIONS)'),
  DRAFT_MODEL: z.enum(['claude-opus-5-5', 'claude-sonnet-5-5']).default('claude-sonnet-5-5'),
  /** Домейните, към които черновата може да има връзки (запетая). Всичко друго → черновата се отказва. */
  ALLOWED_LINK_DOMAINS: z.string().default('carbonstealth.eu'),
  RETENTION_DAYS: blank(z.coerce.number().int().min(30).max(365).default(180)),
  LEAK_CANARY: z
    .string()
    .default('')
    .transform((v) => v || randomCanary())
    .pipe(z.string().regex(/^[A-Z0-9]{12,64}$/, 'LEAK_CANARY: 12–64 главни латински букви/цифри')),
});

export interface AppConfig {
  jwtSecret: string;
  totpKey: string;
  dataKey: string;
  appOrigin: string;
  cookieSecure: boolean;
  httpPort: number;
  trustProxy: boolean;
  inboundPath: string;
  inboundToken: string;
  /** Празно → черновите са изключени (писмата чакат човек). */
  vertexProjectId: string | null;
  vertexRegion: string;
  draftModel: string;
  allowedLinkDomains: string[];
  retentionDays: number;
  leakCanary: string;
}

/** Конфигурацията от средата; тайните идват само от сървъра (mode 600), никога от репото. */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const e = EnvSchema.parse(env);
  return {
    jwtSecret: e.JWT_SECRET,
    totpKey: e.TOTP_KEY,
    dataKey: e.DATA_KEY,
    appOrigin: new URL(e.APP_ORIGIN).origin,
    cookieSecure: e.COOKIE_SECURE === 'true',
    httpPort: e.HTTP_PORT,
    trustProxy: e.TRUST_PROXY === 'true',
    inboundPath: e.INBOUND_PATH,
    inboundToken: e.INBOUND_TOKEN,
    vertexProjectId: e.VERTEX_PROJECT_ID ?? null,
    vertexRegion: e.VERTEX_REGION,
    draftModel: e.DRAFT_MODEL,
    allowedLinkDomains: e.ALLOWED_LINK_DOMAINS.split(',')
      .map((d) => d.trim().toLowerCase())
      .filter(Boolean),
    retentionDays: e.RETENTION_DAYS,
    leakCanary: e.LEAK_CANARY,
  };
}
