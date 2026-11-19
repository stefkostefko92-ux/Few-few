import { randomBytes } from 'node:crypto';
import { z } from 'zod';
import { hasPrice } from './pricing.js';

/**
 * Регионът трябва да е физически в държава от ЕС — иначе шлюзът отказва да стартира (fail-closed).
 * `eu` = мулти-регионалната ЕС крайна точка на Vertex (aiplatform.eu.rep.googleapis.com).
 * Изричен списък, не шаблон: `europe-west2` (Лондон) и `europe-west6` (Цюрих) са „europe-“, но
 * не са в ЕС. Източник: docs.cloud.google.com/vertex-ai/generative-ai/docs/learn/locations
 * (сверено 2026-11-19). Нов ЕС регион = нов ред тук след сверка.
 * Внимание: единичните региони по документацията поддържат само Claude Sonnet 4.6 и по-стари;
 * Opus 5.5 / Sonnet 5.5 вървят през `eu` (или global — забранен тук).
 */
export const EU_REGIONS: ReadonlySet<string> = new Set([
  'eu', // мулти-регион Европейски съюз
  'europe-west1', // Белгия
  'europe-west3', // Франкфурт, Германия
  'europe-west4', // Нидерландия
  'europe-west8', // Милано, Италия
  'europe-west9', // Париж, Франция
  'europe-north1', // Финландия
  'europe-central2', // Варшава, Полша
  'europe-southwest1', // Мадрид, Испания
]);

const effort = z.enum(['low', 'medium', 'high']);

/** Модел без ред в цените не стартира: иначе таксуваме „на сляпо“ (fail-closed). */
const model = z
  .string()
  .refine(hasPrice, 'няма цена за този модел в src/pricing.ts — добави ред от ценоразписа');

/** Случайно за всеки процес — не е в репото и не може да се „заобиколи“ по памет. */
const randomCanary = () => `CS${randomBytes(8).toString('hex').toUpperCase()}`;

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
    .refine(
      (r) => EU_REGIONS.has(r),
      'VERTEX_REGION трябва да е ЕС регион („eu“ или регион на Vertex в държава от ЕС — виж EU_REGIONS)',
    ),
  /** Път до JSON на service account (mode 600). Празно → ADC по подразбиране на машината. */
  GOOGLE_APPLICATION_CREDENTIALS: z.string().default(''),
  // Наличност в мулти-региона `eu` (GA): docs.cloud.google.com/gemini-enterprise-agent-platform/
  // models/partner-models/claude/{opus-5-5,sonnet-5-5} — сверено 2026-11-19.
  MODEL_OPUS: model.default('claude-opus-5-5'),
  MODEL_SONNET: model.default('claude-sonnet-5-5'),
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
  /** Канарче в системния промпт; появи ли се в изхода, потокът спира. Празно → случайно. */
  LEAK_CANARY: z
    .string()
    .default('')
    .transform((v) => v || randomCanary())
    .pipe(z.string().regex(/^[A-Z0-9]{12,64}$/, 'LEAK_CANARY: 12–64 главни латински букви/цифри')),
  /** Откази (refusal/филтър) от един ключ+IP в прозореца, след които следва 429. */
  REFUSAL_STRIKES: z.coerce.number().int().min(1).max(1000).default(5),
  REFUSAL_WINDOW_MIN: z.coerce.number().int().min(1).max(1440).default(15),
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
