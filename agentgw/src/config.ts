import { z } from 'zod';

/**
 * Регионът трябва да е в ЕС — иначе шлюзът отказва да стартира (fail-closed).
 * `eu` = мулти-регионалната ЕС крайна точка на Vertex (aiplatform.eu.rep.googleapis.com).
 * Внимание: единичните региони (`europe-west1` и др.) по документацията поддържат само
 * Claude Sonnet 4.6 и по-стари; Opus 5 / Sonnet 5 вървят през `eu` (или global — забранен тук).
 */
export const EU_REGION = /^(eu|europe-[a-z]+\d+)$/;

const effort = z.enum(['low', 'medium', 'high']);

const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('production'),
  HOST: z.string().default('127.0.0.1'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3070),
  /** Колко обратни проксита стоят отпред (Nginx = 1) — за коректен req.ip. */
  TRUST_PROXY: z.coerce.number().int().min(0).max(5).default(1),
  DATABASE_URL: z.string().min(1, 'Липсва DATABASE_URL'),
  /** Тайна „подправка“ за HMAC хеша на ключовете — сменя ли се, всички ключове стават невалидни. */
  KEY_PEPPER: z.string().min(32, 'KEY_PEPPER трябва да е поне 32 знака'),
  VERTEX_PROJECT_ID: z.string().default(''),
  VERTEX_REGION: z
    .string()
    .default('eu')
    .refine((r) => EU_REGION.test(r), 'VERTEX_REGION трябва да е ЕС регион („eu“ или „europe-…“)'),
  /** Път до JSON на service account (mode 600). Празно → ADC по подразбиране на машината. */
  GOOGLE_APPLICATION_CREDENTIALS: z.string().default(''),
  MODEL_OPUS: z.string().default('claude-opus-5'),
  MODEL_SONNET: z.string().default('claude-sonnet-5'),
  CHAT_EFFORT: effort.default('low'),
  MAX_OUTPUT_TOKENS: z.coerce.number().int().min(256).max(16000).default(4096),
  MAX_MESSAGES: z.coerce.number().int().min(1).max(100).default(20),
  MAX_MESSAGE_CHARS: z.coerce.number().int().min(100).max(50000).default(4000),
  MAX_TOTAL_CHARS: z.coerce.number().int().min(1000).max(200000).default(24000),
  /** Регионалната/мулти-регионалната крайна точка на Vertex е с +10% спрямо global. */
  PRICE_MULTIPLIER: z.coerce.number().min(1).max(3).default(1.1),
  /** Под 120 s на Nginx, за да не харчим за отговор, който никой не чака. */
  UPSTREAM_TIMEOUT_MS: z.coerce.number().int().min(5000).max(115000).default(90000),
  /** Неуспешни опити за ключ от един IP на минута. */
  AUTH_FAIL_PER_MIN: z.coerce.number().int().min(1).max(1000).default(30),
});

export type Config = z.infer<typeof EnvSchema>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const parsed = EnvSchema.safeParse(env);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
    throw new Error(`Невалидна конфигурация: ${issues}`);
  }
  return parsed.data;
}

/** Нормализиран Origin (`https://host[:port]`) или null. http само за localhost (разработка). */
export function normalizeOrigin(value: string): string | null {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  const local = url.hostname === 'localhost' || url.hostname === '127.0.0.1';
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && local)) return null;
  if (url.username || url.password) return null;
  return url.origin;
}
